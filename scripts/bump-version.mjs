#!/usr/bin/env node
// Dev-only. Bumps the manual `?v=N` cache-busters and the service-worker
// CACHE_NAME together, so a deploy can never ship a half-bumped set (the
// foot-gun CLAUDE.md warns about: "bump ?v= on every file changed, in every
// HTML file"). NOT part of the deployed site.
//
// Usage:
//   node scripts/bump-version.mjs            # bump css + teacher + student (+ sw)
//   node scripts/bump-version.mjs css        # bump only css/style.css (+ sw)
//   node scripts/bump-version.mjs teacher student
//
// Any bump also advances sw.js CACHE_NAME, whose `activate` handler then purges
// the stale caches on the next load. Prints a summary; run `git diff` after to
// confirm only version strings changed.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HTML = ["index.html", "student.html", "teacher.html"];

// Each target: the asset path whose ?v=N we bump, across every HTML file that
// references it. We read the current max N across all references and set them
// all to max+1 (so drifted numbers reconverge).
const TARGETS = {
  css: "css/style.css",
  teacher: "js/teacher.js",
  student: "js/student.js",
};

function read(rel) {
  return readFileSync(resolve(ROOT, rel), "utf8");
}
function write(rel, text) {
  writeFileSync(resolve(ROOT, rel), text);
}
// Escape a string for use inside a RegExp.
function esc(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function bumpTarget(name) {
  const asset = TARGETS[name];
  if (!asset) {
    console.error(`Unknown target "${name}". Known: ${Object.keys(TARGETS).join(", ")}`);
    process.exit(1);
  }
  const re = new RegExp(`${esc(asset)}\\?v=(\\d+)`, "g");

  // Find current max version across all HTML files.
  let max = 0;
  let seen = false;
  for (const f of HTML) {
    for (const m of read(f).matchAll(re)) {
      seen = true;
      max = Math.max(max, Number(m[1]));
    }
  }
  if (!seen) {
    console.log(`  (skip ${asset}: no ?v= reference found)`);
    return false;
  }
  const next = max + 1;
  for (const f of HTML) {
    const src = read(f);
    const out = src.replace(re, `${asset}?v=${next}`);
    if (out !== src) write(f, out);
  }
  console.log(`  ${asset}: v${max} -> v${next}`);
  return true;
}

function bumpServiceWorker() {
  const rel = "sw.js";
  const src = read(rel);
  const re = /(CACHE_NAME\s*=\s*"[^"]*-v)(\d+)(")/;
  const m = src.match(re);
  if (!m) {
    console.log("  (skip sw.js: CACHE_NAME pattern not found)");
    return;
  }
  const next = Number(m[2]) + 1;
  write(rel, src.replace(re, `$1${next}$3`));
  console.log(`  sw.js CACHE_NAME: v${m[2]} -> v${next}`);
}

const args = process.argv.slice(2);
const targets = args.length ? args : Object.keys(TARGETS);

console.log(`Bumping: ${targets.join(", ")} (+ sw.js)`);
let any = false;
for (const t of targets) any = bumpTarget(t) || any;
if (any) bumpServiceWorker();
else console.log("Nothing bumped.");
