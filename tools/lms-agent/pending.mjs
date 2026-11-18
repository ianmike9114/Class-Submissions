// Read-only: count the owner's pending submissions per assignment (for "check all").
//   node tools/lms-agent/pending.mjs [--json] [--section "<name or id>"]
// Only assignmentId/sectionId are selected; full submission docs carry base64 photos and are never downloaded.
// admin.mjs is imported lazily so importing groupPending in a test never touches Firebase or env.
import { isMain, parseArgs } from "./cli.mjs";

// rows: [{ assignmentId, sectionId }] -> [{ assignmentId, sectionId, pending }] sorted by count desc, then id.
export function groupPending(rows) {
  const m = new Map();
  for (const r of rows || []) {
    if (!r || !r.assignmentId) continue;
    const g = m.get(r.assignmentId) || { assignmentId: r.assignmentId, sectionId: r.sectionId || null, pending: 0 };
    g.pending++;
    m.set(r.assignmentId, g);
  }
  return [...m.values()].sort((a, b) => b.pending - a.pending || a.assignmentId.localeCompare(b.assignmentId));
}

// Keep rows whose section matches `q` (case-insensitive name, or exact id). No q = all rows.
export function filterBySection(rows, q) {
  const k = typeof q === "string" ? q.trim().toLowerCase() : "";
  if (!k) return rows;
  return rows.filter((r) => r.sectionId === q.trim() || String(r.section || "").toLowerCase() === k);
}

export async function listPending() {
  const { db, OWNER_EMAIL } = await import("./admin.mjs");
  const snap = await db.collection("submissions")
    .where("ownerEmail", "==", OWNER_EMAIL).where("status", "==", "pending")
    .select("assignmentId", "sectionId").get();
  const groups = groupPending(snap.docs.map((d) => d.data()));
  const secNames = new Map();
  const out = [];
  for (const g of groups) {
    const ad = await db.collection("assignments").doc(g.assignmentId).get();
    const a = ad.exists ? ad.data() : null;
    if (!a || String(a.ownerEmail || "").trim().toLowerCase() !== OWNER_EMAIL) continue;
    const type = a.type || "assignment";
    if (type === "quiz" || type === "material") continue;
    const sectionId = a.sectionId || g.sectionId;
    if (sectionId && !secNames.has(sectionId)) {
      const sd = await db.collection("sections").doc(sectionId).get();
      secNames.set(sectionId, sd.exists ? sd.data().sectionName || "" : "");
    }
    out.push({
      assignmentId: g.assignmentId, title: a.title || "", type, sectionId,
      section: secNames.get(sectionId) || "", totalPoints: a.totalPoints ?? null, pending: g.pending,
    });
  }
  return out;
}

if (isMain(import.meta.url)) {
  const args = parseArgs();
  const rows = filterBySection(await listPending(), args.section);
  if (args.json) {
    console.log(JSON.stringify(rows, null, 2));
  } else if (!rows.length) {
    console.log(args.section ? `No pending submissions in section "${args.section}".` : "No pending submissions.");
  } else {
    console.log(["pending", "cap", "section", "title", "assignmentId"].join("\t"));
    for (const r of rows) console.log([r.pending, r.totalPoints ?? "-", r.section, r.title, r.assignmentId].join("\t"));
    console.log(`Total: ${rows.reduce((n, r) => n + r.pending, 0)} pending in ${rows.length} assignment(s).`);
  }
}
