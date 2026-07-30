// Client-side only Class Record (.xlsx) roster reader - no backend, no upload.
// Uses the global `XLSX` from the SheetJS CDN script tag in teacher.html.

function cellRef(colLetter, row) {
  return `${colLetter.trim().toUpperCase()}${row}`;
}

// Loads the workbook and extracts { row, name } pairs from the given
// column, starting at startRowNum, stopping at the first row whose cell
// isn't text. Deliberately checks cell.t === "s" (SheetJS's type tag for
// string cells), not just "is this cell non-empty" - DepEd's Class Record
// template pre-fills unused rows out to row 119+ with a formula that
// evaluates to the *number* 0, not a blank cell, so a plain "empty?" check
// would sweep up dozens of fake "0" students past the real roster.
export async function loadWorkbook(file, { sheet, nameCol, dataStartRow }) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = sheet?.trim() || workbook.SheetNames[0];

  if (!workbook.Sheets[sheetName]) {
    throw new Error(`Sheet "${sheetName}" not found. Sheets in this file: ${workbook.SheetNames.join(", ")}`);
  }
  const ws = workbook.Sheets[sheetName];

  const rows = [];
  let row = Number(dataStartRow);
  while (true) {
    const cell = ws[cellRef(nameCol, row)];
    const isTextCell = cell && cell.t === "s" && cell.v != null;
    const name = isTextCell ? String(cell.v).trim() : "";
    if (!name) break;
    rows.push({ row, name });
    row++;
  }
  return rows;
}

export function totalScore(scorePerCriterion) {
  return Object.values(scorePerCriterion || {}).reduce((sum, v) => sum + (Number(v) || 0), 0);
}
