import { describe, expect, it } from "vitest";
import { filterBySection, groupPending } from "../../tools/lms-agent/pending.mjs";

describe("groupPending", () => {
  it("counts per assignment, biggest first", () => {
    const rows = [
      { assignmentId: "b", sectionId: "s1" }, { assignmentId: "a", sectionId: "s2" },
      { assignmentId: "a", sectionId: "s2" }, { assignmentId: "a", sectionId: "s2" },
    ];
    expect(groupPending(rows)).toEqual([
      { assignmentId: "a", sectionId: "s2", pending: 3 },
      { assignmentId: "b", sectionId: "s1", pending: 1 },
    ]);
  });
  it("ties sort by id; bad rows and empty input are ignored", () => {
    expect(groupPending([{ assignmentId: "z" }, { assignmentId: "y" }, {}, null]).map((g) => g.assignmentId)).toEqual(["y", "z"]);
    expect(groupPending([])).toEqual([]);
    expect(groupPending(undefined)).toEqual([]);
  });
});

describe("filterBySection", () => {
  const rows = [{ sectionId: "s1", section: "STEM 12" }, { sectionId: "s2", section: "ICT 11" }];
  it("matches name case-insensitively or exact id; no query = all", () => {
    expect(filterBySection(rows, "stem 12")).toEqual([rows[0]]);
    expect(filterBySection(rows, "s2")).toEqual([rows[1]]);
    expect(filterBySection(rows, undefined)).toEqual(rows);
    expect(filterBySection(rows, true)).toEqual(rows);
    expect(filterBySection(rows, "nope")).toEqual([]);
  });
});
