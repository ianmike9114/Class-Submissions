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

// Sign-out housekeeping (shared lab PCs). Assignments are readable by any
// signed-in user anyway, so this is tidiness, not a security boundary.
export function clearAllCaches(storage = globalThis.localStorage) {
  try {
    for (let i = storage.length - 1; i >= 0; i--) {
      const k = storage.key(i);
      if (k && k.startsWith(PREFIX)) storage.removeItem(k);
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
