// Unit tests for js/assignment-cache.js (student assignment cache).
import { describe, it, expect } from "vitest";
import {
  readCache, writeCache, clearAllCaches, staleSectionIds, asDoc, chunk, ASG_CACHE_TTL_MS,
  readStore, writeStore, fitToBudget, SUB_PREFIX, TERM_PREFIX, SUB_CACHE_TTL_MS,
} from "../../js/assignment-cache.js";

function memStorage() {
  const m = new Map();
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

const NOW = 1_000_000_000;

describe("staleSectionIds", () => {
  const cache = {
    a: { v: 5, at: NOW - 1000, docs: [] },
    b: { v: null, at: NOW - 1000, docs: [] },
    old: { v: 5, at: NOW - ASG_CACHE_TTL_MS - 1, docs: [] },
  };
  it("keeps sections whose version matches and are within the TTL", () => {
    expect(staleSectionIds([{ id: "a", version: 5 }], cache, NOW)).toEqual([]);
  });
  it("treats a missing version on both sides as equal (untouched legacy section)", () => {
    expect(staleSectionIds([{ id: "b", version: null }], cache, NOW)).toEqual([]);
    expect(staleSectionIds([{ id: "b", version: undefined }], cache, NOW)).toEqual([]);
  });
  it("refetches on a changed version, a new version on a legacy entry, no entry, or past TTL", () => {
    expect(staleSectionIds([{ id: "a", version: 6 }], cache, NOW)).toEqual(["a"]);
    expect(staleSectionIds([{ id: "b", version: 7 }], cache, NOW)).toEqual(["b"]);
    expect(staleSectionIds([{ id: "new", version: 1 }], cache, NOW)).toEqual(["new"]);
    expect(staleSectionIds([{ id: "old", version: 5 }], cache, NOW)).toEqual(["old"]);
  });
  it("refetches a malformed entry", () => {
    expect(staleSectionIds([{ id: "x", version: 1 }], { x: { v: 1, at: NOW } }, NOW)).toEqual(["x"]);
  });
});

describe("storage", () => {
  it("round-trips per user and clears every user's cache on sign-out", () => {
    const s = memStorage();
    writeCache("u1", { a: { v: 1, at: 2, docs: [{ id: "x", data: { title: "T" } }] } }, s);
    writeCache("u2", { b: { v: 1, at: 2, docs: [] } }, s);
    s.setItem("lms.rememberEmail", "keep@me");
    expect(readCache("u1", s).a.docs[0].data.title).toBe("T");
    clearAllCaches(s);
    expect(readCache("u1", s)).toEqual({});
    expect(readCache("u2", s)).toEqual({});
    expect(s.getItem("lms.rememberEmail")).toBe("keep@me");
  });
  it("never throws when storage is blocked, full or corrupt", () => {
    const blocked = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("quota"); } };
    expect(readCache("u", blocked)).toEqual({});
    expect(() => writeCache("u", {}, blocked)).not.toThrow();
    expect(() => clearAllCaches(blocked)).not.toThrow();
    const s = memStorage();
    s.setItem("lms.asgCache.u", "{not json");
    expect(readCache("u", s)).toEqual({});
  });
});

describe("helpers", () => {
  it("asDoc mimics a snapshot", () => {
    const d = asDoc("id1", { title: "A" });
    expect(d.id).toBe("id1");
    expect(d.data().title).toBe("A");
  });
  it("chunk splits into Firestore 'in' sized groups", () => {
    expect(chunk([...Array(65).keys()]).map((c) => c.length)).toEqual([30, 30, 5]);
    expect(chunk([])).toEqual([]);
  });
});

describe("submission + term stores", () => {
  it("round-trip, and sign-out clears every cache prefix but nothing else", () => {
    const s = memStorage();
    writeCache("u1", { a: { v: 1, at: 2, docs: [] } }, s);
    expect(writeStore(SUB_PREFIX, "u1", { secA: { v: 5, at: 1, docs: [{ id: "x", data: { status: "published" } }] } }, s)).toBe(true);
    writeStore(TERM_PREFIX, "u1", { key: "s1", at: 1, subjects: [["s1", { name: "Phil" }]] }, s);
    s.setItem("studentTab", "quizzes");
    expect(readStore(SUB_PREFIX, "u1", s).secA.docs[0].data.status).toBe("published");
    expect(readStore(TERM_PREFIX, "u1", s).subjects[0][1].name).toBe("Phil");
    clearAllCaches(s);
    expect(readCache("u1", s)).toEqual({});
    expect(readStore(SUB_PREFIX, "u1", s)).toEqual({});
    expect(readStore(TERM_PREFIX, "u1", s)).toEqual({});
    expect(s.getItem("studentTab")).toBe("quizzes");
  });
  it("writeStore reports a full/blocked storage instead of throwing", () => {
    const blocked = { setItem() { throw new Error("quota"); } };
    expect(writeStore(SUB_PREFIX, "u", { a: 1 }, blocked)).toBe(false);
  });
  it("subsVersion staleness uses the same rules with a 1h TTL", () => {
    const now = 10_000_000;
    const cache = { a: { v: 3, at: now - 1000, docs: [] }, b: { v: 3, at: now - SUB_CACHE_TTL_MS - 1, docs: [] } };
    expect(staleSectionIds([{ id: "a", version: 3 }, { id: "b", version: 3 }], cache, now, SUB_CACHE_TTL_MS)).toEqual(["b"]);
    expect(staleSectionIds([{ id: "a", version: 4 }], cache, now, SUB_CACHE_TTL_MS)).toEqual(["a"]);
  });
});

describe("fitToBudget", () => {
  it("drops oversized (photo-heavy) sections and keeps the rest under the cap", () => {
    const big = { v: 1, at: 1, docs: [{ id: "p", data: { photoPages: ["x".repeat(500_000)] } }] };
    const small = { v: 1, at: 1, docs: [{ id: "s", data: { link: "https://x" } }] };
    const out = fitToBudget({ big, small });
    expect(Object.keys(out)).toEqual(["small"]);
    const many = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`s${i}`, { v: 1, at: 1, docs: [{ id: "d", data: { p: "y".repeat(300_000) } }] }]));
    expect(JSON.stringify(fitToBudget(many)).length).toBeLessThanOrEqual(1_500_000);
  });
});
