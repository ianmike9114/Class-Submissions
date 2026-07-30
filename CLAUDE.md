# CLAUDE.md

Guidance for Claude Code working in this repo.

## What this is

Static site (GitHub Pages) + Firebase **Auth + Firestore only** (free
Spark plan — no credit card, ever). Students sign in with Gmail, submit a
**link** (Google Doc/PDF, CodePen or GitHub Gist, Drive, or YouTube — no
file uploads) per subject/section/assignment. Teacher grades each
submission with a single score out of the assignment's total points, with
an optional Drive/Docs rubric-reference link shown alongside the score box
for their own use, then publishes to the student. Single teacher = the
only admin, hardcoded by email — no multi-admin system, no password system
(Google Sign-In only).

**AI rubric-check is hidden, not deleted.** `js/teacher.js`'s
`AI_CHECK_ENABLED` flag (currently `false`) gates the "Run AI Check"
button, the Settings gear (only the Gemini key box lives there today), and
the "AI drafted" filter option — flip it back to `true` to restore all
three. `js/gemini.js` (`runRubricCheck()`, calls Gemini directly from the
browser with the teacher's own key) is untouched underneath. Hidden
because per-call Gemini cost wasn't worth it for real usage; see the
grading-model note below for why re-enabling isn't a pure flip.

**No Firebase Storage, no Cloud Functions — deliberately.** Both require
the paid Blaze plan just to exist, even at zero usage, which was a hard
constraint for this project. If a future change seems to need either,
stop and flag it — it breaks the zero-cost guarantee, don't add silently.

Full setup steps: `README.md`. This file is for **where to edit**, not
how to deploy.

## Architecture (3 layers, no build step)

- **Frontend**: plain HTML/CSS/JS, no bundler. `index.html` (login) →
  `teacher.html` or `student.html` based on whether the signed-in email
  matches `TEACHER_EMAIL`. Firebase JS SDK loaded via CDN ES modules.
- **Firebase**: Auth (Google only) + Firestore (data) only.
- **AI**: `js/gemini.js` calls the Gemini API directly from the browser
  using the teacher's own key (never the student's, never in git).
- **Rules are the real access control** — `firestore.rules`, not the
  frontend code. Any change to who-can-do-what goes there, not just in
  the UI.

`TEACHER_EMAIL` / the admin check is duplicated in **2 places** on
purpose (no shared config in a static-site setup) — if you ever change the
teacher's email, update both: `firestore.rules`, `js/firebase-config.js`.

**Sign-in uses Google Identity Services directly, not
`signInWithPopup`/`signInWithRedirect`.** Both of those route through a
cross-domain hop (this site → the Firebase `authDomain` → Google → back)
that modern browsers' third-party storage partitioning silently breaks
with zero console error, reproduced on Edge and Brave alike during setup.
`js/auth.js`'s `initGoogleSignIn()` instead gets an ID token from Google's
own widget (loaded via the `accounts.google.com/gsi/client` script tag on
`index.html`) and hands it to Firebase via `signInWithCredential` — no
cross-domain redirect involved. This needs `GOOGLE_CLIENT_ID` in
`js/firebase-config.js` (Firebase Console → Authentication → Sign-in
method → Google → Web SDK configuration → Web client ID) **and** that
same client ID's Authorized JavaScript origins (Google Cloud Console →
Credentials, separate from Firebase's own Authorized domains list) must
include the site's real origin. Do not revert to
`signInWithPopup`/`signInWithRedirect` without a strong reason — it was
tried first and silently failed cross-browser.

## Task map — common changes → exact edit location

| Change | Edit |
|---|---|
| Teacher dashboard UI/behavior (subjects/sections/assignments/submissions review/publish/Settings) | `js/teacher.js` + `teacher.html` |
| Grading (single score out of an assignment's total points, optional rubric-reference link/embed on Review) | `js/teacher.js` (`openReview()`, `totalPoints` on `assignments`, `finalGrade{score,feedback}` on `submissions`) — replaced the old per-criterion rubric builder; see limitations |
| AI rubric-check on/off | `js/teacher.js`'s `AI_CHECK_ENABLED` flag (top of file) — hidden by default, code (`js/gemini.js`) untouched |
| School Year / Term on a Subject | `js/teacher.js` (`add-subject-form` handler, `loadSubjects()`, `openSubject()`) + `teacher.html`'s `#subject-year`/`#subject-term` — one Subject per term, teacher creates a new one each term |
| Student dashboard UI/behavior (join class/submit a link/view results) | `js/student.js` + `student.html` |
| Google Sign-In / role routing (teacher vs student) | `js/auth.js` (uses Google Identity Services directly + `signInWithCredential`, not Firebase's own popup/redirect — see note below) |
| Firebase project keys / teacher email constant (frontend) | `js/firebase-config.js` |
| Who can read/write what in Firestore | `firestore.rules` |
| AI rubric-check logic (prompt, Gemini model/params, key storage, image-vision fetch) | `js/gemini.js` (`runRubricCheck()`; `tryFetchImagePart()` for "image" assignments — best-effort, see limitations; `photoData` param sends an in-app camera capture directly as inline image data, no link needed) |
| In-app camera photo capture, multi-page (student, "image" and "document" assignments) | `js/student.js` (`compressImage()` per photo, `pendingPhotos` Map + `renderPhotoThumbs()` — up to `MAX_PHOTOS` (3) pages per submission, each capped at `PER_PHOTO_MAX_LEN` chars so all of them together still fit Firestore's 1MiB doc cap; saved as `submissions.photoPages` string[] of base64 data URLs, no Storage involved; `renderSubmitForm()`'s type check gates which assignment types show the camera input) + `js/teacher.js` (`loadSubmissions()` renders a `.photo-thumbs` row when `photoPages` is set, falls back to the legacy single `photoData` field for submissions made before multi-page support) |
| Delete a subject, section, or assignment | `js/teacher.js` (`loadSubjects()`/`loadSections()`/`loadAssignments()`'s delete buttons) — only removes that doc itself, does NOT cascade-delete what's under it (see limitations); subjects also have Archive as a non-destructive alternative |
| Inline submission preview (which links embed vs. fall back to a plain link) | `js/embed.js` (`toEmbedUrl()`) |
| Roster seeding (per section) / Records gradebook grid (grouped by component - Written Work / Performance Task) | `js/teacher.js` (`renderRosterPreview()`, `addRosterNames()` for manual typed/pasted entry, `loadRecords()`) + `teacher.html` (`#view-records`) — the Class Record `.xlsx` upload (`loadWorkbook()`, `js/class-record.js`) is still there as a "Or upload instead" fallback, but manual entry is the default path; `openSection()` preloads the section's already-saved roster into the same editable list so it's not a one-shot upload-only flow |
| Home button (jump to `view-subjects` from any depth) | `teacher.html`'s header `#go-home` + `js/teacher.js`'s listener (same body as `back-to-subjects`) |
| In-app-browser sign-in warning (Messenger/Instagram/Line/TikTok links) | `index.html`'s inline module script, `isInAppBrowser()` (user-agent sniff) + `#in-app-browser-warning` banner - Google blocks OAuth inside these embedded WebViews on purpose (`disallowed_useragent`), can't be bypassed, only worked around by pointing the user at a real browser (Android gets an `intent://` "Open in Chrome" button, everyone gets "Copy link") |
| Sign-in failure notification (GIS script didn't load, credential exchange failed, or a slow-load timeout) | `index.html`'s `showError()`/`FRIENDLY_ERRORS` + the `#error` box (hidden until something actually fails) |
| Preventing duplicate enrollment in the same section, join success feedback | `js/student.js`'s `join-form` handler (checks for an existing `enrollments` doc for that `studentUID`+`sectionId` before enrolling either way) |
| Settings panel toggle (Gemini key, hidden by default) | `teacher.html`'s header `#toggle-settings` button + `#settings-panel` (starts with `hidden` class, independent of the `show()` view stack so it stays open/closed across navigation) |
| Enrolled students list (subject-wide from `#view-subject`, or one section only from `#view-section`'s own "View Enrolled Students" button) + removing a wrong/duplicate enrollment | `js/teacher.js` (`openEnrolled(onlySectionId)` - omit the arg for subject-wide, pass `state.sectionId` for one section; `deleteDoc` on the Remove button) + `teacher.html` (`#view-enrolled`, shared by both entry points) |
| Join flow / pick-your-name-from-roster | `js/student.js` (`join-form` handler, `renderNamePicker()`, `claimedNames()`, `enroll()`) + `student.html`'s `#join-name-picker` — only kicks in when the section already has a roster (`sections.roster`), otherwise falls back to using the Google account name |
| Student's Assignments list grouping by subject | `js/student.js` (`loadEverything()` — groups by `subjectName` via a `sectionId → subjectName` map built from the student's own enrollments) |
| Styling / UI patterns (cards, buttons, tables, collapsibles, status colors) | `DESIGN_SYSTEM.md` first — has every pattern with copy-pasteable HTML, avoids re-reading `css/style.css` from scratch. Only open `css/style.css` itself for a genuinely new pattern not covered there. |
| Firestore deploy config | `firebase.json`, `.firebaserc` |
| Setup/deploy instructions | `README.md` |

## Data model (Firestore)

- `subjects` — name, gradeLevel, schoolYear (free text, e.g. "2026-2027"), term ("1"|"2"|"3"), archived. Old subjects from before Term/Year existed just show "—" for both — not backfilled.
- `sections` — subjectId, sectionName, joinCode
- `assignments` — subjectId, sectionId, title, instructions (free text shown to students - objective/output format/anything they need), instructionsLink (optional Drive/Docs link to an instructions file, embedded via `js/embed.js`'s `toEmbedUrl()` same as submission previews), component ("written" | "performance" - drives the Records grid's grouped header, older assignments without this land in a fallback "Other" group), dueDate, allowedFileTypes (a link-type hint, not an upload constraint), totalPoints (number - the score cap, teacher grades one raw number against this), rubricReferenceLink (optional Drive/Docs link to the teacher's own rubric PDF/Word, shown embedded on the Review screen for the teacher's reference only - not parsed, not used to compute anything)
- `submissions` — assignmentId, studentUID, studentName, link (may be empty if `photoPages` is used instead), photoPages (optional - string[] of base64 `data:image/jpeg;base64,...` pages from in-app camera capture on "image"/"document" assignments, up to `MAX_PHOTOS` (3), each compressed client-side to `PER_PHOTO_MAX_LEN` so the whole array still fits the 1MiB Firestore doc cap; no Storage; older submissions may instead have a single `photoData` string field - both are handled on display), status(pending/published — "ai-drafted" only appears on submissions graded before AI check was hidden), finalGrade{score, feedback} (score is a single number out of the assignment's `totalPoints`)
- `enrollments` — studentUID, studentName (if the section had a roster at
  join time, this is the exact roster spelling the student picked via
  `js/student.js`'s name picker, not their Google account name - see
  `sections.roster` below), studentEmail (student's Gmail - added for the
  Enrolled Students list; enrollments created before this field was added
  just show blank there), subjectId, subjectName, sectionId, sectionName
  (created when a student enters a join code)
- `sections.roster` — string[] of official student names, set via the Set
  Roster upload in `view-section` (`.xlsx`-reading, same `loadWorkbook()`
  as before). Drives two things: (1) at join time, `js/student.js`'s
  `renderNamePicker()` makes the student pick their name from this list
  instead of trusting their Google display name, so `studentName` matches
  the roster exactly by construction going forward - already-claimed names
  are excluded from the picker (`claimedNames()`, queried live against
  `enrollments`); (2) the Records grid's rows — matched against
  `enrollments.studentName` (case-insensitive) to find each roster
  student's actual submissions. A roster name with no matching enrollment
  shows as "Not joined" rather than being silently omitted — that's the
  whole point of seeding from the real roster instead of just listing
  whoever self-enrolled.

## Known v1 limitations (deliberate, see README)

- No file uploads — everything is a link. Non-YouTube links must be shared
  "anyone with the link can view" or the AI (and the teacher) can't open
  them.
- AI rubric-check is hidden by default (`AI_CHECK_ENABLED = false` in
  `js/teacher.js`) — real usage showed the per-call Gemini cost wasn't
  worth it. The code underneath (`js/gemini.js`'s `runRubricCheck()`,
  `tryFetchImagePart()` for image-vision input) is untouched, but it still
  expects `assignment.rubric` (per-criterion), which assignments no longer
  have now that grading is a single `totalPoints` score — re-enabling the
  flag would need a small adapter (e.g. treat the whole assignment as one
  criterion) before `runAiCheck()` would work again, not a pure flip.
- Deleting a subject, section, or assignment (`js/teacher.js`) only
  removes that document itself — it does not cascade-delete what
  references it (sections/assignments/submissions/enrollments). Those
  become unreachable through the UI (nothing queries a deleted
  `subjectId`/`sectionId`/`assignmentId`) but still exist in Firestore.
  Deliberate simplification, not a bug — flag to the user if this ever
  needs to become a real cascade delete.
- Records grid's Written Work / Performance Task grouping is a plain
  `component` field on the assignment, not any weighted-grade computation
  — deliberately does not replicate DepEd's WW/PT/QA percentage +
  transmutation math. Teacher confirmed raw per-assignment totals are
  enough; they finalize grades themselves in their real Class Record. Do
  not build weighted/transmuted grade computation without being asked.
- No roster CSV import — students self-enroll via section join-code only.
- **No Class Record `.xlsx` export.** Removed by request — the teacher
  finalizes and encodes all final grades themselves in their real Class
  Record; the app deliberately doesn't write scores into it. `js/class-record.js`
  now only exposes `loadWorkbook()` (used by roster seeding, see above) —
  no `matchStudents()`/`applyAndDownload()`, no export UI in `teacher.html`.
  Don't re-add an export feature without being asked.
- **Grading is a single raw score, not rubric criteria.** Switched from a
  per-criterion rubric builder to one `totalPoints` number per assignment
  and one `finalGrade.score` per submission — teacher found typing rubric
  rows for every assignment more setup than it was worth. The Drive/Docs
  rubric-reference link still exists but is purely visual now (embedded on
  the Review screen next to the score box), not parsed by anything.
- `js/class-record.js`'s `loadWorkbook()` row-walk stops on the first cell
  that isn't SheetJS type `"s"` (string), deliberately — not just "isn't
  empty". Confirmed against a real DepEd Class Record: unused rows below
  the last real student aren't blank, they hold a formula that evaluates
  to the number `0`, out to row 119+. A plain non-null/non-empty check
  would sweep those up as fake students. Don't loosen this check.
- No real-time listeners (`onSnapshot`) — lists refresh on load/action, not
  live. Fine at single-class scale; add if it ever matters.
- Sign-in genuinely cannot work inside Facebook/Messenger/Instagram/Line/
  TikTok's embedded in-app browsers — Google's OAuth rejects the request
  itself (`disallowed_useragent`), this app has zero ability to bypass it.
  `index.html`'s `isInAppBrowser()` detects the common ones and shows an
  escape-hatch banner (Copy link, and on Android an `intent://` "Open in
  Chrome" button) instead of leaving the user on a dead sign-in screen. The
  UA-sniff list is best-effort, not exhaustive — add more app signatures to
  it if a teacher reports the same blank-screen symptom from a different
  app's share link.
- Removing an enrollment (the "Remove" button in Enrolled Students,
  `js/teacher.js`) only deletes that `enrollments` doc — same
  non-cascading simplification as the subject/section/assignment deletes.
  Any submissions that student already made under that enrollment are
  untouched and still exist, just no longer tied to a live enrollment; if
  they rejoin (even picking a different roster name), those old
  submissions won't reappear under the new enrollment. Deliberate, not a
  bug — flag if this ever needs real cleanup.
- In-app camera capture (`photoPages`) only exists for "image" and
  "document" assignments, as an alternative to pasting a link — not a
  general file-upload feature. Capped at `MAX_PHOTOS` (3) pages per
  submission — enough for a typical multi-page handwritten answer, but not
  unlimited (shared 1MiB Firestore doc budget across however many pages
  are added). `js/student.js`'s `compressImage()` resizes each photo to
  max 1280px and drops JPEG quality until it's under `PER_PHOTO_MAX_LEN`
  (300,000 chars/photo, so 3 photos stay well inside the 1MiB cap
  alongside the rest of the submission's fields). Very detailed/high-res
  photos (e.g. dense handwriting) can lose some sharpness to this
  compression — if that's ever a problem, the student can still fall back
  to the Drive-link path instead.

## Conventions

- No bundler/build step by design — keep it deployable as-is to GitHub
  Pages. If you add a dependency to the frontend, use a CDN ESM import
  (see `js/firebase-config.js` for the pattern), don't introduce npm/webpack
  for the static site.
- Do not reintroduce Firebase Storage or Cloud Functions — see the
  "deliberately" note above.
