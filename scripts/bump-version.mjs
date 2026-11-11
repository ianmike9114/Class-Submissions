#!/usr/bin/env node
// Dev-only. Bumps the manual `?v=N` cache-busters and the service-worker
// CACHE_NAME together, so a deploy can never ship a half-bumped set. Every
// reference is bumped: the HTML files AND imports inside other js/*.js.
// NOT part of the deployed site.
//
// Usage:
//   node scripts/bump-version.mjs               # bump css + teacher + student (+ sw)
//   node scripts/bump-version.mjs css           # only css/style.css (+ sw)
//   node scripts/bump-version.mjs quiz.js auth  # any js/*.js module, everywhere imported
//   node scripts/bump-version.mjs --all         # every asset that has a ?v= reference
//   node scripts/bump-version.mjs --list        # list assets + current versions, change nothing
//   node scripts/bump-version.mjs --dry-run quiz.js   # show what would change, write nothing
//
// Any real bump also advances sw.js CACHE_NAME (its `activate` handler purges
// the stale caches). Run `git diff` after to confirm only version strings changed.

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { planBump, resolveTarget } from "./bump-lib.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(resolve(ROOT, rel), "utf8");
const write = (rel, text) => writeFileSync(resolve(ROOT, rel), text);

const HTML = ["index.html", "student.html", "teacher.html"];
const JS_MODULES = readdirSync(resolve(ROOT, "js")).filter((f) => f.endsWith(".js")).map((f) => f.slice(0, -3));
const SCAN = [...HTML, ...JS_MODULES.map((m) => `js/${m}.js`)];
const DEFAULT = ["css", "teacher", "student"];

function loadFiles() {
  return Object.fromEntries(SCAN.map((f) => [f, read(f)]));
}

function bumpServiceWorker(dry) {
  const src = read("sw.js");
  const re = /(CACHE_NAME\s*=\s*"[^"]*-v)(\d+)(")/;
  const m = src.match(re);
  if (!m) return console.log("  (skip sw.js: CACHE_NAME pattern not found)");
  const next = Number(m[2]) + 1;
  if (!dry) write("sw.js", src.replace(re, `$1${next}$3`));
  console.log(`  sw.js CACHE_NAME: v${m[2]} -> v${next}`);
}

const args = process.argv.slice(2);
const dry = args.includes("--dry-run");
const list = args.includes("--list");
const all = args.includes("--all");
const names = args.filter((a) => !a.startsWith("--"));
const assets = ["css/style.css", ...JS_MODULES.map((m) => `js/${m}.js`)];

if (list) {
  const files = loadFiles();
  for (const a of assets) {
    const p = planBump(a, files);
    if (p.count) console.log(`  ${a}: v${p.max} (${p.count} refs)`);
  }
  process.exit(0);
}

let targets;
if (all) targets = assets;
else {
  targets = (names.length ? names : DEFAULT).map((n) => {
    const a = resolveTarget(n, JS_MODULES);
    if (!a) {
      console.error(`Unknown target "${n}". Known: css, ${JS_MODULES.join(", ")}`);
      process.exit(1);
    }
    return a;
  });
}

console.log(`${dry ? "[dry-run] " : ""}Bumping: ${targets.join(", ")} (+ sw.js)`);
let files = loadFiles();
let any = false;
for (const a of targets) {
  const p = planBump(a, files);
  if (!p.count) { console.log(`  (skip ${a}: no ?v= reference found)`); continue; }
  any = true;
  console.log(`  ${a}: v${p.max} -> v${p.next} (${p.count} refs in ${Object.keys(p.changed).join(", ") || "none changed"})`);
  files = { ...files, ...p.changed }; // later targets see earlier edits
}
if (any) {
  if (!dry) for (const f of SCAN) { const t = files[f]; if (t !== undefined && t !== read(f)) write(f, t); }
  bumpServiceWorker(dry);
} else console.log("Nothing bumped.");
