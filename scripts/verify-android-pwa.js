"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const args = new Map();
for (const raw of process.argv.slice(2)) {
  const [key, value] = raw.split("=");
  args.set(key, value ?? "true");
}

const serial = args.get("--serial") || process.env.ADB_SERIAL || "";
const origin = args.get("--origin") || "http://127.0.0.1:8791";
const startPath = args.get("--path") || "/finance.html";
const appLabel = args.get("--label") || "Finance";
const outDir = path.resolve(args.get("--out") || path.join("data", "finance-pwa-screenshots"));
const install = args.has("--install");
const reboot = args.has("--reboot");
const allowShortcut = args.has("--allow-shortcut");
const clearChromeShortcuts = args.has("--clear-chrome-shortcuts");
let lastEvidence = {
  deviceId: serial || "",
  installedOrReusedShortcut: install ? "installed_or_refreshed" : "reused_existing",
  launchMethod: "Launcher PWA icon",
  screenshotPath: "",
  pageOrFeature: "Finance standalone PWA root",
  failureKind: "",
};

function runAdb(parts, options = {}) {
  const full = serial ? ["-s", serial, ...parts] : parts;
  const result = spawnSync("adb", full, { encoding: "utf8", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`adb ${full.join(" ")} failed:\n${result.stderr || result.stdout}`);
  }
  return result.stdout || "";
}

function adbDevices() {
  const output = spawnSync("adb", ["devices"], { encoding: "utf8" });
  if (output.error) throw output.error;
  if (output.status !== 0) throw new Error(`adb devices failed:\n${output.stderr || output.stdout}`);
  const devices = (output.stdout || "")
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts.length >= 2 && parts[1] === "device")
    .map((parts) => parts[0]);
  if (!devices.length) throw new Error("No Android emulator/device is connected. Run adb devices and start or connect one device first.");
  if (serial && !devices.includes(serial)) throw new Error(`ADB_SERIAL ${serial} is not connected. Connected devices: ${devices.join(", ")}`);
  const deviceId = serial || devices[0];
  lastEvidence.deviceId = deviceId;
  return { deviceId, devices };
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function ensureOutDir() {
  fs.mkdirSync(outDir, { recursive: true });
}

function artifact(name) {
  return path.join(outDir, name);
}

function dumpUi(name) {
  const xml = runAdb(["exec-out", "uiautomator", "dump", "/dev/tty"], { allowFailure: true });
  fs.writeFileSync(artifact(`${name}.xml`), xml, "utf8");
  return xml;
}

function screenshot(name) {
  const remote = `/data/local/tmp/${name}.png`;
  const local = artifact(`${name}.png`);
  runAdb(["shell", "screencap", "-p", remote], { allowFailure: true });
  runAdb(["pull", remote, local], { allowFailure: true });
  return local;
}

function center(bounds) {
  const match = /\[(\d+),(\d+)]\[(\d+),(\d+)]/.exec(bounds || "");
  if (!match) return null;
  const [, x1, y1, x2, y2] = match.map(Number);
  return [Math.round((x1 + x2) / 2), Math.round((y1 + y2) / 2)];
}

function findNodeBounds(xml, patterns) {
  const nodes = xml.match(/<node\b[^>]*>/g) || [];
  for (const pattern of patterns) {
    for (const node of nodes) {
      if (!pattern.test(node)) continue;
      const match = /bounds="([^"]+)"/.exec(node);
      if (match) return match[1];
    }
  }
  return null;
}

function tapBounds(bounds, label) {
  const point = center(bounds);
  if (!point) throw new Error(`Cannot tap ${label}; missing bounds`);
  runAdb(["shell", "input", "tap", String(point[0]), String(point[1])]);
}

function dismissChromeDialogs(xml) {
  const bounds = findNodeBounds(xml, [
    /text="Got it"/,
    /text="Accept"/,
    /text="No thanks"/,
    /text="Not now"/,
  ]);
  if (!bounds) return false;
  tapBounds(bounds, "Chrome dialog");
  sleep(2500);
  return true;
}

function waitForBoot() {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const boot = runAdb(["shell", "getprop", "sys.boot_completed"], { allowFailure: true }).trim();
    if (boot === "1") return;
    sleep(3000);
  }
  throw new Error("Android emulator did not finish booting within 120s");
}

function prepareDevice() {
  if (reboot) {
    runAdb(["reboot"], { allowFailure: true });
    sleep(8000);
    waitForBoot();
  }
  runAdb(["shell", "input", "keyevent", "KEYCODE_WAKEUP"], { allowFailure: true });
  runAdb(["shell", "input", "keyevent", "KEYCODE_MENU"], { allowFailure: true });
  runAdb(["reverse", "tcp:8791", "tcp:8791"], { allowFailure: true });
  if (clearChromeShortcuts) {
    runAdb(["shell", "cmd", "shortcut", "clear-shortcuts", "com.android.chrome"], { allowFailure: true });
  }
}

function setChromeSecureOriginFlag() {
  const commandLine = `chrome --unsafely-treat-insecure-origin-as-secure=${origin} --user-data-dir=/data/local/tmp/chrome-profile`;
  runAdb(["shell", `echo '${commandLine}' > /data/local/tmp/chrome-command-line`]);
  runAdb(["shell", "am", "force-stop", "com.android.chrome"], { allowFailure: true });
}

function openChrome() {
  const url = `${origin}${startPath}?pwaHarness=${Date.now()}`;
  const startUrl = () => runAdb([
    "shell", "am", "start", "-W",
    "-a", "android.intent.action.VIEW",
    "-c", "android.intent.category.BROWSABLE",
    "-d", url,
    "com.android.chrome",
  ]);
  startUrl();
  sleep(9000);
  let xml = dumpUi("pwa-open-page-before-dialog-dismiss");
  if (/resource-id="com\.android\.chrome:id\/url_bar"[^>]*focused="true"/.test(xml)) {
    runAdb(["shell", "input", "keyevent", "KEYCODE_ENTER"]);
    sleep(9000);
    xml = dumpUi("pwa-open-page-after-enter");
  }
  if (dismissChromeDialogs(xml)) sleep(3000);
  startUrl();
  sleep(9000);
  xml = dumpUi("pwa-open-page-after-sw-reopen");
  if (/resource-id="com\.android\.chrome:id\/url_bar"[^>]*focused="true"/.test(xml)) {
    runAdb(["shell", "input", "keyevent", "KEYCODE_ENTER"]);
    sleep(9000);
  }
  screenshot("pwa-open-page-browser-mode-diagnostic");
}

function installFromChromeMenu() {
  let xml = dumpUi("pwa-before-menu");
  let menuBounds = findNodeBounds(xml, [
    /resource-id="com\.android\.chrome:id\/menu_button"/,
    /content-desc="[^"]*More options"/,
  ]);
  if (menuBounds) {
    tapBounds(menuBounds, "Chrome menu button");
  } else {
    runAdb(["shell", "input", "tap", "1250", "240"]);
  }
  sleep(2000);
  xml = dumpUi("pwa-chrome-menu");
  screenshot("pwa-chrome-menu");
  let bounds = findNodeBounds(xml, [
    /text="Install app"/,
    /text="\u5b89\u88c5\u5e94\u7528"/,
    /resource-id="com\.android\.chrome:id\/install_webapp_id"/,
  ]);
  if (!bounds) {
    const shortcutBounds = findNodeBounds(xml, [
      /text="Add to Home screen"/,
      /text="\u6dfb\u52a0\u5230\u4e3b\u5c4f\u5e55"/,
      /resource-id="com\.android\.chrome:id\/universal_install"/,
    ]);
    bounds = shortcutBounds;
  }
  if (!bounds) throw new Error("Chrome menu did not expose Install app or Add to Home screen");
  tapBounds(bounds, "Chrome install menu item");
  sleep(3000);
  xml = dumpUi("pwa-install-dialog");
  screenshot("pwa-install-dialog");
  const installOptionBounds = findNodeBounds(xml, [
    /resource-id="com\.android\.chrome:id\/option_install"/,
    /text="\u5b89\u88c5"/,
  ]);
  if (installOptionBounds) {
    tapBounds(installOptionBounds, "Chrome install option");
    sleep(3000);
    xml = dumpUi("pwa-install-confirmation");
    screenshot("pwa-install-confirmation");
  }
  bounds = findNodeBounds(xml, [
    /resource-id="com\.android\.chrome:id\/positive_button"/,
    /text="Install"/,
    /text="Add"/,
    /text="\u5b89\u88c5"/,
    /text="\u6dfb\u52a0"/,
  ]);
  if (!bounds) throw new Error("Install confirmation dialog did not expose Install/Add");
  tapBounds(bounds, "install confirmation");
  sleep(8000);
}

function launchFromHome() {
  runAdb(["shell", "input", "keyevent", "KEYCODE_HOME"]);
  sleep(2000);
  let xml = dumpUi("pwa-launcher");
  const launcherScreenshotPath = screenshot("pwa-launcher");
  const bounds = findNodeBounds(xml, [
    new RegExp(`text="${appLabel}"`),
    new RegExp(`content-desc="${appLabel}"`),
    /text="Finance MCP"/,
    /content-desc="Finance MCP"/,
  ]);
  if (!bounds) throw new Error(`Launcher does not contain ${appLabel}`);
  tapBounds(bounds, appLabel);
  sleep(8000);
  xml = dumpUi("pwa-launched");
  if (dismissChromeDialogs(xml)) {
    sleep(4000);
    xml = dumpUi("pwa-launched");
  }
  const screenshotPath = screenshot("pwa-launched");
  lastEvidence.screenshotPath = screenshotPath;
  return { xml, launcherScreenshotPath, screenshotPath };
}

function assertStandalone(xml) {
  const hasChromeToolbar = /resource-id="com\.android\.chrome:id\/(?:toolbar|url_bar|control_container)"/.test(xml);
  const hasFinanceText = /日常账本|本月支出|首页|报表|Finance MCP/.test(xml);
  if (hasChromeToolbar && !allowShortcut) {
    throw new Error("Launcher entry opened with Chrome toolbar/address bar. This is not a standalone PWA.");
  }
  if (!hasFinanceText && !/Web View/.test(xml)) {
    throw new Error("Launcher entry did not show Finance content or a WebView");
  }
}

function classifyFailure(error) {
  const message = error.message || String(error);
  if (/Chrome toolbar|address bar|browser-mode/i.test(message)) return "browser-mode failure";
  if (/Launcher does not contain|Install app|Add to Home screen|confirmation dialog|standalone PWA/i.test(message)) return "PWA failure";
  if (/proxy|resource|manifest/i.test(message)) return "proxy/resource failure";
  if (/adb|device|emulator|boot/i.test(message)) return "device failure";
  return "PWA failure";
}

function printEvidence(extra = {}) {
  console.log(JSON.stringify({
    ok: !extra.failureKind,
    origin,
    deviceId: lastEvidence.deviceId,
    installedOrReusedShortcut: lastEvidence.installedOrReusedShortcut,
    launchMethod: lastEvidence.launchMethod,
    screenshotPath: lastEvidence.screenshotPath,
    pageOrFeature: lastEvidence.pageOrFeature,
    failureKind: extra.failureKind || "",
    browserModeIsDiagnosticOnly: true,
    outDir,
    standaloneRequired: !allowShortcut,
    chromeShortcutsCleared: clearChromeShortcuts,
    ...extra,
  }, null, 2));
}

function main() {
  ensureOutDir();
  adbDevices();
  prepareDevice();
  setChromeSecureOriginFlag();
  if (install) {
    openChrome();
    installFromChromeMenu();
  }
  const { xml } = launchFromHome();
  assertStandalone(xml);
  printEvidence({ installed: install });
}

try {
  main();
} catch (error) {
  const failureKind = classifyFailure(error);
  lastEvidence.failureKind = failureKind;
  printEvidence({ failureKind, error: error.message || String(error) });
  process.exit(1);
}
