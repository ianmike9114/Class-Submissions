// Read-only: list the owner's subjects, sections, and (with --section) assignments.
import { db, OWNER_EMAIL, parseArgs, isMain } from "./admin.mjs";

export async function listAll() {
  const [subs, secs] = await Promise.all([
    db.collection("subjects").where("ownerEmail", "==", OWNER_EMAIL).get(),
    db.collection("sections").where("ownerEmail", "==", OWNER_EMAIL).get(),
  ]);
  return {
    subjects: subs.docs.map((d) => ({ id: d.id, name: d.data().name, gradeLevel: d.data().gradeLevel, schoolYear: d.data().schoolYear, term: d.data().term, archived: !!d.data().archived })),
    sections: secs.docs.map((d) => ({ id: d.id, subjectId: d.data().subjectId, sectionName: d.data().sectionName })),
  };
}

export async function listAssignments(sectionId) {
  const snap = await db.collection("assignments")
    .where("ownerEmail", "==", OWNER_EMAIL).where("sectionId", "==", sectionId).get();
  return snap.docs.map((d) => {
    const a = d.data();
    return { id: d.id, title: a.title, type: a.type || "assignment", component: a.component || null, totalPoints: a.totalPoints ?? null, dueDate: a.dueDate || null, allowedFileTypes: a.allowedFileTypes || null };
  });
}

if (isMain(import.meta.url)) {
  const args = parseArgs();
  const out = await listAll();
  if (args.section && args.section !== true) out.assignments = await listAssignments(args.section);
  console.log(JSON.stringify(out, null, 2));
}
