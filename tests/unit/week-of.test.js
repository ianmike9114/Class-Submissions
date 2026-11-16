import { describe, expect, it } from "vitest";
import { weekOf } from "../../tools/lms-agent/week-of.mjs";

const cal = {
  schoolYear: "2026-2027",
  terms: [{ term: 1, start: null }, { term: 2, start: "2026-09-21" }, { term: 3, start: null }],
  breaks: [],
};

describe("weekOf", () => {
  it("Nov 16 2026 is Term 2 Week 9", () => {
    expect(weekOf("2026-11-16", cal)).toEqual({ term: 2, week: 9, sy: "2026-2027" });
  });
  it("term start is week 1", () => {
    expect(weekOf("2026-09-21", cal).week).toBe(1);
  });
  it("skips full break weeks", () => {
    const c = { ...cal, breaks: [{ from: "2026-10-12", to: "2026-10-18", label: "break" }] };
    expect(weekOf("2026-11-16", c).week).toBe(8);
    expect(weekOf("2026-10-09", c).week).toBe(3);
  });
  it("errors inside a break", () => {
    const c = { ...cal, breaks: [{ from: "2026-10-12", to: "2026-10-18", label: "break" }] };
    expect(() => weekOf("2026-10-14", c)).toThrow(/break/);
  });
  it("throws when no term start is known or date precedes it", () => {
    expect(() => weekOf("2026-11-16", { ...cal, terms: [{ term: 2, start: null }] })).toThrow();
    expect(() => weekOf("2026-09-01", cal)).toThrow(/before/);
  });
});
