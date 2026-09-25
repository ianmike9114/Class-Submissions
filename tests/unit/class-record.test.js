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
