// Ready activities per DepEd BOW week, stored as static JSON in
// data/activity-bank/ (no Firestore reads). Picking one only fills in the
// normal add-assignment form - the teacher reviews/edits and saves it through
// the usual path, so touchSection()/notifications behave as for any assignment.
const cache = new Map();

export async function loadBank(subject) {
  if (cache.has(subject)) return cache.get(subject);
  const res = await fetch(`data/activity-bank/${subject}.json?v=1`);
  if (!res.ok) throw new Error(`Couldn't load the activity bank (${res.status}).`);
  const list = await res.json();
  cache.set(subject, list);
  return list;
}

export function weeksOf(entries) {
  return [...new Set(entries.map((e) => e.week))].sort((a, b) => a - b);
}

export function toAssignmentFields(e) {
  const out = { title: e.title, instructions: e.instructions, allowedFileTypes: e.type };
  if (e.type === "code") { out.codeLang = e.codeLang; out.starterCode = e.starterCode || ""; }
  out.totalPoints = e.points;
  out.component = e.component;
  return out;
}
