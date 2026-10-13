// Pure helpers behind js/teacher.js's Spark read-budget caching (see
// tests/load/quota-budget.md). Kept separate so they can be unit-tested.

// "Structure" collections change only through the teacher's own actions, so
// they're reused for 10 minutes (invalidateStructure() clears them on every
// structural write). Everything else - the "inbox" (pending submissions,
// leave/join/seen/redo enrollments) and the big one-off scans - keeps the old
// 3-second coalescing window, so a refresh always pulls it fresh.
export const STRUCTURE_KEYS = new Set(["subjects", "sections", "assignments"]);
export const STRUCTURE_TTL_MS = 10 * 60 * 1000;
export const INBOX_TTL_MS = 3000;
export const MISSING_TTL_MS = 15 * 60 * 1000;

export function ttlForKey(key) {
  return STRUCTURE_KEYS.has(key) ? STRUCTURE_TTL_MS : INBOX_TTL_MS;
}

// Mirrors loadSubjects()'s row filter: is this subject's card on the Home grid?
// (Archived only when "show archived" is ticked; other terms hidden while the
// current-term filter is on.) Used so the missing-work badge only spends
// count() reads on subjects the teacher can actually see.
export function subjectShown(s, { showArchived, filterByTerm, termSetting }, normYear, normTerm) {
  if (s.archived && !showArchived) return false;
  if (!filterByTerm) return true;
  return normYear(s.schoolYear) === normYear(termSetting.currentSchoolYear)
    && normTerm(s.term) === normTerm(termSetting.currentTerm);
}

// Snapshot-like copy of a submission doc with the teacher's just-saved fields
// applied, so the list re-renders without re-reading every submission.
export function patchedDoc(d, patch) {
  const data = { ...d.data(), ...patch };
  return { id: d.id, ref: d.ref, data: () => data };
}

// Approved (live) students in a section from two count() reads. Legacy
// enrollments with no status field count as approved, same as before.
export function approvedHeadcount(total, pending) {
  return Math.max(0, (Number(total) || 0) - (Number(pending) || 0));
}
