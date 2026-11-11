// Small pure helpers shared by js/teacher.js and js/student.js (moved here
// verbatim so there is one copy; no behavior change). No DOM, no Firebase.

// Term labels are free text on subjects ("2", "Term 2", "2nd") and SY may use
// a hyphen, en dash, or stray spaces - compare normalized forms so a cosmetic
// difference never makes a current class look like a past one (or vice versa).
export function normTerm(v) {
  const m = String(v ?? "").match(/\d+/);
  return m ? m[0] : String(v ?? "").trim().toLowerCase();
}
export function normYear(v) {
  return String(v ?? "").replace(/\s+/g, "").replace(/[‐-―]/g, "-");
}

export function displayStudentName(name) { return (name || "").toUpperCase(); }

// Minimal HTML-escape (student.js flavour: null/undefined -> "").
export function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
// teacher.js flavour (kept distinct: null -> "null", `&` first, same 4 chars).
export function escAttr(s) { return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

// Word-by-word match, order-independent and punctuation-insensitive, so
// "narvasa lhian" matches a roster name stored as "Narvasa, Lhian M." -
// every typed word just has to appear somewhere in the name.
export function matchesNameSearch(name, query) {
  const words = (s) => (s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  const queryWords = words(query);
  if (queryWords.length === 0) return true;
  const nameWords = words(name);
  return queryWords.every((qw) => nameWords.some((nw) => nw.includes(qw)));
}

export function parseManualNumber(raw) {
  const t = String(raw).trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

// Deadline lock (client-side). dueDate is a "YYYY-MM-DD" string; submissions
// close at the end of that day, Philippine time (UTC+8). No dueDate = never
// closes.
export function isPastDue(a) {
  return !!a.dueDate && Date.now() > new Date(a.dueDate + "T23:59:59+08:00").getTime();
}
