---
name: student-lms
description: Modify the Class Submissions app — student link submission, join-code enrollment, single-score grading, submission review/publish, browser-side AI (Gemini) rubric-check drafting (currently hidden). Use for any change to teacher.html/student.html/js/*.js/firestore.rules in this repo.
---

# Student LMS routing

Don't explore the codebase first — `CLAUDE.md` in the repo root has the
full task map (change → exact file) and architecture summary. Read that
file, jump straight to the named file(s).

**Any UI/CSS/markup change → read `DESIGN_SYSTEM.md` first, not
`css/style.css`.** It has every pattern (cards, buttons, collapsible
details/summary, tables, status colors, embed iframes) as copy-pasteable
HTML with the exact class names — written specifically so you don't have
to re-derive the design system from the stylesheet every session.

Quick pointers:
- Teacher-side change → `js/teacher.js` (+ `teacher.html` if UI markup)
- Student-side change → `js/student.js` (+ `student.html` if UI markup)
- AI rubric-check on/off → `js/teacher.js`'s `AI_CHECK_ENABLED` flag (top of file, `false` by default — hides the Run AI Check button/Settings gear/"AI drafted" filter option, code untouched underneath); prompt/model/key logic itself → `js/gemini.js`
- Grading (single score out of an assignment's total points) → `js/teacher.js`'s `openReview()`, `assignments.totalPoints`, `submissions.finalGrade{score,feedback}`
- School Year / Term on a Subject → `js/teacher.js`'s `add-subject-form` handler / `loadSubjects()` / `openSubject()`, `teacher.html`'s `#subject-year`/`#subject-term` — one Subject per term
- Inline submission preview → `js/embed.js`
- Roster editing (manual typed/pasted names + gender, default) / Records gradebook grid grouped by gender → `js/teacher.js`'s `addRosterNames()` (parses `MALE`/`FEMALE` header lines as gender markers)/`renderRosterPreview()`/`loadRecords()` (xlsx upload via `loadWorkbook()` still there as a fallback, no gender data from it), `teacher.html`'s `#view-records` — `sections.roster` is `{name,gender}[]`, normalize legacy plain-string rosters on read (see `CLAUDE.md`)
- Editing an existing Subject's Year/Term / Section's name → `js/teacher.js`'s `editSubjectYearTerm()` / `editSectionName()`
- "Who's submitting" pending-count badge → `js/teacher.js`'s `getPendingCounts()`/`pendingBadge()`, wired into `loadSubjects()`/`loadSections()`/`loadAssignments()` — in-app only, real push needs a server piece (out of scope, see `CLAUDE.md`)
- Per-assignment scores summary (graded students only) → `js/teacher.js`'s `renderScoresSummary()` (called from `loadSubmissions()`), `teacher.html`'s `#scores-summary` — distinct from the section-wide Records grid
- Instructions/rubric reference on the submissions view → `js/teacher.js`'s `renderAssignmentContext()` (called from `openAssignment()`), `teacher.html`'s `#assignment-context`
- Fixing a garbled student name (from Enrolled Students OR a submission card) → `js/teacher.js`'s `renameStudentEverywhere(studentUID, newName)` — updates enrollments AND cached submission names together, single shared helper for both entry points
- Home button → `teacher.html`'s `#go-home`, `js/teacher.js`'s listener
- In-app-browser sign-in warning (Messenger/Instagram/etc. block Google OAuth) → `index.html`'s `isInAppBrowser()` + `#in-app-browser-warning`
- Sign-in failure notification / duplicate-enrollment prevention → `index.html`'s `showError()`, `js/student.js`'s `join-form` handler
- CodePen/embed patterns → `js/embed.js`
- Image AI-check vision fetch (best-effort, has a fallback) → `js/gemini.js`'s `tryFetchImagePart()`
- In-app camera photo capture, multi-page (student, "image" and "document" assignments) → `js/student.js`'s `compressImage()`/`pendingPhotos`/`renderPhotoThumbs()` (saves `submissions.photoPages` string[], up to `MAX_PHOTOS`, each capped at `PER_PHOTO_MAX_LEN` so they all fit Firestore's 1MiB doc cap - no Storage) + `js/teacher.js`'s `loadSubmissions()` (renders the array, falls back to legacy single `photoData`)
- Enrolled students list (subject-wide, or one section via its own button) + Remove a wrong enrollment, or Edit a garbled/raw Google display name in place → `js/teacher.js`'s `openEnrolled(onlySectionId)`, `teacher.html`'s `#view-enrolled`
- Join flow pick-your-name-from-roster → `js/student.js`'s `renderNamePicker()`/`claimedNames()`/`enroll()`, `student.html`'s `#join-name-picker` (only when the section has a roster; else falls back to the Google account name); QR/deep-link join (scan to join) → `CLAUDE.md` task map's "QR-code join" row
- Student's Assignments list grouped by subject → `js/student.js`'s `loadEverything()`
- Delete a subject/section/assignment (cascades to everything under it) → `js/teacher.js`'s `cascadeDeleteSubject()`/`cascadeDeleteSection()`/`cascadeDeleteAssignment()` + shared `deleteWhere()` helper — see `CLAUDE.md`
- Student fixing their own garbled name → `js/student.js`'s inline edit on "My classes" cards (`loadEverything()`) + `firestore.rules`'s `enrollments` update rule (studentName-only)
- Records grid Written Work / Performance Task grouping → `js/teacher.js`'s `loadRecords()` (plain `component` field, NOT weighted-grade math - see `CLAUDE.md`, don't build that without being asked)
- Section-wide activities overview (all assignments, grouped Written Work / Performance Task, title+points+due, for eyeballing/encoding into the Class Record) → `js/teacher.js`'s `renderActivitiesSummary()` (called from `loadAssignments()`), `teacher.html`'s `#activities-summary` — collapsed by default, distinct from the per-assignment scores summary and the Records grid
- Rubric reference file (Drive/Docs link, shown embedded on the Review screen for the teacher's own eyes only — not parsed, doesn't feed any scoring) → `assignments.rubricReferenceLink`, rendered in `js/teacher.js`'s `openReview()`
- Access control → `firestore.rules`
- Deploy/setup steps → `README.md`

Sign-in uses Google Identity Services directly (`js/auth.js`'s
`initGoogleSignIn()` + `signInWithCredential`), **not**
`signInWithPopup`/`signInWithRedirect` — those were tried first and
silently failed on Edge and Brave (cross-domain storage partitioning, zero
console error). Don't revert to them without understanding why they were
dropped; see `CLAUDE.md` for the full explanation.

Reminders specific to this repo:
- **No Firebase Storage, no Cloud Functions — this is deliberate**, not an
  oversight. Both require the paid Blaze plan just to exist, and staying
  fully free (no card, ever) was a hard requirement. Submissions are
  always a link (Doc/PDF/Gist/Drive/YouTube), and the AI check is a direct
  browser→Gemini call. Do not suggest adding either back without the user
  explicitly asking to take on that cost/complexity.
- `TEACHER_EMAIL` is duplicated in 2 files on purpose (no shared config in
  a static-site, no-build-step setup) — `firestore.rules` and
  `js/firebase-config.js`. If a change touches the teacher-identity check,
  update both.
- No bundler. Frontend JS is plain ES modules loaded straight in the
  browser (Firebase SDK via CDN). Don't introduce a build step.
- The Gemini API key lives in the teacher's browser localStorage only
  (`js/gemini.js`), set via the Settings box in `teacher.html`. Never hard
  code a key into any committed file.
- After any change to `firestore.rules`, remind the user they need to
  `firebase deploy --only firestore:rules` — local edits alone don't take
  effect.
- **No Class Record `.xlsx` export** — removed by request, teacher
  finalizes/encodes all grades themselves. `js/class-record.js` only has
  `loadWorkbook()` (roster seeding) left. Don't re-add without being asked.
- **Grading is a single raw score, not rubric criteria** — switched from a
  per-criterion rubric builder to one `totalPoints` per assignment, one
  `finalGrade.score` per submission. Don't re-add rubric-row grading
  without being asked.
