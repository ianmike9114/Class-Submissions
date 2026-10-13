// Unit tests for js/teacher-reads.js (teacher read-budget helpers).
import { describe, it, expect } from "vitest";
import { ttlForKey, STRUCTURE_TTL_MS, INBOX_TTL_MS, subjectShown, patchedDoc, approvedHeadcount } from "../../js/teacher-reads.js";

const normTerm = (v) => (String(v ?? "").match(/\d+/) || [String(v ?? "").trim().toLowerCase()])[0];
const normYear = (v) => String(v ?? "").replace(/\s+/g, "");

describe("ttlForKey", () => {
  it("keeps structure 10 min and everything else (inbox, scans) 3 s", () => {
    for (const k of ["subjects", "sections", "assignments"]) expect(ttlForKey(k)).toBe(STRUCTURE_TTL_MS);
    for (const k of ["subs:pending", "enr:leave", "enr:seen", "enr:pending", "subs:resubmit", "enr:all", "subs:all", "enrollments"]) {
      expect(ttlForKey(k)).toBe(INBOX_TTL_MS);
    }
  });
});

describe("subjectShown", () => {
  const term = { currentSchoolYear: "2026-2027", currentTerm: "Term 2" };
  const opts = (o) => ({ showArchived: false, filterByTerm: true, termSetting: term, ...o });
  it("hides archived unless shown, and other terms while the filter is on", () => {
    expect(subjectShown({ schoolYear: "2026 - 2027", term: "2" }, opts(), normYear, normTerm)).toBe(true); // normalized
    expect(subjectShown({ schoolYear: "2026-2027", term: "2" }, opts(), normYear, normTerm)).toBe(true);
    expect(subjectShown({ schoolYear: "2026-2027", term: "1" }, opts(), normYear, normTerm)).toBe(false);
    expect(subjectShown({ schoolYear: "", term: "" }, opts(), normYear, normTerm)).toBe(false);
    expect(subjectShown({ archived: true, schoolYear: "2026-2027", term: "2" }, opts(), normYear, normTerm)).toBe(false);
    expect(subjectShown({ archived: true, schoolYear: "2026-2027", term: "2" }, opts({ showArchived: true }), normYear, normTerm)).toBe(true);
  });
  it("shows every non-archived subject when the term filter is off", () => {
    expect(subjectShown({ schoolYear: "2020", term: "9" }, opts({ filterByTerm: false }), normYear, normTerm)).toBe(true);
  });
});

describe("patchedDoc / approvedHeadcount", () => {
  it("patches data and keeps id/ref", () => {
    const d = { id: "s1", ref: "REF", data: () => ({ status: "pending", studentName: "A" }) };
    const p = patchedDoc(d, { status: "published", finalGrade: { score: 9 } });
    expect(p.id).toBe("s1");
    expect(p.ref).toBe("REF");
    expect(p.data()).toEqual({ status: "published", studentName: "A", finalGrade: { score: 9 } });
    expect(d.data().status).toBe("pending");
  });
  it("approved = total - pending, never negative", () => {
    expect(approvedHeadcount(40, 3)).toBe(37);
    expect(approvedHeadcount(0, 0)).toBe(0);
    expect(approvedHeadcount(2, 5)).toBe(0);
    expect(approvedHeadcount(undefined, null)).toBe(0);
  });
});
