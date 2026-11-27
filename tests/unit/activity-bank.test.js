import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { weeksOf, toAssignmentFields } from "../../js/activity-bank.js";

const bank = JSON.parse(readFileSync(new URL("../../data/activity-bank/dotnet.json", import.meta.url), "utf8"));

describe("dotnet activity bank data", () => {
  it("every entry is complete and valid", () => {
    const ids = new Set();
    for (const e of bank) {
      expect(ids.has(e.id), e.id).toBe(false); ids.add(e.id);
      expect(e.subject).toBe("dotnet");
      expect(e.term).toBe(1);
      expect(e.week).toBeGreaterThanOrEqual(1); expect(e.week).toBeLessThanOrEqual(10);
      for (const k of ["competency", "title", "instructions"]) expect(e[k]?.trim(), `${e.id}.${k}`).toBeTruthy();
      expect(["code", "project", "document", "image", "video"]).toContain(e.type);
      expect(["written", "performance"]).toContain(e.component);
      expect(e.points).toBeGreaterThan(0);
      if (e.type === "code") expect(["web", "csharp"]).toContain(e.codeLang);
      else expect(e.codeLang).toBeUndefined();
    }
  });
  it("code entries have starter code; PTs are 50-pt performance projects", () => {
    for (const e of bank.filter((x) => x.type === "code")) expect(e.starterCode?.trim(), e.id).toBeTruthy();
    for (const e of bank.filter((x) => x.id.includes("-pt"))) {
      expect(e.points, e.id).toBe(50); expect(e.component, e.id).toBe("performance"); expect(e.type, e.id).toBe("project");
    }
  });
  it("C# starter code never uses top-level statements (mono)", () => {
    for (const e of bank.filter((x) => x.codeLang === "csharp" && x.starterCode)) {
      expect(e.starterCode, e.id).toMatch(/static void Main/);
    }
  });
  it("covers all 50 BOW competencies and 8 suggested PTs", () => {
    const comps = new Set(bank.filter((e) => !e.id.includes("-pt")).map((e) => e.competency));
    expect(comps.size).toBe(50);
    expect(bank.filter((e) => e.id.includes("-pt")).length).toBe(8);
  });
});

describe("helpers", () => {
  it("weeksOf returns sorted unique weeks", () => {
    expect(weeksOf([{ week: 3 }, { week: 1 }, { week: 3 }])).toEqual([1, 3]);
  });
  it("toAssignmentFields maps a code entry", () => {
    expect(toAssignmentFields({ title: "T", instructions: "I", type: "code", codeLang: "web", starterCode: "<p>", points: 10, component: "written" }))
      .toEqual({ title: "T", instructions: "I", allowedFileTypes: "code", codeLang: "web", starterCode: "<p>", totalPoints: 10, component: "written" });
  });
  it("toAssignmentFields omits code fields for a project", () => {
    expect(toAssignmentFields({ title: "P", instructions: "I", type: "project", points: 50, component: "performance" }))
      .toEqual({ title: "P", instructions: "I", allowedFileTypes: "project", totalPoints: 50, component: "performance" });
  });
});
