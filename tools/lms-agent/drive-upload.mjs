// Upload a file to Google Drive with rclone (argument arrays only, no shell strings).
// SAFETY: kind "answer-key" always goes to privatePath and `rclone link` is NEVER called for it.
import { readFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { parseArgs, isMain } from "./cli.mjs";

const run = promisify(execFile);
export const KINDS = ["module", "worksheet", "answer-key"];

const clean = (v) => String(v).replace(/[\/:*?"<>|]/g, "-").trim();
// Placeholders are whatever {names} the layout template uses; each must be supplied.
const fill = (tpl, v) => tpl.replace(/\{(\w+)\}/g, (_, k) => {
  const val = v[k];
  if (val === undefined || val === null || val === "" || val === true) throw new Error(`--${k} is required.`);
  return clean(val);
});

export function loadLayout(path = join(dirname(fileURLToPath(import.meta.url)), "drive-layout.json")) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export async function uploadToDrive({ file, kind, dryRun = false, exec = run, layout = loadLayout(), ...vars }) {
  if (!KINDS.includes(kind)) throw new Error(`--kind must be one of ${KINDS.join(", ")}.`);
  if (!file || file === true) throw new Error("--file is required.");
  if (Array.isArray(layout.classFolders) && vars.class !== undefined && !layout.classFolders.includes(vars.class)) {
    throw new Error(`--class must be one of: ${layout.classFolders.join(" | ")}`);
  }
  const isKey = kind === "answer-key";
  const dir = fill(isKey ? layout.privatePath : layout.studentPath, vars);
  const destDir = `${layout.remote}:${dir}`;
  const destFile = `${destDir}/${basename(file)}`;
  const result = { kind, destDir, link: null, dryRun };
  if (dryRun) return result;

  try { await exec("rclone", ["version"]); }
  catch (e) {
    if (e.code === "ENOENT") throw new Error("rclone not found on PATH. Install it from rclone.org, then run `rclone config` once to add a Google Drive remote.");
    throw e;
  }
  await exec("rclone", ["copy", file, destDir]);
  if (!isKey) {
    const { stdout } = await exec("rclone", ["link", destFile]);
    result.link = String(stdout).trim();
  }
  return result;
}

if (isMain(import.meta.url)) {
  const a = parseArgs();
  try {
    const { file, kind, "dry-run": dry, _, ...vars } = a;
    const r = await uploadToDrive({ ...vars, file, kind, dryRun: !!dry });
    console.log(r.dryRun ? `DRY RUN: would copy to ${r.destDir}` : `Uploaded to ${r.destDir}`);
    console.log(r.link ? `Share link: ${r.link}` : r.kind === "answer-key" ? "Answer key stored privately; no link created." : "");
  } catch (e) { console.error(e.message); process.exit(1); }
}
