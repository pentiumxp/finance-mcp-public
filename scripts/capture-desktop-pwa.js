"use strict";

const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT = process.cwd();
const CHROME = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const URL = process.env.FINANCE_DESKTOP_PWA_URL || "http://127.0.0.1:8791/finance.html?source=pwa";
const OUT_DIR = path.resolve(process.env.FINANCE_PWA_OUT || path.join(ROOT, "data", "finance-pwa-screenshots"));
const WIDTH = Number(process.env.FINANCE_PWA_WIDTH || 591);
const HEIGHT = Number(process.env.FINANCE_PWA_HEIGHT || 812);
const DEVICE_SCALE_FACTOR = Number(process.env.FINANCE_PWA_DPR || 1);
const PORT = Number(process.env.FINANCE_CHROME_DEBUG_PORT || 9231);
const REQUIRE_REAL_PROBE = process.env.FINANCE_REQUIRE_REAL_PROBE === "1";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requestJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    }).on("error", reject);
  });
}

function requestText(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => resolve(body));
    }).on("error", reject);
  });
}

async function waitForDebugTarget() {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const pages = await requestJson(`http://127.0.0.1:${PORT}/json`);
      const page = pages.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
      if (page) return page;
    } catch (_) {
      await sleep(500);
    }
  }
  throw new Error("Chrome debug target did not become ready");
}

function connectCdp(wsUrl) {
  const socket = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message || JSON.stringify(message.error)));
    else resolve(message.result || {});
  });
  return new Promise((resolve, reject) => {
    socket.addEventListener("open", () => {
      resolve({
        send(method, params = {}) {
          const nextId = ++id;
          socket.send(JSON.stringify({ id: nextId, method, params }));
          return new Promise((sendResolve, sendReject) => {
            pending.set(nextId, { resolve: sendResolve, reject: sendReject });
          });
        },
        close() {
          socket.close();
        },
      });
    });
    socket.addEventListener("error", reject);
  });
}

async function waitForFinanceReady(client) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const result = await client.send("Runtime.evaluate", {
      expression: "Boolean(document.querySelector('[data-nav-view=\"entry\"]'))",
      returnByValue: true,
    });
    if (result.result?.value) return;
    await sleep(500);
  }
  throw new Error("Finance UI did not become ready");
}

async function waitForEntryCategories(client) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const result = await client.send("Runtime.evaluate", {
      expression: "document.querySelectorAll('[data-category-quick]').length",
      returnByValue: true,
    });
    if (Number(result.result?.value || 0) >= 12) return;
    await sleep(250);
  }
  throw new Error("Finance entry categories did not render");
}

async function measureEntryLayout(client) {
  const result = await client.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const rect = (selector) => {
        const node = document.querySelector(selector);
        if (!node) return null;
        const r = node.getBoundingClientRect();
        return { top: r.top, right: r.right, bottom: r.bottom, left: r.left, width: r.width, height: r.height };
      };
      const chipRects = [...document.querySelectorAll("[data-category-quick]")].map((node) => {
        const r = node.getBoundingClientRect();
        return { label: node.textContent.trim(), top: r.top, bottom: r.bottom, left: r.left, height: r.height };
      });
      const noteButton = rect("[data-entry-note-label]");
      const meta = rect(".wacai-entry-meta");
      const camera = rect(".wacai-camera-button");
      const metaControls = [...document.querySelectorAll(".wacai-entry-meta :is(input, select, button)")].map((node) => {
        const r = node.getBoundingClientRect();
        return { tag: node.tagName, className: node.className, top: r.top, bottom: r.bottom, height: r.height };
      }).filter((item) => item.height > 1);
      const keypad = rect(".wacai-keypad");
      const current = rect(".finance-entry-category-current");
      const grid = rect(".finance-entry-category-grid");
      const rows = [];
      for (const chip of chipRects) {
        let row = rows.find((item) => Math.abs(item.top - chip.top) < 3);
        if (!row) {
          row = { top: chip.top, bottom: chip.bottom, count: 0, labels: [] };
          rows.push(row);
        }
        row.count += 1;
        row.bottom = Math.max(row.bottom, chip.bottom);
        row.labels.push(chip.label);
      }
      rows.sort((a, b) => a.top - b.top);
      const noteTop = meta ? meta.top : window.innerHeight;
      const fullRowsBeforeNote = rows.filter((row) => row.bottom <= noteTop - 4).length;
      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        current,
        grid,
        noteButton,
        meta,
        camera,
        metaControls,
        keypad,
        rows,
        fullRowsBeforeNote,
      };
    })()`,
  });
  return result.result?.value || {};
}

function assertEntryLayout(layout) {
  const failures = [];
  const { viewport, current, noteButton, meta, camera, metaControls = [], keypad, fullRowsBeforeNote } = layout;
  if (!viewport || !current || !noteButton || !meta || !keypad || !camera) {
    failures.push("missing required entry layout nodes");
  } else {
    if (current.top > viewport.height * 0.24) {
      failures.push(`current card starts too low: ${current.top.toFixed(1)}px of ${viewport.height}px`);
    }
    if (fullRowsBeforeNote < 4) {
      failures.push(`only ${fullRowsBeforeNote} full category rows visible before meta row`);
    }
    if (camera.left - noteButton.right < 6) {
      failures.push(`note button overlaps camera button: note.right=${noteButton.right.toFixed(1)}, camera.left=${camera.left.toFixed(1)}`);
    }
    if (meta.bottom > keypad.top + 2) {
      failures.push(`meta row overlaps keypad: meta.bottom=${meta.bottom.toFixed(1)}, keypad.top=${keypad.top.toFixed(1)}`);
    }
    if (Math.abs(camera.height - 32) > 1) {
      failures.push(`camera button height is not aligned: ${camera.height.toFixed(1)}px`);
    }
    if (viewport.width - camera.right > 18) {
      failures.push(`camera button is not pinned near the right edge: right gap ${(viewport.width - camera.right).toFixed(1)}px`);
    }
    for (const control of metaControls) {
      if (Math.abs(control.height - 32) > 1) {
        failures.push(`meta control height mismatch: ${control.tag}.${control.className}=${control.height.toFixed(1)}px`);
      }
    }
    if (keypad.top < viewport.height * 0.70 || keypad.top > viewport.height * 0.80) {
      failures.push(`keypad starts outside expected band: ${keypad.top.toFixed(1)}px of ${viewport.height}px`);
    }
  }
  if (failures.length) {
    const detail = JSON.stringify({ failures, layout }, null, 2);
    throw new Error(`Entry layout contract failed:\n${detail}`);
  }
}

async function measureEntryNoteFocusLayout(client) {
  const result = await client.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const rect = (selector) => {
        const node = document.querySelector(selector);
        if (!node) return null;
        const r = node.getBoundingClientRect();
        return { top: r.top, right: r.right, bottom: r.bottom, left: r.left, width: r.width, height: r.height };
      };
      document.querySelector("[data-entry-note-label]")?.click();
      const editor = document.querySelector("[data-entry-note-editor]");
      editor?.focus({ preventScroll: true });
      const keyboard = 320;
      const visualBottom = Math.max(0, window.innerHeight - keyboard);
      const sheet = document.querySelector(".finance-entry-note-sheet");
      const sheetHeight = Math.max(160, Math.round(sheet?.getBoundingClientRect().height || 0));
      document.documentElement.style.setProperty("--finance-app-height", visualBottom + "px");
      document.documentElement.style.setProperty("--finance-keyboard-bottom", keyboard + "px");
      document.documentElement.style.setProperty("--finance-visual-bottom", visualBottom + "px");
      document.documentElement.style.setProperty("--finance-note-bottom-edge", visualBottom + "px");
      document.documentElement.style.setProperty("--finance-note-sheet-height", sheetHeight + "px");
      document.documentElement.classList.add("finance-input-focus", "finance-entry-note-focus", "finance-native-keyboard-visible");
      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        visualBottom,
        overlay: rect("[data-entry-note-overlay]"),
        sheet: rect(".finance-entry-note-sheet"),
        editor: rect("[data-entry-note-editor]"),
        scrollY: window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0,
      };
    })()`,
  });
  return result.result?.value || {};
}

function assertEntryNoteFocusLayout(layout) {
  const failures = [];
  const { viewport, visualBottom, sheet, editor } = layout;
  if (!viewport || !sheet || !editor || !visualBottom) {
    failures.push("missing required entry note focus layout nodes");
  } else {
    if (sheet.top < 64) {
      failures.push(`note focus sheet is pinned too high: top=${sheet.top.toFixed(1)}px`);
    }
    if (Math.abs((layout.overlay?.height || 0) - visualBottom) > 8) {
      failures.push(`note overlay height does not match visual viewport: overlay.height=${(layout.overlay?.height || 0).toFixed(1)}, visualBottom=${visualBottom.toFixed(1)}`);
    }
    if (sheet.bottom > visualBottom + 4) {
      failures.push(`note focus sheet is covered by keyboard: bottom=${sheet.bottom.toFixed(1)}, visualBottom=${visualBottom.toFixed(1)}`);
    }
    if (Math.abs(sheet.bottom - visualBottom) > 42) {
      failures.push(`note focus sheet is not pinned near the visual viewport bottom: bottom=${sheet.bottom.toFixed(1)}, visualBottom=${visualBottom.toFixed(1)}`);
    }
    if (editor.height < 80) {
      failures.push(`note editor is too short after focus: ${editor.height.toFixed(1)}px`);
    }
  }
  if (failures.length) {
    const detail = JSON.stringify({ failures, layout }, null, 2);
    throw new Error(`Entry note focus layout contract failed:\n${detail}`);
  }
}

function entryLayoutFromProbe(record) {
  const probe = record?.probe || record;
  if (!probe || probe.activeView !== "entry") return null;
  return {
    viewport: {
      width: probe.viewport?.innerWidth,
      height: probe.viewport?.innerHeight,
    },
    current: probe.rects?.currentCategory,
    grid: probe.rects?.categoryGrid,
    noteButton: probe.rects?.noteButton,
    meta: probe.rects?.metaRow,
    camera: probe.rects?.cameraButton,
    metaControls: probe.rects?.metaControls || [],
    keypad: probe.rects?.keypad,
    rows: probe.categoryRows || [],
    fullRowsBeforeNote: probe.fullCategoryRowsBeforeNote || 0,
    source: {
      receivedAt: record?.receivedAt || "",
      userAgent: record?.userAgent || "",
      assetVersion: probe.assetVersion || {},
      displayMode: probe.displayMode || {},
      safeArea: probe.safeArea || {},
      viewport: probe.viewport || {},
    },
  };
}

async function currentAssetVersion() {
  const html = await requestText(URL);
  const style = /styles\.css\?v=([^"']+)/.exec(html)?.[1] || "";
  const script = /app-finance-ui\.js\?v=([^"']+)/.exec(html)?.[1] || "";
  return { style, script };
}

async function latestRealProbe(expectedAssets) {
  try {
    const latestUrl = new globalThis.URL("/api/finance/ui-probe/latest", URL).toString();
    const payload = await requestJson(latestUrl);
    const record = payload.result;
    if (!record?.probe) return null;
    const receivedAt = Date.parse(record.receivedAt || "");
    const ageMs = Number.isFinite(receivedAt) ? Date.now() - receivedAt : Infinity;
    const probeAssets = record.probe.assetVersion || {};
    const versionMatches = (!expectedAssets.script || probeAssets.script === expectedAssets.script)
      && (!expectedAssets.style || probeAssets.style === expectedAssets.style);
    return {
      record,
      ageMs,
      versionMatches,
      expectedAssets,
      probeAssets,
    };
  } catch (_) {
    return null;
  }
}

async function waitForLatestRealProbe(expectedAssets, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await latestRealProbe(expectedAssets);
    if (last?.record) return last;
    await sleep(250);
  }
  return last;
}

function isLoopbackAddress(address = "") {
  const value = String(address || "").toLowerCase();
  return value === "127.0.0.1"
    || value === "::1"
    || value === "::ffff:127.0.0.1"
    || value === "localhost";
}

function isStandaloneRealDeviceProbe(record) {
  const displayMode = record?.probe?.displayMode || {};
  return !isLoopbackAddress(record?.remoteAddress || "") && (displayMode.standalone || displayMode.navigatorStandalone);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  if (!fs.existsSync(CHROME)) throw new Error(`Chrome not found: ${CHROME}`);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "finance-pwa-chrome-"));
  const chrome = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--hide-scrollbars",
    `--window-size=${WIDTH},${HEIGHT}`,
    URL,
  ], { stdio: "ignore" });
  try {
    const page = await waitForDebugTarget();
    const client = await connectCdp(page.webSocketDebuggerUrl);
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: WIDTH,
      height: HEIGHT,
      deviceScaleFactor: DEVICE_SCALE_FACTOR,
      mobile: true,
      screenWidth: WIDTH,
      screenHeight: HEIGHT,
    });
    await client.send("Page.navigate", { url: URL });
    await client.send("Page.loadEventFired").catch(() => {});
    await waitForFinanceReady(client);
    const manifest = await client.send("Page.getAppManifest");
    const expectedAssets = await currentAssetVersion();
    await client.send("Runtime.evaluate", {
      expression: "document.querySelector('[data-nav-view=\"entry\"]').click()",
      returnByValue: true,
    });
    await waitForEntryCategories(client);
    await sleep(300);
    const layout = await measureEntryLayout(client);
    assertEntryLayout(layout);
    const noteFocusLayout = await measureEntryNoteFocusLayout(client);
    assertEntryNoteFocusLayout(noteFocusLayout);
    if (!REQUIRE_REAL_PROBE) {
      await client.send("Runtime.evaluate", {
        expression: `(() => {
          const fallback = {
            reason: "desktop-harness-fallback",
            activeView: "entry",
            capturedAt: new Date().toISOString(),
            assetVersion: ${JSON.stringify(expectedAssets)},
            viewport: { innerWidth: window.innerWidth, innerHeight: window.innerHeight },
            rects: {
              currentCategory: ${JSON.stringify(layout.current)},
              categoryGrid: ${JSON.stringify(layout.grid)},
              noteButton: ${JSON.stringify(layout.noteButton)},
              metaRow: ${JSON.stringify(layout.meta)},
              cameraButton: ${JSON.stringify(layout.camera)},
              metaControls: ${JSON.stringify(layout.metaControls)},
              keypad: ${JSON.stringify(layout.keypad)}
            },
            categoryRows: ${JSON.stringify(layout.rows)},
            fullCategoryRowsBeforeNote: ${JSON.stringify(layout.fullRowsBeforeNote)}
          };
          const payload = window.__financeCollectUiProbe ? window.__financeCollectUiProbe("desktop-harness") : fallback;
          return fetch("/api/finance/ui-probe", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
            keepalive: false
          }).then(() => payload.reason);
        })()`,
        awaitPromise: true,
        returnByValue: true,
      });
    }
    const realProbe = await waitForLatestRealProbe(expectedAssets);
    let realProbeLayout = null;
    let realProbeStatus = "missing";
    if (realProbe?.record) {
      realProbeLayout = entryLayoutFromProbe(realProbe.record);
      if (REQUIRE_REAL_PROBE && !isStandaloneRealDeviceProbe(realProbe.record)) {
        realProbeStatus = "not_real_standalone_device";
      } else if (!realProbe.versionMatches) {
        realProbeStatus = "version_mismatch";
      } else if (realProbe.ageMs > 10 * 60 * 1000) {
        realProbeStatus = "stale";
      } else if (!realProbeLayout) {
        realProbeStatus = "not_entry_view";
      } else {
        assertEntryLayout(realProbeLayout);
        realProbeStatus = "validated";
      }
    }
    if (REQUIRE_REAL_PROBE && realProbeStatus !== "validated") {
      throw new Error(`Real-device UI probe required but not validated: ${realProbeStatus}\n${JSON.stringify(realProbe || {}, null, 2)}`);
    }
    const shot = await client.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
      fromSurface: true,
    });
    const out = path.join(OUT_DIR, `desktop-pwa-entry-${Date.now()}.png`);
    fs.writeFileSync(out, Buffer.from(shot.data, "base64"));
    client.close();
    console.log(JSON.stringify({
      ok: true,
      url: URL,
      width: WIDTH,
      height: HEIGHT,
      deviceScaleFactor: DEVICE_SCALE_FACTOR,
      manifestUrl: manifest.url || "",
      manifestErrors: manifest.errors || [],
      layout,
      realProbeStatus,
      realProbe: realProbe ? {
        receivedAt: realProbe.record?.receivedAt || "",
        ageMs: realProbe.ageMs,
        versionMatches: realProbe.versionMatches,
        expectedAssets: realProbe.expectedAssets,
        probeAssets: realProbe.probeAssets,
        layout: realProbeLayout,
      } : null,
      screenshot: out,
      note: "Desktop PWA render harness uses Chrome mobile viewport; Android WebAPK is not used for this check.",
      noteFocusLayout,
    }, null, 2));
  } finally {
    chrome.kill();
  }
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
