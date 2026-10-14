import { describe, it, expect } from "vitest";
import { RETURN_PENALTY, maxAfterReturns, penaltyNote } from "../../js/grading.js";

describe("maxAfterReturns", () => {
  it("is the full total when never returned", () => {
    expect(maxAfterReturns(50, 0)).toBe(50);
    expect(maxAfterReturns(50, undefined)).toBe(50);
    expect(maxAfterReturns(50, null)).toBe(50);
  });
  it("drops by 10 per return", () => {
    expect(RETURN_PENALTY).toBe(10);
    expect(maxAfterReturns(50, 1)).toBe(40);
    expect(maxAfterReturns(50, 2)).toBe(30);
    expect(maxAfterReturns("50", "1")).toBe(40);
  });
  it("never goes below 0", () => {
    expect(maxAfterReturns(50, 5)).toBe(0);
    expect(maxAfterReturns(10, 1)).toBe(0);
    expect(maxAfterReturns(15, 9)).toBe(0);
  });
  it("ignores negative or junk counts (can't raise the cap)", () => {
    expect(maxAfterReturns(50, -3)).toBe(50);
    expect(maxAfterReturns(50, "abc")).toBe(50);
  });
  it("handles a missing total", () => {
    expect(maxAfterReturns(undefined, 1)).toBe(0);
    expect(maxAfterReturns("x", 0)).toBe(0);
  });
});

describe("penaltyNote", () => {
  it("is empty when never returned", () => {
    expect(penaltyNote(50, 0)).toBe("");
    expect(penaltyNote(50, undefined)).toBe("");
  });
  it("names the new max and the count", () => {
    expect(penaltyNote(50, 1)).toBe("Max 40 of 50 (returned 1× for revision, −10 each)");
    expect(penaltyNote(10, 2)).toBe("Max 0 of 10 (returned 2× for revision, −10 each)");
  });
});
