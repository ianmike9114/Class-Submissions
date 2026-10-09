// Unit tests for js/class-record.js.
//
// The correctness-critical rule (CLAUDE.md warns against loosening it): the
// roster row-walk must stop on the first cell that isn't SheetJS string type
// "s", NOT just the first empty cell. DepEd's Class Record template pre-fills
// unused rows out past the real roster with a formula that evaluates to the
// NUMBER 0 (type "n"), so a plain non-empty check would sweep dozens of fake
// "0" students into the roster.
//
// XLSX is a global (SheetJS CDN) in the real app; here we stub globalThis.XLSX
// and hand loadWorkbook a fake File with arrayBuffer().

import { describe, it, expect, afterEach, vi } from "vitest";
import { cellRef, loadWorkbook } from "../../js/class-record.js";

describe("cellRef", () => {
  it("uppercases and trims the column, appends the row", () => {
    expect(cellRef("b", 5)).toBe("B5");
    expect(cellRef("  c ", 12)).toBe("C12");
  });
});

// Build a fake SheetJS worksheet from a { A1: {t,v}, ... } literal.
function fakeWorkbook(cells, sheetName = "Sheet1") {
  return {
    SheetNames: [sheetName],
    Sheets: { [sheetName]: cells },
  };
}

function fakeFile() {
  // loadWorkbook only calls file.arrayBuffer(); the bytes are ignored because
  // XLSX.read is stubbed to return our fixture workbook.
  return { arrayBuffer: async () => new ArrayBuffer(8) };
}

describe("loadWorkbook row-walk", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("collects consecutive string-typed name cells", async () => {
    const wb = fakeWorkbook({
      B2: { t: "s", v: "Dela Cruz, Juan" },
      B3: { t: "s", v: "Santos, Maria" },
      B4: { t: "s", v: "Reyes, Pedro" },
    });
    vi.stubGlobal("XLSX", { read: () => wb });

    const rows = await loadWorkbook(fakeFile(), {
      sheet: "Sheet1",
      nameCol: "B",
      dataStartRow: 2,
    });
    expect(rows).toEqual([
      { row: 2, name: "Dela Cruz, Juan" },
      { row: 3, name: "Santos, Maria" },
      { row: 4, name: "Reyes, Pedro" },
    ]);
  });

  it("STOPS at a numeric formula-0 cell (does not sweep fake students)", async () => {
    const wb = fakeWorkbook({
      B2: { t: "s", v: "Real Student One" },
      B3: { t: "s", v: "Real Student Two" },
      // DepEd template's trailing formula rows: number 0, type "n"
      B4: { t: "n", v: 0 },
      B5: { t: "n", v: 0 },
      B6: { t: "s", v: "Should NOT be reached" },
    });
    vi.stubGlobal("XLSX", { read: () => wb });

    const rows = await loadWorkbook(fakeFile(), {
      nameCol: "B",
      dataStartRow: 2,
    });
    expect(rows.map((r) => r.name)).toEqual([
      "Real Student One",
      "Real Student Two",
    ]);
  });

  it("trims surrounding whitespace on names", async () => {
    const wb = fakeWorkbook({ A1: { t: "s", v: "  Padded Name  " } });
    vi.stubGlobal("XLSX", { read: () => wb });

    const rows = await loadWorkbook(fakeFile(), { nameCol: "A", dataStartRow: 1 });
    expect(rows).toEqual([{ row: 1, name: "Padded Name" }]);
  });

  it("defaults to the first sheet when none is named", async () => {
    const wb = fakeWorkbook({ A1: { t: "s", v: "Only" } }, "RosterTab");
    vi.stubGlobal("XLSX", { read: () => wb });

    const rows = await loadWorkbook(fakeFile(), { nameCol: "A", dataStartRow: 1 });
    expect(rows).toEqual([{ row: 1, name: "Only" }]);
  });

  it("throws a helpful error when the named sheet is missing", async () => {
    const wb = fakeWorkbook({ A1: { t: "s", v: "x" } }, "Sheet1");
    vi.stubGlobal("XLSX", { read: () => wb });

    await expect(
      loadWorkbook(fakeFile(), { sheet: "Nope", nameCol: "A", dataStartRow: 1 })
    ).rejects.toThrow(/not found/i);
  });
});

import { readExamScores, pickBestSheet } from "../../js/class-record.js";

// Shaped like the teacher's real item-analysis sheet: header on row 19
// (B "No.", C "Learner", D "Score", E "Score (%)"), learners from row 20,
// "Highest Possible Score:" label in G21 with the number in H21.
function itemAnalysisSheet() {
  const ws = {
    B19: { t: "s", v: "No." }, C19: { t: "s", v: "Learner" }, D19: { t: "s", v: "Score" }, E19: { t: "s", v: "Score (%)" },
    G20: { t: "s", v: "Number of Examinees:" }, H20: { t: "n", v: 24 },
    G21: { t: "s", v: "Highest Possible Score:" }, H21: { t: "n", v: 30 },
    C20: { t: "s", v: "AQUINO, DIETHER CALAGNAS" }, D20: { t: "n", v: 12 }, E20: { t: "n", v: 40 },
    C21: { t: "s", v: "CASTELO, JERIC SOMBILON" }, D21: { t: "n", v: 17 }, E21: { t: "n", v: 57 },
    C22: { t: "s", v: "ABSENT, NO SCORE" },
    C23: { t: "s", v: "FEMALE" },
    C24: { t: "s", v: "DISCIPULO, ANGEL ALMAZAN" }, D24: { t: "n", v: 24 },
    // template filler below the roster: formula evaluating to number 0
    C25: { t: "n", v: 0 }, C26: { t: "n", v: 0 }, C27: { t: "n", v: 0 }, C28: { t: "n", v: 0 },
    C29: { t: "s", v: "SHOULD NOT BE READ" }, D29: { t: "n", v: 1 },
  };
  return ws;
}

describe("readExamScores", () => {
  it("detects Learner/Score columns, skips Score (%), reads max", () => {
    const { rows, maxScore } = readExamScores(itemAnalysisSheet());
    expect(maxScore).toBe(30);
    expect(rows).toEqual([
      { name: "AQUINO, DIETHER CALAGNAS", score: 12 },
      { name: "CASTELO, JERIC SOMBILON", score: 17 },
      { name: "DISCIPULO, ANGEL ALMAZAN", score: 24 },
    ]);
  });

  it("stops after more than 3 non-name rows", () => {
    const names = readExamScores(itemAnalysisSheet()).rows.map((r) => r.name);
    expect(names).not.toContain("SHOULD NOT BE READ");
  });

  it("throws a clear error when the header is missing", () => {
    expect(() => readExamScores({ A1: { t: "s", v: "Hello" } })).toThrow(/Learner/);
  });

  it("returns null max when no Highest Possible Score label", () => {
    const ws = itemAnalysisSheet();
    delete ws.G21;
    expect(readExamScores(ws).maxScore).toBeNull();
  });
});

describe("pickBestSheet", () => {
  const sheets = ["Grade 10 - CSS", "Grade 12 - STEM 12", "Grade 12 - EMPOWERMENT TECH"];
  it("picks the sheet sharing the most words with the section/subject", () => {
    expect(pickBestSheet(sheets, ["CSS", "Grade 10 ICT"])).toBe("Grade 10 - CSS");
    expect(pickBestSheet(sheets, ["STEM 12", "Empowerment Technologies"])).toBe("Grade 12 - STEM 12");
  });
  it("falls back to the first sheet", () => {
    expect(pickBestSheet(sheets, ["Orchids"])).toBe("Grade 10 - CSS");
  });
});
