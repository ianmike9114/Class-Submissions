# CLAUDE.md

Guidance for Claude Code working in this repo.

## What this is

Static site (GitHub Pages) + Firebase **Auth + Firestore only** (free
Spark plan — no credit card, ever). Students sign in with Gmail, submit a
**link** (Google Doc/PDF, CodePen or GitHub Gist, Drive, or YouTube — no
file uploads) per subject/section/assignment. Teacher grades each
submission with a single score out of the assignment's total points, with
an optional Drive/Docs rubric-reference link shown alongside the score box
for their own use, then publishes to the student. Multiple teachers can
use the site, each isolated to their own subjects/sections/assignments/
submissions/enrollments; one super admin (hardcoded by email, see
`ADMIN_EMAIL` below) can see/edit any teacher's data and grants/revokes
other teachers' access. No password system either way (Google Sign-In
only).

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
  `teacher.html` or `student.html` based on `js/auth.js`'s
  `isTeacherEmail()` (async: `true` for `ADMIN_EMAIL`, or if a
  `teachers/{email}` doc exists — see Data model). Firebase JS SDK loaded
  via CDN ES modules.
- **Firebase**: Auth (Google only) + Firestore (data) only.
- **AI**: `js/gemini.js` calls the Gemini API directly from the browser
  using the teacher's own key (never the student's, never in git).
- **Rules are the real access control** — `firestore.rules`, not the
  frontend code. Any change to who-can-do-what goes there, not just in
  the UI.

**Two-tier admin model.** `ADMIN_EMAIL` (the super admin, formerly
`TEACHER_EMAIL`) is duplicated in **2 places** on purpose (no shared
config in a static-site setup) — if you ever change the super admin's
email, update both: `firestore.rules`, `js/firebase-config.js`. Regular
teachers are different: they're granted access by the super admin at
runtime (a `teachers/{email}` doc, added/removed from `teacher.html`'s
Settings panel), not hardcoded anywhere — see "Adding/removing a teacher
account" below and the `teachers` collection in Data model.

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

## Task map and data model

For "which file/function do I edit for change X" and the full Firestore
schema, see `.claude/Skills/student-lms/SKILL.md` (invoked automatically
for any change to this app's teacher/student/rules files) — that file
carries the detailed, frequently-changing reference; this file stays
short since it's loaded into every session automatically.

## Known v1 limitations (deliberate, see README)

- **Multi-teacher isolation is write-side and submissions/enrollments-read
  enforced, not fully read-locked on `subjects`/`sections`/`assignments`.**
  Those three collections stay readable by any signed-in user (unchanged
  from the single-teacher version) — a technically sophisticated other
  teacher could hand-craft a raw query to list subject/section names
  across teachers. No grades or student PII live in those collections
  (that's `submissions`/`enrollments`, which *are* fully owner-scoped on
  read); this was accepted rather than splitting join-code lookup into a
  separate world-readable `joinCodes` collection, which true list-level
  lock-down would require. Flag if this ever needs to change.
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
- **Deleting a subject, section, or assignment cascades** —
  `js/teacher.js`'s `cascadeDeleteSubject()`/`cascadeDeleteSection()`/
  `cascadeDeleteAssignment()` (built on a shared `deleteWhere(collection,
  field, value)` helper) walk down the same parent-child chain the rest
  of the app queries by and delete everything under the thing you
  deleted: subject → its sections → their assignments → their
  submissions, plus enrollments per section. This used to be
  non-cascading by design (documented as deliberate) until a deleted
  subject kept showing up on a student's dashboard — real confusion, not
  a hypothetical, so it was changed to a true cascade. No `firestore.rules`
  change was needed (delete on all four collections was already
  `isTeacher()`-only).
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
- **QR join is a same-origin deep link, generated entirely client-side.**
  `js/teacher.js`'s `renderSectionQR()` uses the `qrcodejs` CDN library to
  draw the QR in-browser — the join link (`student.html?code=...`) never
  goes to a third-party QR image API, matching the zero-cost/no-Storage
  constraint and avoiding leaking join codes to an external server.
- Sign-in genuinely cannot work inside Facebook/Messenger/Instagram/Line/
  TikTok's embedded in-app browsers — Google's OAuth rejects the request
  itself (`disallowed_useragent`), this app has zero ability to bypass it.
  `index.html`'s `isInAppBrowser()` detects the common ones and shows an
  escape-hatch banner (Copy link, and on Android an `intent://` "Open in
  Chrome" button) instead of leaving the user on a dead sign-in screen. The
  UA-sniff list is best-effort, not exhaustive — add more app signatures to
  it if a teacher reports the same blank-screen symptom from a different
  app's share link.
- Removing a single enrollment (the "Remove" button in Enrolled Students,
  `js/teacher.js`) still only deletes that one `enrollments` doc — this is
  a narrower, still-deliberate case, not the same as the subject/section/
  assignment cascade above (removing one enrollment shouldn't touch a
  student's actual submitted work). Any submissions that student already
  made under that enrollment are untouched and still exist, just no
  longer tied to a live enrollment; if they rejoin (even picking a
  different roster name), those old submissions won't reappear under the
  new enrollment. Flag if this ever needs to change.
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
- **No separate "decline a leave request without removing the student"
  action.** A teacher's only response to a flagged `leaveRequested` is
  Remove (fulfills it) or leaving it alone (the student can Cancel it
  themselves from their My Classes card). Flag if this ever needs to change.

## Conventions

- No bundler/build step by design — keep it deployable as-is to GitHub
  Pages. If you add a dependency to the frontend, use a CDN ESM import
  (see `js/firebase-config.js` for the pattern), don't introduce npm/webpack
  for the static site.
- Do not reintroduce Firebase Storage or Cloud Functions — see the
  "deliberately" note above.
- **`css/style.css`/`js/student.js`/`js/teacher.js` are loaded with a manual
  `?v=N` cache-buster** (`index.html`, `student.html`, `teacher.html`).
  GitHub Pages sets `Cache-Control: max-age=600` with no build step to
  content-hash filenames, so without this a deployed fix can sit invisible
  in a student's/teacher's browser for up to 10 minutes (longer with mobile
  disk caching) — bump the `?v=` on every file that changed, in every HTML
  file that references it, as part of shipping the change, not after
  someone reports "I don't see the fix."
