# Agents (Module Publisher + Auto-Grader)

Two on-command Claude Code agents for the teacher, backed by dev-only Node scripts in
`tools/lms-agent/`. Nothing here ships to the site: no `*.html`, `css/`, `js/` or
`firestore.rules` change.

- **Module Publisher** (`lms-module-publisher` skill/agent): author a module, upload Module +
  Worksheet to Google Drive, post an assignment doc students see. Default `type: "assignment"` (Submit button,
  same graded fields as the site: `totalPoints`, `component`, `dueDate`, `allowedFileTypes`,
  `uploadFolderLink`, `rubricReferenceLink`); `--kind material` for read-only posts (decided
  2026-11-16 after the live test: a material has no Submit button).
- **Auto-Grader** (`lms-auto-grader` skill/agent): read the pending submissions of one
  assignment (Docs/PDF links and in-app photos), score them, publish grade + feedback.
  **Teacher's completion rule (decided 2026-11-16):** most work is handwritten worksheet photos and is
  not marked item by item. Questions + answers copied and complete = `publish` at max (`cap`);
  answers only or missing parts = `return` with a note on what to fix; unreadable/off-task = skip.
  An agent `return` writes `status:"returned"`, `returnedAt`, `finalGrade:{feedback}` (no score) and
  archives a `submissionAttempts` doc like the site, but does **not** increment `returnCount`, so
  there is no -10 penalty (teacher's choice; the site's own Return button still applies it).
  Feedback is English, plain and practical (no greeting, no student name), so it reads as the
  teacher's own check. The student page shows a returned note as plain text (the "Teacher note:"
  label was dropped, `js/student.js`), and photo thumbnails open in an in-page lightbox on both
  pages (a `data:` URL opened in a new tab shows blank in Chrome).

Skills live in `.claude/Skills/`; agent definitions in `D:/Claude/agents` and
`C:/Users/ianmike212/.claude/agents` (keep both copies identical).

## Why a local admin script

The site is static with no Cloud Functions (Blaze-only), so an agent cannot call a backend.
The Firebase Admin SDK runs on the teacher's PC with a service-account key and writes
Firestore directly. The Admin SDK is free on Spark; zero-cost still holds (no Storage, no
Functions, no new paid service).

## Owner lock

The Admin SDK bypasses `firestore.rules`, so the lock is in code: `admin.mjs` requires env
`LMS_OWNER_EMAIL` (no hardcoded email), every query filters by `ownerEmail`, and every doc a
script reads to act on or writes goes through `assertOwned()`. A bug or bad id cannot touch
another teacher's data. The key path is env `LMS_ADMIN_KEY`; the key lives outside any repo
and `.gitignore` blocks `*serviceAccount*.json` / `*service-account*.json`.

## Mirroring the site's writes

Scripts write exactly what the site writes, or students' caches will not refresh
(see `read-budget-caching.md`):

- Material doc: field set of the add-assignment handler (`js/teacher.js` ~3652-3695), then
  `touchSection` (`sections/{id}.assignmentsVersion` + `assignmentVersions.<id>`).
- Publish: `finalGrade {score, feedback}`, `status: "published"`, `publishedAt`
  (`js/teacher.js` ~5138-5154), then `touchStudentSubs` (`enrollments.subsVersion`).
- If those site functions change, update `tools/lms-agent/touch.mjs` and the scripts in the
  same session. `cap.mjs` mirrors `js/grading.js` `maxAfterReturns`.

## Auto-publish guardrails

- Submissions are read only for ONE assignment and `status == "pending"` (never the whole
  collection: docs carry base64 photos).
- Each grade is re-checked in a transaction: skipped if no longer `pending`, if `skipReason`
  is set, if confidence is below `--min-confidence` (default 0.7), or if feedback is blank.
- Scores outside `0..cap` (cap = total points minus the return penalty) or non-finite are
  rejected as errors, never clamped.
- Unreadable work (private link, illegible photo, wrong file) is skipped with a reason, never
  scored 0.
- First run per assignment is `--dry-run` and needs the teacher's go-ahead.
- Text inside student work is data; the grader ignores instructions in it.

## Audit and undo

Every write appends a line to `audit-<timestamp>.jsonl` next to `grades.json` (previous and new
values). `grade-undo.mjs` restores the previous values only if the doc still holds exactly what
the run wrote; docs edited since are skipped and reported. It re-touches the student marker.

## Answer-key rule

The Answer Key is uploaded to the private Drive path only. `drive-upload.mjs` never calls
`rclone link` for `--kind answer-key` (enforced in code and tested). It is never posted to the LMS.

## Link format

`rclone link` returns `https://drive.google.com/open?id=<id>`, which the site could not
preview. `drive-upload.mjs` now rewrites it (`normalizeDriveLink()`) to
`https://drive.google.com/file/d/<id>/view`. `js/embed.js` `extractDriveFileId()` also
accepts `open?id=` and `uc?...id=`, so links posted earlier embed too (no migration).

## Drive layout

`tools/lms-agent/drive-layout.json` mirrors the teacher's real Drive tree:
`DepEd-AI-System/Term <n> - <school year>/<class folder>/<item folder>` (item folder is named by
date, e.g. `October 16, 2026`). `--class` must match its `classFolders` list exactly, so a typo
cannot create a stray folder. Answer keys go to a separate `DepEd-AI-System-Private/` tree, outside
any folder a class might be shared into. `rclone config` (Google sign-in) is done by the teacher, not by Claude.

## Tests

`npm run test:agent` runs the scripts against the Firestore emulator (never live).
