"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const deny = [
  /sk-[A-Za-z0-9]{20,}/,
  /fin_[A-Za-z0-9_-]{32,}/,
  /Bearer\s+fin_[A-Za-z0-9_-]{12,}/i,
  /access[_-]?key\s*[:=]\s*["'][^"']{12,}/i,
  /password\s*[:=]\s*["'][^"']{6,}/i,
  /pushEndpoint\s*[:=]\s*https?:\/\//i,
];

function walk(dir) {
  const out = [];
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if ([".git", "node_modules", "data"].includes(item.name)) continue;
    const full = path.join(dir, item.name);
    if (item.isDirectory()) out.push(...walk(full));
    else if (/\.(js|json|md|html|css)$/.test(item.name)) out.push(full);
  }
  return out;
}

test("repository text does not contain obvious raw secrets", () => {
  const offenders = [];
  for (const file of walk(root)) {
    const text = fs.readFileSync(file, "utf8");
    for (const pattern of deny) {
      if (pattern.test(text)) offenders.push(path.relative(root, file));
    }
  }
  assert.deepEqual(offenders, []);
});
