// Publish grades the way js/teacher.js:5138-5154 does, with guardrails and an audit log.
import { readFileSync, appendFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { db, assertOwned, parseArgs, isMain } from "./admin.mjs";
import { maxAfterReturns } from "./cap.mjs";
import { touchStudentSubs } from "./touch.mjs";

export async function publishGrades({ assignment, grades, minConfidence = 0.7, dryRun = false, auditDir = "." }) {
  const aSnap = await db.collection("assignments").doc(assignment).get();
  if (!aSnap.exists) throw new Error(`Assignment ${assignment} not found.`);
  const a = assertOwned(aSnap.data(), `assignment ${assignment}`);
  if (a.type === "material" || a.allowedFileTypes === "quiz") throw new Error("Not a gradable (non-quiz) assignment.");

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const auditFile = join(auditDir, `audit-${stamp}.jsonl`);
  const summary = { published: [], skipped: [], errors: [], auditFile: dryRun ? null : auditFile };

  for (const g of grades) {
    const id = g.submissionId;
    const skip = (reason) => summary.skipped.push({ submissionId: id, reason });
    const err = (reason) => summary.errors.push({ submissionId: id, reason });
    if (!id) { err("missing submissionId"); continue; }
    if (g.skipReason) { skip(`skipReason: ${g.skipReason}`); continue; }
    const score = g.score;
    if (typeof score !== "number" || !Number.isFinite(score)) { err("score is not a finite number"); continue; }
    if (typeof g.feedback !== "string" || !g.feedback.trim()) { skip("blank feedback"); continue; }
    const conf = Number(g.confidence);
    if (!Number.isFinite(conf) || conf < minConfidence) { skip(`confidence ${g.confidence} below ${minConfidence}`); continue; }

    const ref = db.collection("submissions").doc(id);
    try {
      const outcome = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return { error: "submission not found" };
        const s = snap.data();
        assertOwned(s, `submission ${id}`);
        if (s.assignmentId !== assignment) return { error: "submission belongs to a different assignment" };
        if (s.status !== "pending") return { skip: `status is ${s.status}, not pending` };
        const cap = maxAfterReturns(a.totalPoints, s.returnCount);
        if (score < 0 || score > cap) return { error: `score ${score} outside 0..${cap}` };
        const next = { finalGrade: { score, feedback: g.feedback.trim() }, status: "published", publishedAt: Date.now() };
        if (!dryRun) tx.update(ref, next);
        return { prev: { finalGrade: s.finalGrade ?? null, status: s.status, publishedAt: s.publishedAt ?? null }, next, studentUID: s.studentUID, cap };
      });
      if (outcome.error) { err(outcome.error); continue; }
      if (outcome.skip) { skip(outcome.skip); continue; }
      summary.published.push({ submissionId: id, score, cap: outcome.cap, studentUID: outcome.studentUID });
      if (!dryRun) {
        appendFileSync(auditFile, JSON.stringify({ ts: Date.now(), submissionId: id, assignmentId: assignment, sectionId: a.sectionId, studentUID: outcome.studentUID, previous: outcome.prev, new: outcome.next }) + "\n");
        await touchStudentSubs(outcome.studentUID, a.sectionId).catch((e) => err(`published but marker failed: ${e.message}`));
      }
    } catch (e) { err(e.message); }
  }
  return summary;
}

if (isMain(import.meta.url)) {
  const a = parseArgs();
  try {
    if (!a.assignment || !a.grades) throw new Error("--assignment and --grades are required.");
    const gradesPath = resolve(a.grades);
    const grades = JSON.parse(readFileSync(gradesPath, "utf8"));
    if (!Array.isArray(grades)) throw new Error("grades.json must be an array.");
    const dry = !!a["dry-run"];
    const r = await publishGrades({
      assignment: a.assignment, grades, dryRun: dry, auditDir: dirname(gradesPath),
      minConfidence: a["min-confidence"] ? Number(a["min-confidence"]) : 0.7,
    });
    console.log(dry ? "DRY RUN - nothing written. Would publish:" : "Published:");
    console.table(r.published);
    if (r.skipped.length) { console.log("Skipped:"); console.table(r.skipped); }
    if (r.errors.length) { console.log("Errors:"); console.table(r.errors); }
    console.log(`Summary: ${r.published.length} ${dry ? "would publish" : "published"}, ${r.skipped.length} skipped, ${r.errors.length} errors.`);
    if (r.auditFile && r.published.length) console.log(`Audit: ${r.auditFile}\nUndo: node tools/lms-agent/grade-undo.mjs --audit "${r.auditFile}"`);
  } catch (e) { console.error(e.message); process.exit(1); }
}
