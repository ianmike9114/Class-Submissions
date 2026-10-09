// Client-side only Class Record (.xlsx) roster reader - no backend, no upload.
// Uses the global `XLSX` from the SheetJS CDN script tag in teacher.html.

// Exported for unit tests; loadWorkbook() below uses it directly.
export function cellRef(colLetter, row) {
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

// ---------- exam score import (item-analysis workbook) ----------
// The teacher's exam item-analysis sheet has a "Learner" | "Score" table
// (plus a "Score (%)" column we must NOT pick) and a "Highest Possible
// Score:" label with the number a few cells to its right. Header row and
// columns vary between files, so detect them instead of hardcoding C/D.

const colLetter = (n) => {
  let s = "";
  for (n += 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};
const cellText = (cell) => (cell && cell.v != null ? String(cell.v).trim() : "");

// ws: a SheetJS worksheet (plain { A1: {t, v}, ... } object). Returns
// { rows: [{ name, score }], maxScore } - score rows with a blank or
// non-numeric score are left out (absent), maxScore is null if not found.
export function readExamScores(ws, { maxScanRows = 60, maxScanCols = 30 } = {}) {
  let headerRow = 0, nameCol = -1, scoreCol = -1;
  for (let r = 1; r <= maxScanRows && nameCol < 0; r++) {
    for (let c = 0; c < maxScanCols; c++) {
      if (/^learner/i.test(cellText(ws[`${colLetter(c)}${r}`]))) { headerRow = r; nameCol = c; break; }
    }
  }
  if (nameCol >= 0) {
    // The score header can sit on the Learner row or (merged headers) the
    // row just above/below it.
    for (const r of [headerRow, headerRow - 1, headerRow + 1]) {
      for (let c = 0; c < maxScanCols && scoreCol < 0; c++) {
        if (c !== nameCol && /^score$/i.test(cellText(ws[`${colLetter(c)}${r}`]))) scoreCol = c;
      }
      if (scoreCol >= 0) break;
    }
  }
  if (nameCol < 0 || scoreCol < 0) {
    throw new Error('Couldn\'t find the "Learner" and "Score" columns in this sheet.');
  }

  const rows = [];
  // Same string-type rule as loadWorkbook(): template rows below the last
  // learner hold formulas that evaluate to numbers, never text. Tolerate a
  // few non-name rows (MALE/FEMALE spacers, a blank line) before stopping.
  let gap = 0;
  for (let r = headerRow + 1; r < headerRow + 400 && gap <= 3; r++) {
    const cell = ws[`${colLetter(nameCol)}${r}`];
    const name = cell && cell.t === "s" ? cellText(cell) : "";
    if (!name || /^(male|female|boys?|girls?)$/i.test(name)) { gap++; continue; }
    gap = 0;
    const sc = ws[`${colLetter(scoreCol)}${r}`];
    const score = sc && sc.v !== "" && sc.v != null ? Number(sc.v) : NaN;
    if (Number.isFinite(score)) rows.push({ name, score });
  }

  let maxScore = null;
  for (let r = 1; r <= maxScanRows && maxScore === null; r++) {
    for (let c = 0; c < maxScanCols; c++) {
      if (!/highest possible score/i.test(cellText(ws[`${colLetter(c)}${r}`]))) continue;
      for (let c2 = c + 1; c2 < c + 6; c2++) {
        const v = ws[`${colLetter(c2)}${r}`];
        if (v && v.t === "n" && Number.isFinite(v.v)) { maxScore = v.v; break; }
      }
      break;
    }
  }
  return { rows, maxScore };
}

// Picks the sheet whose name shares the most words with the hints (section
// and subject names), so "Grade 10 - CSS" is preselected for section CSS.
// Falls back to the first sheet.
export function pickBestSheet(sheetNames, hints) {
  const words = (s) => (s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  const hintWords = new Set(hints.flatMap(words));
  let best = sheetNames[0], bestScore = 0;
  for (const name of sheetNames) {
    const score = words(name).filter((w) => hintWords.has(w)).length;
    if (score > bestScore) { best = name; bestScore = score; }
  }
  return best;
}
