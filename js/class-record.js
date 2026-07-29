// Client-side only Class Record (.xlsx) export - no backend, no upload.
// Uses the global `XLSX` from the SheetJS CDN script tag in teacher.html.

let workbook = null;
let sheetName = null;
let nameColLetter = null;
let startRow = null;

function colLetterToIndex(letter) {
  let n = 0;
  for (const ch of letter.trim().toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n - 1; // 0-based
}

function cellRef(colLetter, row) {
  return `${colLetter.trim().toUpperCase()}${row}`;
}

// Loads the workbook and extracts { row, name } pairs from the given
// column, starting at startRowNum, stopping at the first empty cell.
export async function loadWorkbook(file, { sheet, nameCol, dataStartRow }) {
  const buffer = await file.arrayBuffer();
  workbook = XLSX.read(buffer, { type: "array" });
  sheetName = sheet?.trim() || workbook.SheetNames[0];
  nameColLetter = nameCol;
  startRow = Number(dataStartRow);

  if (!workbook.Sheets[sheetName]) {
    throw new Error(`Sheet "${sheetName}" not found. Sheets in this file: ${workbook.SheetNames.join(", ")}`);
  }
  const ws = workbook.Sheets[sheetName];

  const rows = [];
  let row = startRow;
  while (true) {
    const cell = ws[cellRef(nameColLetter, row)];
    const name = cell?.v != null ? String(cell.v).trim() : "";
    if (!name) break;
    rows.push({ row, name });
    row++;
  }
  return rows;
}

export function totalScore(scorePerCriterion) {
  return Object.values(scorePerCriterion || {}).reduce((sum, v) => sum + (Number(v) || 0), 0);
}

// Matches each submission's studentName against extracted roster rows
// (exact, case-insensitive). Unmatched entries get matchedRow: null -
// caller must let the teacher confirm/pick before writing anything.
export function matchStudents(submissions, rosterRows) {
  return submissions.map((s) => {
    const found = rosterRows.find(
      (r) => r.name.toLowerCase() === s.studentName.toLowerCase()
    );
    return {
      submissionId: s.id,
      studentName: s.studentName,
      score: totalScore(s.finalGrade?.scorePerCriterion),
      matchedRow: found ? found.row : null,
    };
  });
}

// confirmedMatches: [{ score, matchedRow }] - only rows the teacher approved.
// Writes score into scoreColLetter at each matchedRow, then downloads.
export function applyAndDownload(confirmedMatches, scoreColLetter, downloadName) {
  const ws = workbook.Sheets[sheetName];
  for (const { score, matchedRow } of confirmedMatches) {
    if (matchedRow == null) continue;
    ws[cellRef(scoreColLetter, matchedRow)] = { t: "n", v: score };
  }
  XLSX.writeFile(workbook, downloadName);
}
