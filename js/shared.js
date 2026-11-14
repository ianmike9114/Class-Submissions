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

// Invite doc id: "{sectionId}_{lowercased email}". firestore.rules' enrollments
// create rule does exists(invites/<this id>) to decide whether a student may
// enroll as "approved" (invited by the teacher) instead of "pending".
export function inviteDocId(sectionId, email) {
  return `${sectionId}_${String(email || "").trim().toLowerCase()}`;
}

// Stale-page guard: is the version served by version.json newer than the one
// this page was loaded with? Both are positive integers (bump-version.mjs).
export function isNewerVersion(loaded, latest) {
  const a = Number(loaded);
  const b = Number(latest);
  return Number.isFinite(a) && Number.isFinite(b) && b > a;
}

// Is it safe to reload the page right now? Never while the student has photos
// not yet submitted, typed code/link in a form, or a quiz on screen.
export function safeToReload({ pendingPhotoCount = 0, hasTypedWork = false, quizActive = false } = {}) {
  return !(quizActive || hasTypedWork || pendingPhotoCount > 0);
}

// The photos of a submission as the ZIP exports them: photoPages if any, else the
// legacy single photoData.
export function photoList(s) {
  if (s && Array.isArray(s.photoPages) && s.photoPages.length) return s.photoPages;
  return s && typeof s.photoData === "string" && s.photoData ? [s.photoData] : [];
}

// Cheap fingerprint of a submission's photos ("count:total chars"). "Free up
// space" records it when a ZIP is downloaded and re-checks it against the live
// doc right before deleting, so photos that changed after the ZIP are kept.
export function photoSig(s) {
  const list = photoList(s);
  return `${list.length}:${list.reduce((n, p) => n + String(p).length, 0)}`;
}

// "Free up space": which submissions may have their photos removed. ONLY
// published ones that still hold photos. Pending/returned work is never
// included. Returns [{ id, pages, bytes }] (bytes = approx base64 chars).
export function photosFreeable(subs) {
  const out = [];
  for (const s of subs || []) {
    if (!s || s.status !== "published") continue;
    const all = photoList(s);
    if (!all.length) continue;
    out.push({ id: s.id, pages: all.length, bytes: all.reduce((n, p) => n + String(p).length, 0) });
  }
  return out;
}
