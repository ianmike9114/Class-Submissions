// Upload a file to Google Drive with rclone (argument arrays only, no shell strings).
// SAFETY: kind "answer-key" always goes to privatePath and `rclone link` is NEVER called for it.
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
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

const HERE = dirname(fileURLToPath(import.meta.url));

// Student files (module, worksheet) that are .docx also go up as a PDF, and the
// PDF is the share link: iPhones can't reliably show a .docx in Google Drive
// (Drive converts it page by page and fails on image-heavy modules, seen Nov
// 2026). The .docx is still uploaded beside it as the teacher's editable copy.
// Answer keys are never converted. --no-pdf skips it.
export function wantsPdf(file, kind, noPdf) {
  return !noPdf && kind !== "answer-key" && /\.docx$/i.test(String(file));
}

async function convertToPdf(file, exec) {
  const out = join(mkdtempSync(join(tmpdir(), "lms-pdf-")), basename(file).replace(/\.docx$/i, ".pdf"));
  try {
    await exec("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", join(HERE, "docx-to-pdf.ps1"), "-Src", file, "-Out", out]);
  } catch (e) {
    throw new Error(`Could not turn ${basename(file)} into a PDF with Word (${e.message}). Close Word and retry, or pass --no-pdf to upload only the .docx.`);
  }
  return out;
}

export function loadLayout(path = join(dirname(fileURLToPath(import.meta.url)), "drive-layout.json")) {
  return JSON.parse(readFileSync(path, "utf8"));
}

// `rclone link` returns https://drive.google.com/open?id=<id>, which the site
// can't preview. Rewrite to the /file/d/<id>/view form it embeds; leave anything else as is.
export function normalizeDriveLink(link) {
  const m = String(link).match(/^https:\/\/drive\.google\.com\/(?:open|uc)\?(?:[^#]*&)?id=([\w-]+)/);
  return m ? `https://drive.google.com/file/d/${m[1]}/view` : link;
}

export async function uploadToDrive({ file, kind, dryRun = false, noPdf = false, exec = run, layout = loadLayout(), ...vars }) {
  if (!KINDS.includes(kind)) throw new Error(`--kind must be one of ${KINDS.join(", ")}.`);
  if (!file || file === true) throw new Error("--file is required.");
  if (Array.isArray(layout.classFolders) && vars.class !== undefined && !layout.classFolders.includes(vars.class)) {
    throw new Error(`--class must be one of: ${layout.classFolders.join(" | ")}`);
  }
  const isKey = kind === "answer-key";
  const dir = fill(isKey ? layout.privatePath : layout.studentPath, vars);
  const destDir = `${layout.remote}:${dir}`;
  const pdf = wantsPdf(file, kind, noPdf);
  const result = { kind, destDir, link: null, dryRun, pdf };
  if (dryRun) return result;

  try { await exec("rclone", ["version"]); }
  catch (e) {
    if (e.code === "ENOENT") throw new Error("rclone not found on PATH. Install it from rclone.org, then run `rclone config` once to add a Google Drive remote.");
    throw e;
  }
  await exec("rclone", ["copy", file, destDir]);
  let linkFile = file;
  if (pdf) {
    linkFile = await convertToPdf(file, exec);
    await exec("rclone", ["copy", linkFile, destDir]);
  }
  if (!isKey) {
    const { stdout } = await exec("rclone", ["link", `${destDir}/${basename(linkFile)}`]);
    result.link = normalizeDriveLink(String(stdout).trim());
  }
  return result;
}

if (isMain(import.meta.url)) {
  const a = parseArgs();
  try {
    const { file, kind, "dry-run": dry, "no-pdf": noPdf, _, ...vars } = a;
    const r = await uploadToDrive({ ...vars, file, kind, dryRun: !!dry, noPdf: !!noPdf });
    console.log(r.dryRun ? `DRY RUN: would copy to ${r.destDir}` : `Uploaded to ${r.destDir}`);
    if (r.pdf) console.log(r.dryRun ? "Would also upload a PDF copy (the share link points to the PDF)." : "Also uploaded a PDF copy; the share link points to the PDF.");
    console.log(r.link ? `Share link: ${r.link}` : r.kind === "answer-key" ? "Answer key stored privately; no link created." : "");
  } catch (e) { console.error(e.message); process.exit(1); }
}
