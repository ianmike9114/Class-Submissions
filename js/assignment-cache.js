// Student-side assignment cache (Spark read budget). The student dashboard used
// to re-read every assignment in every class on each load - the biggest single
// read cost (see tests/load/quota-budget.md). Now each section's assignments are
// remembered in localStorage and re-fetched only when that section changed:
// js/teacher.js's touchSection() stamps sections/{id}.assignmentsVersion on every
// assignment add/edit/delete, and the student already reads the section doc on
// every load. A 6-hour TTL is the safety net for any write path that forgets to
// stamp. Pure helpers + best-effort storage, so a blocked/full localStorage just
// means "no cache", never an error.

export const ASG_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const PREFIX = "lms.asgCache.";

export function readCache(uid, storage = globalThis.localStorage) {
  try {
    const raw = storage && storage.getItem(PREFIX + uid);
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

export function writeCache(uid, cache, storage = globalThis.localStorage) {
  try {
    storage && storage.setItem(PREFIX + uid, JSON.stringify(cache));
  } catch {
    /* quota exceeded / storage blocked - run uncached */
  }
}

// The student's OWN submissions, per section, keyed by the enrollment's
// subsVersion (stamped by the teacher's touchStudentSubs() on publish/return/
// redo/delete and by the student's own writes) - 1h TTL safety net. Photo-heavy
// sections can be big, so writes go through fitToBudget().
export const SUB_CACHE_TTL_MS = 60 * 60 * 1000;
export const SUB_PREFIX = "lms.subCache.";
// subjects + term settings behind getHiddenSectionIds() (30 min).
export const TERM_CACHE_TTL_MS = 30 * 60 * 1000;
export const TERM_PREFIX = "lms.termCache.";
const ALL_PREFIXES = [PREFIX, SUB_PREFIX, TERM_PREFIX];

export function readStore(prefix, uid, storage = globalThis.localStorage) {
  try {
    const raw = storage && storage.getItem(prefix + uid);
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

export function writeStore(prefix, uid, value, storage = globalThis.localStorage) {
  try {
    storage && storage.setItem(prefix + uid, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

// Drops the biggest section entries (photo pages are base64) until the whole
// cache serializes under maxChars, and any single entry over maxEntryChars -
// those sections just stay uncached (re-read each load, as before).
export function fitToBudget(cache, maxChars = 1_500_000, maxEntryChars = 400_000) {
  const sizes = Object.entries(cache).map(([k, v]) => [k, JSON.stringify(v).length]);
  const out = {};
  let total = 2;
  for (const [k, n] of sizes.sort((x, y) => x[1] - y[1])) {
    if (n > maxEntryChars || total + n + k.length + 4 > maxChars) continue;
    out[k] = cache[k];
    total += n + k.length + 4;
  }
  return out;
}

// Sign-out housekeeping (shared lab PCs). Assignments are readable by any
// signed-in user anyway, so this is tidiness, not a security boundary.
export function clearAllCaches(storage = globalThis.localStorage) {
  try {
    for (let i = storage.length - 1; i >= 0; i--) {
      const k = storage.key(i);
      if (k && ALL_PREFIXES.some((p) => k.startsWith(p))) storage.removeItem(k);
    }
  } catch {
    /* storage blocked */
  }
}

// Section ids whose cached assignments can't be trusted: no entry, a different
// assignmentsVersion (missing on both sides counts as equal - an untouched
// legacy section), or older than the TTL.
// sections: [{ id, version }] for the student's visible sections.
export function staleSectionIds(sections, cache, now, ttl = ASG_CACHE_TTL_MS) {
  return sections
    .filter(({ id, version }) => {
      const entry = cache[id];
      if (!entry || !Array.isArray(entry.docs)) return true;
      if ((entry.v ?? null) !== (version ?? null)) return true;
      return !(now - entry.at < ttl);
    })
    .map((s) => s.id);
}

// Snapshot-like wrapper so cached plain objects render through the same code
// as live QueryDocumentSnapshots (aDoc.id / aDoc.data()).
export function asDoc(id, data) {
  return { id, data: () => data };
}

export function chunk(arr, size = 30) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
