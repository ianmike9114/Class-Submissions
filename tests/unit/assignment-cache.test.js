// Unit tests for js/assignment-cache.js (student assignment cache).
import { describe, it, expect } from "vitest";
import { readCache, writeCache, clearAllCaches, staleSectionIds, asDoc, chunk, ASG_CACHE_TTL_MS } from "../../js/assignment-cache.js";

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
