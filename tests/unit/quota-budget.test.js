// Unit tests for scripts/quota-budget.mjs (Spark quota budget calculator).
import { describe, it, expect } from "vitest";
import { evalFormula, level, budget, COSTS } from "../../scripts/quota-budget.mjs";

describe("evalFormula", () => {
  it("evaluates arithmetic over named assumptions", () => {
    expect(evalFormula("3*a + b", { a: 2, b: 1 })).toBe(7);
  });
  it("rejects anything that isn't plain arithmetic", () => {
    expect(() => evalFormula("process.exit(1)", {})).toThrow();
    expect(() => evalFormula("a; b", { a: 1, b: 2 })).toThrow();
  });
});

describe("level", () => {
  it("uses the GREEN / YELLOW / RED thresholds", () => {
    expect(level(10, 100)).toBe("GREEN");
    expect(level(50, 100)).toBe("YELLOW");
    expect(level(80, 100)).toBe("YELLOW");
    expect(level(81, 100)).toBe("RED");
  });
});

describe("budget", () => {
  it("every action formula in session-costs.json evaluates to a number", () => {
    const r = budget({ students: 1, teachers: 1 });
    for (const [name, v] of Object.entries(r.per)) {
      expect(Number.isFinite(v.reads), name).toBe(true);
      expect(Number.isFinite(v.writes), name).toBe(true);
    }
  });
  it("scales linearly with students", () => {
    const a = budget({ students: 100, teachers: 0 });
    const b = budget({ students: 200, teachers: 0 });
    expect(b.reads).toBeCloseTo(a.reads * 2, -1);
  });
  it("max students fits within the read limit", () => {
    const r = budget({ students: 1, teachers: 5 });
    const atMax = budget({ students: r.maxStudents, teachers: 5 });
    expect(atMax.reads).toBeLessThanOrEqual(COSTS.limits.readsPerDay);
  });
  it("overrides change the result", () => {
    const base = budget({ students: 100, teachers: 0 });
    const lighter = budget({ students: 100, teachers: 0, overrides: { assignmentsPerClass: 5 } });
    expect(lighter.reads).toBeLessThan(base.reads);
  });
});
