// Mirrors the site's cache markers so students' caches refresh (js/teacher.js).
import { db, FieldValue, OWNER_EMAIL } from "./admin.mjs";

// touchSection (js/teacher.js:371): sections/{id}.assignmentsVersion + assignmentVersions.<id>.
// updateDoc() with dotted keys sets nested map entries; admin update() does the same.
export async function touchSection(sectionId, { changed = [], deleted = [] } = {}) {
  if (!sectionId) return;
  const now = Date.now();
  const patch = { assignmentsVersion: now };
  changed.filter(Boolean).forEach((id) => { patch[`assignmentVersions.${id}`] = now; });
  deleted.filter(Boolean).forEach((id) => { patch[`assignmentVersions.${id}`] = FieldValue.delete(); });
  await db.collection("sections").doc(sectionId).update(patch);
}

// touchStudentSubs (js/teacher.js:413): enrollments.subsVersion for that student in that section.
export async function touchStudentSubs(studentUID, sectionId) {
  if (!studentUID || !sectionId) return 0;
  const snap = await db.collection("enrollments")
    .where("studentUID", "==", studentUID)
    .where("sectionId", "==", sectionId)
    .where("ownerEmail", "==", OWNER_EMAIL).get();
  await Promise.all(snap.docs.map((d) => d.ref.update({ subsVersion: Date.now() })));
  return snap.size;
}
