"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");

test("Android PWA harness enforces Launcher-installed PWA evidence", () => {
  const script = fs.readFileSync(path.join(root, "scripts", "verify-android-pwa.js"), "utf8");
  const doc = fs.readFileSync(path.join(root, "docs", "IMPLEMENTATION_NOTES", "android-pwa-harness.md"), "utf8");
  const testMatrix = fs.readFileSync(path.join(root, "docs", "TEST_MATRIX.md"), "utf8");
  const pluginDoc = fs.readFileSync(path.join(root, "docs", "IMPLEMENTATION_NOTES", "hermes-embedded-plugin.md"), "utf8");

  assert.match(script, /adbDevices/);
  assert.match(script, /Launcher PWA icon/);
  assert.match(script, /browser-mode failure/);
  assert.match(script, /PWA failure/);
  assert.match(script, /proxy\/resource failure/);
  assert.match(script, /screenshotPath/);
  assert.match(script, /Chrome toolbar\/address bar/);
  assert.match(script, /browserModeIsDiagnosticOnly/);

  for (const text of [doc, testMatrix, pluginDoc]) {
    assert.match(text, /Launcher PWA icon|Launcher\/Desktop PWA icon/);
    assert.match(text, /Chrome\/Safari address-bar|Chrome\/Safari address/);
    assert.match(text, /not PWA pass\/fail|not treat Chrome\/Safari address-bar loading as PWA evidence|Do not use `adb am start -d <url>`/);
    assert.match(text, /no browser address bar|does not show the browser address bar|absence of browser toolbar/);
    assert.match(text, /key|cookie|token|push endpoint/);
  }
});
