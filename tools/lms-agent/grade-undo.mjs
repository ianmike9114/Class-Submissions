// Revert a grade-publish run from its audit log, only where the doc still holds what the run wrote.
import { readFileSync } from "node:fs";
import { db, assertOwned, FieldValue, parseArgs, isMain } from "./admin.mjs";
import { touchStudentSubs } from "./touch.mjs";

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export async function undoRun({ audit, dryRun = false }) {
  const lines = readFileSync(audit, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const summary = { restored: [], skipped: [], errors: [] };
  for (const e of lines) {
    const ref = db.collection("submissions").doc(e.submissionId);
    try {
      const out = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return { skip: "submission no longer exists" };
        const s = snap.data();
        assertOwned(s, `submission ${e.submissionId}`);
        if (e.action === "return") {
          const untouched = s.status === "returned" && s.returnedAt === e.new.returnedAt && same(s.finalGrade, e.new.finalGrade);
          if (!untouched) return { skip: "edited since the run (student resubmitted or teacher changed it)" };
          if (!dryRun) {
            tx.update(ref, {
              finalGrade: e.previous.finalGrade ?? FieldValue.delete(),
              status: e.previous.status,
              returnedAt: e.previous.returnedAt ?? FieldValue.delete(),
            });
          }
          return { ok: true };
        }
        const unchanged = s.status === e.new.status && s.publishedAt === e.new.publishedAt && same(s.finalGrade, e.new.finalGrade);
        if (!unchanged) return { skip: "edited since the run (teacher or student changed it)" };
        if (!dryRun) {
          tx.update(ref, {
            finalGrade: e.previous.finalGrade ?? FieldValue.delete(),
            status: e.previous.status,
            publishedAt: e.previous.publishedAt ?? FieldValue.delete(),
          });
        }
        return { ok: true };
      });
      if (out.skip) { summary.skipped.push({ submissionId: e.submissionId, reason: out.skip }); continue; }
      summary.restored.push({ submissionId: e.submissionId });
      if (!dryRun && e.action === "return" && e.attemptId) {
        // Delete only the archive doc this run created (owner-checked first).
        const attRef = db.collection("submissionAttempts").doc(e.attemptId);
        const att = await attRef.get();
        if (att.exists && att.data().submissionId === e.submissionId) { assertOwned(att.data(), `attempt ${e.attemptId}`); await attRef.delete(); }
      }
      if (!dryRun) await touchStudentSubs(e.studentUID, e.sectionId).catch((x) => summary.errors.push({ submissionId: e.submissionId, reason: `marker: ${x.message}` }));
    } catch (x) { summary.errors.push({ submissionId: e.submissionId, reason: x.message }); }
  }
  return summary;
}

if (isMain(import.meta.url)) {
  const a = parseArgs();
  try {
    if (!a.audit) throw new Error("--audit is required.");
    const r = await undoRun({ audit: a.audit, dryRun: !!a["dry-run"] });
    console.log(a["dry-run"] ? "DRY RUN - nothing written." : "Undo done.");
    console.log(`Summary: ${r.restored.length} restored, ${r.skipped.length} skipped, ${r.errors.length} errors.`);
    if (r.skipped.length) console.table(r.skipped);
    if (r.errors.length) console.table(r.errors);
  } catch (x) { console.error(x.message); process.exit(1); }
}
