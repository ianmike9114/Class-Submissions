# Grading and records

Deliberate design decisions and known limits. Moved out of `CLAUDE.md` so they load only
when needed. Read before editing this area; add new notes for this area here.

- **Grading is single raw score, not rubric criteria.** Switched from
  per-criterion rubric builder to one `totalPoints` number per assignment
  and one `finalGrade.score` per submission — teacher found typing rubric
  rows for every assignment more setup than worth. Drive/Docs
  rubric-reference link still exists but purely visual now (embedded on
  Review screen next to score box), not parsed by anything.
- Records grid's Written Work / Performance Task grouping is plain
  `component` field on assignment, not any weighted-grade computation —
  deliberately doesn't replicate DepEd's WW/PT/QA percentage +
  transmutation math. Teacher confirmed raw per-assignment totals enough;
  they finalize grades themselves in real Class Record. Don't build
  weighted/transmuted grade computation without being asked.
- **Late-resubmission penalty: −10 max points per "Return for revision"**
  (by request, fairness for on-time students). The Return handler in
  `js/teacher.js` `openReview()` writes `returnCount: increment(1)` on the
  submission; `js/grading.js`'s `maxAfterReturns(totalPoints, returnCount)`
  (floor 0, negative counts ignored) caps the score box + `readValidScore()`,
  and `penaltyNote()` is shown to teacher (review card, scores summary, `*` +
  tooltip in records/Activities grids) and student (returned card, graded
  result). Score stays out of `totalPoints` - only the cap changes. "Allow
  redo" (student-requested) and quizzes don't count. Old docs (no field) = 0,
  not retroactive. **`firestore.rules` change:** student delete only while
  `pending` and `returnCount` is 0 (else delete + resubmit would reset it;
  "Remove submission" is also hidden) - **must `firebase deploy --only
  firestore:rules`**.
- **Manual exam scores (Summative 1, Summative 2, Term Exam).** Paper exams
  have no submission, so the teacher types scores straight into the
  Activities overview's Student scores matrix (`js/teacher.js`'s
  `renderActivityScores()`, `MANUAL_EXAMS`). Max points per section live on
  `section.manualExams.{summative1,summative2,termExam}`; each student's score
  on their `enrollment.manualScores.{key}` (**explicit Save button**, not auto-save, by
  request: typed boxes turn yellow = unsaved, `#manual-scores-save` writes all
  changed scores + maxes in one `writeBatch` with field-path updates, blank =
  `deleteField()`; `beforeunload` + `show()` confirm guard against leaving
  with unsaved boxes). Both docs already owner-writable,
  and `manualScores` is **not** in the student self-edit `hasOnly()` list, so
  **no `firestore.rules` change**. Row Total = published scores + exam scores
  whose max is set. Records grid (`loadRecords()`) shows the same columns
  read-only. Raw scores only, no WW/PT/QA weighting (see rule above).
  Not shown on `student.html`.
- **Import exam scores from the item-analysis `.xlsx`.** "📥 Import exam
  scores from Excel" inside Student scores (`js/teacher.js`'s
  `wireExamImport()`) fills one manual exam column from the teacher's own
  exam workbook (one tab per class, `Learner` | `Score` | `Score (%)` table,
  "Highest Possible Score:" label). `js/class-record.js`'s `readExamScores()`
  auto-detects the header (exact `Score`, so `Score (%)` is skipped), keeps
  the string-type name rule, tolerates ≤3 spacer rows, and reads the max;
  `pickBestSheet()` preselects the tab matching the section/subject name.
  Names match enrollments (studentName + roster name) via
  `matchesNameSearch`; 0 or >1 hits are flagged ⚠ and skipped, never
  guessed. Preview first, then one `writeBatch` (scores + section max).
  Client-side only, no rules change. Unit-tested in
  `tests/unit/class-record.test.js`.
- **No Class Record `.xlsx` export.** Removed by request — teacher
  finalizes and encodes all final grades themselves in real Class Record;
  app deliberately doesn't write scores into it. `js/class-record.js` now
  only exposes `loadWorkbook()` (used by roster seeding, see above) — no
  `matchStudents()`/`applyAndDownload()`, no export UI in `teacher.html`.
  Don't re-add export feature without being asked.
- `js/class-record.js`'s `loadWorkbook()` row-walk stops on first cell
  that isn't SheetJS type `"s"` (string), deliberately — not just "isn't
  empty". Confirmed against real DepEd Class Record: unused rows below
  last real student aren't blank, hold formula that evaluates to number
  `0`, out to row 119+. Plain non-null/non-empty check would sweep those
  up as fake students. Don't loosen this check.
- AI rubric-check hidden by default (`AI_CHECK_ENABLED = false` in
  `js/teacher.js`) — real usage showed per-call Gemini cost wasn't worth
  it. Code underneath (`js/gemini.js`'s `runRubricCheck()`,
  `tryFetchImagePart()` for image-vision input) untouched, but still
  expects `assignment.rubric` (per-criterion), which assignments no
  longer have now that grading is single `totalPoints` score —
  re-enabling flag would need small adapter (e.g. treat whole assignment
  as one criterion) before `runAiCheck()` works again, not pure flip.
