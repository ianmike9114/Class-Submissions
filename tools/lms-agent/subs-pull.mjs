// Pull the PENDING submissions of ONE assignment into a scratch folder for grading.
// Never reads the whole submissions collection (docs carry base64 photos).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { db, assertOwned, OWNER_EMAIL, parseArgs, isMain } from "./admin.mjs";
import { maxAfterReturns } from "./cap.mjs";

const MAX_BYTES = 10 * 1024 * 1024;

export function driveId(url) {
  const m = String(url || "").match(/\/d\/([\w-]{10,})/) || String(url || "").match(/[?&]id=([\w-]{10,})/);
  return m ? m[1] : null;
}

// Returns { file, data } to write, or { error }. Plain, unauthenticated fetch only.
export async function fetchWork(link, fetchImpl = fetch) {
  const id = driveId(link);
  if (!id) return { error: "unsupported link (not a Google Docs/Drive link)" };
  const isDoc = /docs\.google\.com\/document\//.test(link);
  const url = isDoc
    ? `https://docs.google.com/document/d/${id}/export?format=txt`
    : `https://drive.google.com/uc?export=download&id=${id}`;
  let res;
  try { res = await fetchImpl(url, { redirect: "follow" }); }
  catch (e) { return { error: `fetch failed: ${e.message}` }; }
  if (!res.ok) return { error: `HTTP ${res.status} (file may be private)` };
  const type = (res.headers.get("content-type") || "").toLowerCase();
  if (type.includes("text/html")) return { error: "got an HTML page (private file or sign-in required)" };
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) return { error: "file too large to fetch" };
  if (type.startsWith("text/")) return { file: "work.txt", data: buf.toString("utf8") };
  if (type.includes("application/pdf")) return { file: "work.pdf", data: buf };
  return { error: `unsupported content type: ${type || "unknown"}` };
}

const EXT = { "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

export function decodeDataUrl(src) {
  const m = String(src || "").match(/^data:(image\/[\w.+-]+);base64,(.+)$/s);
  if (!m) return null;
  return { ext: EXT[m[1].toLowerCase()] || "img", buf: Buffer.from(m[2], "base64") };
}

export async function pullSubs({ assignment, out, fetchImpl = fetch }) {
  if (!assignment || !out) throw new Error("--assignment and --out are required.");
  const aSnap = await db.collection("assignments").doc(assignment).get();
  if (!aSnap.exists) throw new Error(`Assignment ${assignment} not found.`);
  const a = assertOwned(aSnap.data(), `assignment ${assignment}`);
  if (a.type === "material") throw new Error("That is a material, not a gradable assignment.");
  if (a.allowedFileTypes === "quiz") throw new Error("Quizzes are auto-graded by the site; nothing to pull.");
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "assignment.json"), JSON.stringify({
    id: assignment, title: a.title, instructions: a.instructions || "", instructionsLink: a.instructionsLink || "",
    rubricReferenceLink: a.rubricReferenceLink || "", totalPoints: a.totalPoints ?? null, component: a.component || null,
    allowedFileTypes: a.allowedFileTypes || null, sectionId: a.sectionId,
  }, null, 2));

  const snap = await db.collection("submissions")
    .where("ownerEmail", "==", OWNER_EMAIL)
    .where("assignmentId", "==", assignment)
    .where("status", "==", "pending").get();

  const results = [];
  for (const d of snap.docs) {
    const s = assertOwned(d.data(), `submission ${d.id}`);
    const dir = join(out, d.id);
    mkdirSync(dir, { recursive: true });
    const pages = s.photoPages?.length ? s.photoPages : s.photoData ? [s.photoData] : [];
    const photos = [];
    pages.forEach((src, i) => {
      const dec = decodeDataUrl(src);
      if (!dec) return;
      const name = `photo-${i + 1}.${dec.ext}`;
      writeFileSync(join(dir, name), dec.buf);
      photos.push(name);
    });
    const meta = {
      submissionId: d.id, studentUID: s.studentUID, studentName: s.studentName || "", sectionId: a.sectionId,
      link: s.link || "", hasCode: !!s.code, returnCount: Number(s.returnCount) || 0,
      cap: maxAfterReturns(a.totalPoints, s.returnCount), totalPoints: a.totalPoints ?? null,
      submittedAt: s.submittedAt || null, photos,
    };
    if (s.code) writeFileSync(join(dir, "code.txt"), String(s.code));
    if (s.link) {
      const r = await fetchWork(s.link, fetchImpl);
      if (r.error) meta.fetchError = r.error;
      else { writeFileSync(join(dir, r.file), r.data); meta.workFile = r.file; }
    }
    writeFileSync(join(dir, "meta.json"), JSON.stringify(meta, null, 2));
    results.push({ submissionId: d.id, studentName: meta.studentName, photos: photos.length, workFile: meta.workFile || null, fetchError: meta.fetchError || null, cap: meta.cap });
  }
  return { count: results.length, results };
}

if (isMain(import.meta.url)) {
  const a = parseArgs();
  try {
    const r = await pullSubs({ assignment: a.assignment, out: a.out });
    console.log(`Pulled ${r.count} pending submission(s) to ${a.out}`);
    console.table(r.results);
  } catch (e) { console.error(e.message); process.exit(1); }
}
