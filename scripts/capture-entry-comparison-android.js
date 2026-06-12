"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "data", "finance-pwa-screenshots");
const SERIAL = process.env.ADB_SERIAL || "";
const FINANCE_URL = process.env.FINANCE_ANDROID_URL || "http://127.0.0.1:8791/finance.html";
const WACAI_PACKAGE = "com.wacai365";
const WACAI_ACTIVITY = "com.wacai.launch.LauncherActivity";

function adb(args, options = {}) {
  const fullArgs = SERIAL ? ["-s", SERIAL, ...args] : args;
  return execFileSync("adb", fullArgs, {
    cwd: ROOT,
    encoding: options.encoding || "utf8",
    stdio: options.stdio || ["ignore", "pipe", "pipe"],
  });
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function ensureOutDir() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

function timestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function shell(command) {
  return adb(["shell", ...command]);
}

function dumpUi(name) {
  const xml = adb(["exec-out", "uiautomator", "dump", "/dev/tty"]);
  const clean = xml.replace(/UI hierchary dumped to: \/dev\/tty\s*$/i, "");
  const file = path.join(OUT_DIR, `${name}.xml`);
  fs.writeFileSync(file, clean, "utf8");
  return { xml: clean, file };
}

function waitForUi(name, predicate, timeoutMs = 30000, intervalMs = 2000) {
  const end = Date.now() + timeoutMs;
  let last = null;
  let attempt = 0;
  while (Date.now() < end) {
    last = dumpUi(`${name}-${attempt}`);
    if (predicate(last.xml)) return last;
    attempt += 1;
    sleep(intervalMs);
  }
  return last;
}

function capture(name) {
  const file = path.join(OUT_DIR, `${name}.png`);
  const png = adb(["exec-out", "screencap", "-p"], { encoding: "buffer" });
  fs.writeFileSync(file, png);
  return file;
}

function parseBounds(bounds) {
  const match = String(bounds || "").match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
  if (!match) return null;
  const [, x1, y1, x2, y2] = match.map(Number);
  return { x: Math.round((x1 + x2) / 2), y: Math.round((y1 + y2) / 2) };
}

function findNodeBounds(xml, matcher) {
  const nodePattern = /<node\b[^>]*>/g;
  let match;
  while ((match = nodePattern.exec(xml))) {
    const node = match[0];
    if (!matcher(node)) continue;
    const bounds = node.match(/bounds="([^"]+)"/)?.[1];
    const point = parseBounds(bounds);
    if (point) return point;
  }
  return null;
}

function tap(point, fallback) {
  const target = point || fallback;
  if (!target) throw new Error("missing tap target");
  shell(["input", "tap", String(target.x), String(target.y)]);
}

function setIphoneLikeResolution() {
  shell(["wm", "size", "1320x2868"]);
  shell(["wm", "density", "460"]);
}

function openWacaiFromLauncher(runId) {
  shell(["am", "force-stop", WACAI_PACKAGE]);
  shell(["input", "keyevent", "HOME"]);
  sleep(1500);
  shell(["input", "swipe", "660", "2600", "660", "600", "800"]);
  sleep(1500);
  let ui = dumpUi(`${runId}-launcher-drawer`).xml;
  let icon = findNodeBounds(ui, (node) => node.includes('text="挖财记账"') || node.includes('content-desc="挖财记账"'));
  if (!icon) {
    shell(["am", "start", "-n", `${WACAI_PACKAGE}/${WACAI_ACTIVITY}`]);
  } else {
    tap(icon);
  }
  let loaded = waitForUi(`${runId}-wacai-home`, (xml) => xml.includes("日常账本") || xml.includes("本年支出"), 30000);
  if (!loaded?.xml || (!loaded.xml.includes("日常账本") && !loaded.xml.includes("本年支出"))) {
    shell(["am", "start", "-n", `${WACAI_PACKAGE}/${WACAI_ACTIVITY}`]);
    loaded = waitForUi(`${runId}-wacai-home-retry`, (xml) => xml.includes("日常账本") || xml.includes("本年支出"), 30000);
  }
  if (!loaded?.xml || (!loaded.xml.includes("日常账本") && !loaded.xml.includes("本年支出"))) {
    throw new Error("Wacai did not reach a loaded home screen");
  }
  ui = loaded.xml;
  const centerEntry = findNodeBounds(ui, (node) => node.includes("第 3 个标签，共 5 个"));
  tap(centerEntry, { x: 660, y: 2700 });
  const entryUi = waitForUi(`${runId}-wacai-entry`, (xml) => xml.includes("保存") && xml.includes("支出") && xml.includes("收入"), 20000);
  if (!entryUi?.xml || !entryUi.xml.includes("保存")) {
    tap(centerEntry, { x: 660, y: 2700 });
    const retry = waitForUi(`${runId}-wacai-entry-retry`, (xml) => xml.includes("保存") && xml.includes("支出"), 15000);
    if (!retry?.xml || !retry.xml.includes("保存")) throw new Error("Wacai did not reach entry screen");
  }
  return capture(`${runId}-wacai-entry`);
}

function openFinanceEntry(runId) {
  shell(["am", "force-stop", "com.android.chrome"]);
  shell([
    "am",
    "start",
    "-W",
    "-a",
    "android.intent.action.VIEW",
    "-c",
    "android.intent.category.BROWSABLE",
    "-d",
    `${FINANCE_URL}?fresh=${runId}`,
    "com.android.chrome",
  ]);
  let loaded = waitForUi(`${runId}-finance-home`, (xml) => xml.includes("日常账本") && xml.includes("记账"), 30000);
  if (!loaded?.xml || !loaded.xml.includes("记账")) {
    shell([
      "am",
      "start",
      "-W",
      "-a",
      "android.intent.action.VIEW",
      "-c",
      "android.intent.category.BROWSABLE",
      "-d",
      `${FINANCE_URL}?fresh=${runId}-retry`,
      "com.android.chrome",
    ]);
    loaded = waitForUi(`${runId}-finance-home-retry`, (xml) => xml.includes("日常账本") && xml.includes("记账"), 30000);
  }
  if (!loaded?.xml || !loaded.xml.includes("记账")) throw new Error("Finance did not reach a loaded home screen");
  let ui = loaded.xml;
  const entry = findNodeBounds(ui, (node) => node.includes('text="记账"') && node.includes("android.widget.Button"));
  tap(entry, { x: 660, y: 2700 });
  let entryUi = waitForUi(`${runId}-finance-entry`, (xml) => xml.includes("金额键盘") && xml.includes("保存"), 20000);
  if (!entryUi?.xml || !entryUi.xml.includes("金额键盘")) {
    tap(entry, { x: 660, y: 2700 });
    entryUi = waitForUi(`${runId}-finance-entry-retry`, (xml) => xml.includes("金额键盘") && xml.includes("保存"), 15000);
  }
  if (!entryUi?.xml || !entryUi.xml.includes("金额键盘")) throw new Error("Finance did not reach entry screen");
  return capture(`${runId}-finance-entry`);
}

function main() {
  ensureOutDir();
  setIphoneLikeResolution();
  const runId = `entry-compare-${timestamp()}`;
  const wacai = openWacaiFromLauncher(runId);
  const finance = openFinanceEntry(runId);
  console.log(JSON.stringify({ runId, resolution: "1320x2868@460", wacai, finance }, null, 2));
}

main();
