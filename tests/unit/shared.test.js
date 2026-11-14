import { describe, it, expect, vi, afterEach } from "vitest";
import {
  normTerm, normYear, displayStudentName, esc, escAttr,
  matchesNameSearch, parseManualNumber, isPastDue,
} from "../../js/shared.js";

describe("normTerm / normYear", () => {
  it("treats '2', 'Term 2', '2nd' as the same term", () => {
    expect(normTerm("Term 2")).toBe("2");
    expect(normTerm("2")).toBe(normTerm("Term 2"));
    expect(normTerm("2nd")).toBe("2");
  });
  it("falls back to trimmed lowercase without digits; null-safe", () => {
    expect(normTerm("  Summer ")).toBe("summer");
    expect(normTerm(null)).toBe("");
    expect(normTerm(undefined)).toBe("");
  });
  it("ignores spaces and dash variants in school years", () => {
    const a = normYear("2025-2026");
    expect(normYear("2025 - 2026")).toBe(a);
    expect(normYear("2025–2026")).toBe(a); // en dash
    expect(normYear("2025—2026")).toBe(a); // em dash
    expect(normYear("2025‐2026")).toBe(a); // hyphen U+2010
    expect(normYear(null)).toBe("");
  });
});

describe("displayStudentName", () => {
  it("uppercases and is null-safe", () => {
    expect(displayStudentName("Dela Cruz, Juan")).toBe("DELA CRUZ, JUAN");
    expect(displayStudentName(undefined)).toBe("");
  });
});

describe("esc / escAttr", () => {
  it("both escape & < > \"", () => {
    const s = `<a href="x">&</a>`;
    const want = "&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;";
    expect(esc(s)).toBe(want);
    expect(escAttr(s)).toBe(want);
  });
  it("differ only on null/undefined (kept as originally)", () => {
    expect(esc(null)).toBe("");
    expect(esc(undefined)).toBe("");
    expect(escAttr(null)).toBe("null");
  });
  it("does not double-escape in one pass", () => {
    expect(esc("&lt;")).toBe("&amp;lt;");
    expect(escAttr("&lt;")).toBe("&amp;lt;");
  });
});

describe("matchesNameSearch", () => {
  it("is order- and punctuation-insensitive", () => {
    expect(matchesNameSearch("Narvasa, Lhian M.", "narvasa lhian")).toBe(true);
    expect(matchesNameSearch("Narvasa, Lhian M.", "lhian narvasa")).toBe(true);
  });
  it("needs every typed word to appear (substring of a name word)", () => {
    expect(matchesNameSearch("Narvasa, Lhian M.", "narv lh")).toBe(true);
    expect(matchesNameSearch("Narvasa, Lhian M.", "narvasa juan")).toBe(false);
  });
  it("empty query matches everything; null name is safe", () => {
    expect(matchesNameSearch("x", "")).toBe(true);
    expect(matchesNameSearch("x", "  ,, ")).toBe(true);
    expect(matchesNameSearch(null, "a")).toBe(false);
  });
});

describe("parseManualNumber", () => {
  it("blank -> null, numbers -> number, junk/negative -> NaN", () => {
    expect(parseManualNumber("")).toBeNull();
    expect(parseManualNumber("  ")).toBeNull();
    expect(parseManualNumber("12.5")).toBe(12.5);
    expect(parseManualNumber(" 0 ")).toBe(0);
    expect(parseManualNumber("abc")).toBeNaN();
    expect(parseManualNumber("-1")).toBeNaN();
    expect(parseManualNumber("Infinity")).toBeNaN();
  });
});

describe("isPastDue", () => {
  afterEach(() => vi.useRealTimers());
  it("no dueDate never closes", () => {
    expect(isPastDue({})).toBe(false);
    expect(isPastDue({ dueDate: "" })).toBe(false);
  });
  it("closes at end of the due day, Philippine time (UTC+8)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-10T15:59:00Z")); // 23:59 PHT on the 10th
    expect(isPastDue({ dueDate: "2026-03-10" })).toBe(false);
    vi.setSystemTime(new Date("2026-03-10T16:00:01Z")); // 00:00:01 PHT on the 11th
    expect(isPastDue({ dueDate: "2026-03-10" })).toBe(true);
  });
});

import { inviteDocId, isNewerVersion, safeToReload, photosFreeable, photoSig } from "../../js/shared.js";

describe("inviteDocId", () => {
  it("is sectionId_lowercasedEmail", () => {
    expect(inviteDocId("sec1", " Juan@Gmail.COM ")).toBe("sec1_juan@gmail.com");
  });
});

describe("isNewerVersion", () => {
  it("only true when latest is a larger number", () => {
    expect(isNewerVersion(3, 4)).toBe(true);
    expect(isNewerVersion(4, 4)).toBe(false);
    expect(isNewerVersion(5, 4)).toBe(false);
    expect(isNewerVersion(3, undefined)).toBe(false);
    expect(isNewerVersion("3", "10")).toBe(true);
  });
});

describe("safeToReload", () => {
  it("blocks on photos, typed work or a quiz", () => {
    expect(safeToReload({})).toBe(true);
    expect(safeToReload({ pendingPhotoCount: 1 })).toBe(false);
    expect(safeToReload({ hasTypedWork: true })).toBe(false);
    expect(safeToReload({ quizActive: true })).toBe(false);
  });
});

describe("photosFreeable", () => {
  it("includes only published submissions that hold photos", () => {
    const subs = [
      { id: "a", status: "published", photoPages: ["xxxx", "yy"] },
      { id: "b", status: "pending", photoPages: ["zzz"] },
      { id: "c", status: "returned", photoPages: ["zzz"] },
      { id: "d", status: "published", photoPages: [] },
      { id: "e", status: "published", photoData: "old" },
      { id: "f", status: "published" },
    ];
    expect(photosFreeable(subs)).toEqual([
      { id: "a", pages: 2, bytes: 6 },
      { id: "e", pages: 1, bytes: 3 },
    ]);
  });
});

describe("photoSig", () => {
  it("changes when pages are added, removed or resized", () => {
    expect(photoSig({ photoPages: ["aa", "bbb"] })).toBe("2:5");
    expect(photoSig({ photoData: "xyz" })).toBe("1:3");
    expect(photoSig({})).toBe("0:0");
    expect(photoSig({ photoPages: ["aa"] })).not.toBe(photoSig({ photoPages: ["aa", "b"] }));
  });
});
