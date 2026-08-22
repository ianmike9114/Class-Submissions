# CLAUDE.md

Guidance for Claude Code working in this repo.

## What this is

Static site (GitHub Pages) + Firebase **Auth + Firestore only** (free
Spark plan — no credit card, ever). Students sign in with Gmail, submit a
**link** (Google Doc/PDF, CodePen or GitHub Gist, Drive, or YouTube — no
file uploads) per subject/section/assignment. Teacher grades each
submission with single score out of assignment's total points, with
optional Drive/Docs rubric-reference link shown alongside score box for
own use, then publishes to student. Multiple teachers can use site, each
isolated to own subjects/sections/assignments/submissions/enrollments;
one super admin (hardcoded by email, see `ADMIN_EMAIL` below) can
see/edit any teacher's data and grants/revokes other teachers' access.
No password system either way (Google Sign-In only).

**AI rubric-check hidden, not deleted.** `js/teacher.js`'s
`AI_CHECK_ENABLED` flag (currently `false`) gates "Run AI Check" button,
Settings gear (only Gemini key box lives there today), and "AI drafted"
filter option — flip back to `true` to restore all three. `js/gemini.js`
(`runRubricCheck()`, calls Gemini directly from browser with teacher's
own key) untouched underneath. Hidden because per-call Gemini cost
wasn't worth it for real usage; see grading-model note below for why
re-enabling isn't pure flip.

**No Firebase Storage, no Cloud Functions — deliberately.** Both require
paid Blaze plan just to exist, even at zero usage, hard constraint for
project. If future change seems to need either, stop and flag it — breaks
zero-cost guarantee, don't add silently.

Full setup steps: `README.md`. This file for **where to edit**, not how
to deploy.

## Commands

No `package.json`, no bundler, no lint config, no test suite, no CI —
pure static site, zero build tooling, by design (see "no build step"
below). Nothing to `npm install`/build/lint/test.

- **Preview locally**: `python -m http.server 8420` from repo root (also
  configured in `.claude/launch.json`), then open `http://localhost:8420`.
- **Deploy Firestore rules** (only real "build artifact" in repo):
  `firebase deploy --only firestore:rules`, after `firebase login`. Full
  deploy steps (Firebase project setup, GitHub Pages): `README.md`.

## Architecture (3 layers, no build step)

- **Frontend**: plain HTML/CSS/JS, no bundler. `index.html` (login) →
  `teacher.html` or `student.html` based on `js/auth.js`'s
  `isTeacherEmail()` (async: `true` for `ADMIN_EMAIL`, or if
  `teachers/{email}` doc exists — see Data model). Firebase JS SDK loaded
  via CDN ES modules.
- **Firebase**: Auth (Google only) + Firestore (data) only.
- **AI**: `js/gemini.js` calls Gemini API directly from browser using
  teacher's own key (never student's, never in git).
- **Rules are real access control** — `firestore.rules`, not frontend
  code. Any who-can-do-what change goes there, not just UI.
- `firebase.json` only declares `firestore.rules` as rules file — no
  `hosting` block, since GitHub Pages serves static site, not Firebase
  Hosting. `.firebaserc` pins default Firebase project used by
  `firebase deploy --only firestore:rules`.

**Two-tier admin model.** `ADMIN_EMAIL` (super admin, formerly
`TEACHER_EMAIL`) duplicated in **2 places** on purpose (no shared config
in static-site setup) — if super admin's email ever changes, update
both: `firestore.rules`, `js/firebase-config.js`. Regular teachers
different: granted access by super admin at runtime (`teachers/{email}`
doc, added/removed from `teacher.html`'s Settings panel), not hardcoded
anywhere — see "Adding/removing a teacher account" below and `teachers`
collection in Data model.

**Sign-in uses Google Identity Services directly, not
`signInWithPopup`/`signInWithRedirect`.** Both route through cross-domain
hop (this site → Firebase `authDomain` → Google → back) that modern
browsers' third-party storage partitioning silently breaks with zero
console error, reproduced on Edge and Brave alike during setup.
`js/auth.js`'s `initGoogleSignIn()` instead gets ID token from Google's
own widget (loaded via `accounts.google.com/gsi/client` script tag on
`index.html`) and hands it to Firebase via `signInWithCredential` — no
cross-domain redirect involved. Needs `GOOGLE_CLIENT_ID` in
`js/firebase-config.js` (Firebase Console → Authentication → Sign-in
method → Google → Web SDK configuration → Web client ID) **and** same
client ID's Authorized JavaScript origins (Google Cloud Console →
Credentials, separate from Firebase's own Authorized domains list) must
include site's real origin. Don't revert to
`signInWithPopup`/`signInWithRedirect` without strong reason — tried
first, silently failed cross-browser.

## Task map and data model

For "which file/function to edit for change X" and full Firestore
schema, see `.claude/Skills/student-lms/SKILL.md` (invoked automatically
for any change to app's teacher/student/rules files) — detailed,
frequently-changing reference; this file stays short since loaded into
every session automatically.

For any UI/CSS change, read `DESIGN_SYSTEM.md` first, not
`css/style.css` directly.

## Known v1 limitations (deliberate, see README)

- **Multi-teacher isolation is write-side and submissions/enrollments-read
  enforced, not fully read-locked on `subjects`/`sections`/`assignments`.**
  Those three collections stay readable by any signed-in user (unchanged
  from single-teacher version) — technically sophisticated other teacher
  could hand-craft raw query to list subject/section names across
  teachers. No grades or student PII in those collections (that's
  `submissions`/`enrollments`, which *are* fully owner-scoped on read);
  accepted rather than splitting join-code lookup into separate
  world-readable `joinCodes` collection, which true list-level lock-down
  would require. Flag if this ever needs to change.
- No file uploads — everything is link. Non-YouTube links must be shared
  "anyone with link can view" or AI (and teacher) can't open them.
- AI rubric-check hidden by default (`AI_CHECK_ENABLED = false` in
  `js/teacher.js`) — real usage showed per-call Gemini cost wasn't worth
  it. Code underneath (`js/gemini.js`'s `runRubricCheck()`,
  `tryFetchImagePart()` for image-vision input) untouched, but still
  expects `assignment.rubric` (per-criterion), which assignments no
  longer have now that grading is single `totalPoints` score —
  re-enabling flag would need small adapter (e.g. treat whole assignment
  as one criterion) before `runAiCheck()` works again, not pure flip.
- **Deleting subject, section, or assignment cascades** —
  `js/teacher.js`'s `cascadeDeleteSubject()`/`cascadeDeleteSection()`/
  `cascadeDeleteAssignment()` (built on shared `deleteWhere(collection,
  field, value)` helper) walk down same parent-child chain rest of app
  queries by and delete everything under thing deleted: subject → its
  sections → their assignments → their submissions, plus enrollments per
  section. Used to be non-cascading by design (documented as deliberate)
  until deleted subject kept showing up on student's dashboard — real
  confusion, not hypothetical, so changed to true cascade. No
  `firestore.rules` change needed (delete on all four collections
  already `isTeacher()`-only).
- Records grid's Written Work / Performance Task grouping is plain
  `component` field on assignment, not any weighted-grade computation —
  deliberately doesn't replicate DepEd's WW/PT/QA percentage +
  transmutation math. Teacher confirmed raw per-assignment totals enough;
  they finalize grades themselves in real Class Record. Don't build
  weighted/transmuted grade computation without being asked.
- No roster CSV import — students self-enroll via section join-code only.
- **No Class Record `.xlsx` export.** Removed by request — teacher
  finalizes and encodes all final grades themselves in real Class Record;
  app deliberately doesn't write scores into it. `js/class-record.js` now
  only exposes `loadWorkbook()` (used by roster seeding, see above) — no
  `matchStudents()`/`applyAndDownload()`, no export UI in `teacher.html`.
  Don't re-add export feature without being asked.
- **Grading is single raw score, not rubric criteria.** Switched from
  per-criterion rubric builder to one `totalPoints` number per assignment
  and one `finalGrade.score` per submission — teacher found typing rubric
  rows for every assignment more setup than worth. Drive/Docs
  rubric-reference link still exists but purely visual now (embedded on
  Review screen next to score box), not parsed by anything.
- `js/class-record.js`'s `loadWorkbook()` row-walk stops on first cell
  that isn't SheetJS type `"s"` (string), deliberately — not just "isn't
  empty". Confirmed against real DepEd Class Record: unused rows below
  last real student aren't blank, hold formula that evaluates to number
  `0`, out to row 119+. Plain non-null/non-empty check would sweep those
  up as fake students. Don't loosen this check.
- No real-time listeners (`onSnapshot`) — lists refresh on load/action,
  not live. Fine at single-class scale; add if it ever matters.
- **QR join is same-origin deep link, generated entirely client-side.**
  `js/teacher.js`'s `renderSectionQR()` uses `qrcodejs` CDN library to
  draw QR in-browser — join link (`student.html?code=...`) never goes to
  third-party QR image API, matching zero-cost/no-Storage constraint and
  avoiding leaking join codes to external server.
- Sign-in genuinely cannot work inside Facebook/Messenger/Instagram/Line/
  TikTok's embedded in-app browsers — Google's OAuth rejects request
  itself (`disallowed_useragent`), app has zero ability to bypass it.
  `index.html`'s `isInAppBrowser()` detects common ones and shows
  escape-hatch banner (Copy link, and on Android `intent://` "Open in
  Chrome" button) instead of leaving user on dead sign-in screen. UA-sniff
  list best-effort, not exhaustive — add more app signatures if teacher
  reports same blank-screen symptom from different app's share link.
- **Email-link (passwordless) sign-in as in-app-browser fallback.** Since
  the escape hatch above is weak on iOS (no `intent://` equivalent), the
  login page also offers a Firebase **email sign-in link** — shown *only*
  inside the `isInAppBrowser()` block, never replacing Google's one-tap
  where it works. Not OAuth, so `disallowed_useragent` never fires:
  requesting the link works from inside the WebView, and tapping the
  emailed link opens the phone's real browser (which is what escapes the
  WebView) to complete sign-in. `js/auth.js`'s `sendEmailSignInLink()` /
  `isEmailSignInLink()` / `completeEmailLinkSignIn()` back it;
  `index.html` wires the send form (inside the in-app banner) and the
  completion handler (`finishEmailLinkSignIn()`), including a "confirm
  your email" re-prompt (`#email-confirm`) for the normal cross-browser
  case where the link opens in a *different* browser than it was
  requested from, so `localStorage` can't supply the email. **No
  `firestore.rules` change** — email-link populates
  `request.auth.token.email` + `email_verified` like Google, and rules
  key off email/uid only, never `sign_in_provider`. Role routing
  (`isTeacherEmail()`), join `?code=` carry-through, and auto-enroll all
  work unchanged. Requires **"Email link (passwordless sign-in)" enabled
  in Firebase Console** (Authentication → Sign-in method → Email/Password)
  — a one-time console step, not a code toggle; see README 2c. Free on
  Spark (Firebase Auth email link has no cost — only phone/SMS auth
  does), so it doesn't break the no-Blaze constraint.
- Removing single enrollment ("Remove" button in Enrolled Students,
  `js/teacher.js`) still only deletes that one `enrollments` doc —
  narrower, still-deliberate case, not same as subject/section/
  assignment cascade above (removing one enrollment shouldn't touch
  student's actual submitted work). Any submissions student already made
  under that enrollment untouched and still exist, just no longer tied
  to live enrollment; if they rejoin (even picking different roster
  name), those old submissions won't reappear under new enrollment. Flag
  if this ever needs to change.
- In-app photo capture (`photoPages`, camera or gallery via plain
  `<input type="file" accept="image/*">` — no `capture` attribute, so
  OS's native chooser offers both) only exists for "image" and
  "document" assignments, as alternative to pasting link — not general
  file-upload feature. Capped at `MAX_PHOTOS` (10) pages per submission —
  not unlimited (shared 1MiB Firestore doc budget across however many
  pages added). `js/student.js`'s `compressImage()` resizes each photo to
  max 1280px and drops JPEG quality until under `PER_PHOTO_MAX_LEN`
  (100,000 chars/photo, so 10 photos stay under 1MiB cap alongside rest
  of submission's fields). Very detailed/high-res photos (e.g. dense
  handwriting) can lose noticeably more sharpness to this compression
  than at old 3-photo cap — if ever problem, student can still fall back
  to Drive-link path instead.
- **No separate "decline leave request without removing student" action.**
  Teacher's only response to flagged `leaveRequested` is Remove (fulfills
  it) or leaving it alone (student can Cancel it themselves from their My
  Classes card). Flag if this ever needs to change.
- **Deleting subject/section/assignment requires typing its exact name.**
  `js/teacher.js`'s `confirmByTyping()` replaced plain `confirm()` on
  those three cascade deletes only (not lower-stakes "remove one
  enrollment" or "remove teacher's access", which stay single `confirm()`
  — those don't wipe whole tree of records). Teacher asked for stronger
  protection against misclicks; mistaken click can't accidentally retype
  name, unlike clearing OK/Cancel dialog.
- **Notification bell has third bucket, "new joins".** `js/student.js`'s
  `enroll()` stamps every new enrollment with `seen: false`;
  `js/teacher.js`'s `getNotifications()` queries `seen == false`
  (owner-scoped) and groups by section, listing actual student name(s)
  so teacher knows *who* without drilling in. Unlike pending
  submissions/leave requests (which clear when underlying thing
  resolved), join is event, not standing state — clicking row treated as
  read receipt: `goToNewJoins()` marks those enrollment docs `seen: true`
  on way to Enrolled Students. Old enrollments (no `seen` field) never
  match `seen == false`, so implicitly already-seen with no backfill.
- **Second header button, "Photo ZIPs" (`#photos-bell`), lists every
  photo submission across every assignment, not just current one.**
  Per-assignment "Download all as ZIP" button (`renderImagesGallery()`)
  lives inside collapsed `<details>` on submissions view — easy to miss
  if teacher never opens that assignment. `js/teacher.js`'s
  `getPhotoAssignments()` fetches every owned submission once and groups
  by assignment; both this panel and per-assignment gallery now share
  one `downloadPhotosZip()` helper so ZIP-building logic isn't
  duplicated.
- **Android-only "Open in Chrome" button next to non-embeddable file
  links** (`js/embed.js`'s `openInChromeButton()`/`wireOpenInChromeButtons()`,
  used on student assignment instructions link and teacher's
  instructions/rubric-reference links). Some Android phones hand tapped
  link to whatever app claims that file type — reported in field as
  "Document Viewer" app throwing "File parsing error" — instead of
  Chrome, no way for page to know or catch it. `intent://` with explicit
  `package=com.android.chrome` forces Chrome specifically, same technique
  as `index.html`'s in-app-browser escape hatch. Renders nothing on
  iOS — Apple gives pages no way to pick handler app, so no equivalent
  fix there (same conclusion as iOS Code Scanner QR issue).
- **Accomplishment report + photo collage generator, per assignment**
  (`js/teacher.js`'s `renderCollagePreview()`/`drawScatteredCollage()`/
  `buildOfficialReportDocxBlob()`/`generateOfficialAccomplishmentReport()`,
  called from `renderImagesGallery()`) — for DepEd's work-from-home/
  modular-activity documentation requirement during calamities. Entirely
  client-side, no Storage/Functions: collage is randomized `<canvas>`
  scrapbook layout (varied photo size/rotation/scatter, centered
  title/section/date badge) that reshuffles on every "Regenerate layout"
  click. The one "Generate Accomplishment Report (.docx)" button clones
  the real DepEd "Individual Daily Log and Accomplishment Report" form
  (`assets/accomplishment-report-official.docx` — a tokenized,
  single-activity copy of the actual government template, prepared
  once offline) rather than hand-authoring a lookalike: JSZip (already
  a dependency, see photo-ZIP feature below) opens it, does plain
  `{{TOKEN}}` string substitution on `word/document.xml`, and swaps one
  placeholder image's bytes for the generated collage, so every
  original font/seal/table border survives untouched. No separate
  generic/ad-hoc report path anymore (there used to be two buttons; user
  asked to consolidate to just the official one) — no `docx` CDN library
  dependency as a result. Report body is short, teacher-editable
  narrative (`draftReportDescription()` auto-drafts one sentence from
  assignment title/section/dates, plus assignment's own `instructions`
  text if set) — deliberately not student/photo-count table. No
  "activity date" field on assignments, so teacher fills in date range
  manually per report. Employee name, arrangement, and the three
  signatory name/title pairs are editable fields (collapsed "Report
  settings" `<details>`) defaulting to the real template's values, not
  hardcoded — this app is multi-teacher-capable, so a different signed-in
  teacher shouldn't silently get this user's identity/signatories on
  their own generated report. See `.claude/Skills/deped-accomplishment-report`
  for the separate, multi-date, agent-driven version of this same
  template — that one combines several activity dates into one
  submission; this in-app button stays single-activity, tied to one
  assignment's collage.
- **Invite student by Gmail, auto-join on sign-in — no email-click-to-
  accept step.** New `invites/{inviteId}` collection (`studentEmail`
  lowercased, `studentName`, `subjectId`/`subjectName`, `sectionId`/
  `sectionName`, `teacherName`, `ownerEmail`, `createdAt`). Teacher-side
  form lives in `js/teacher.js`'s `loadSections()` ("Invite by email"
  `<details>` next to "Show QR"), backed by `getPendingInvites()` for
  section's pending-invite list + Cancel button. Consumed on student side
  by `js/student.js`'s `applyPendingInvites()`, called right after
  sign-in (before `loadEverything()`) — queries `invites` by signed-in
  email, calls existing `enroll()` unchanged, then deletes invite doc
  whether or not it resulted in new enrollment (so stale/duplicate invite
  can't re-fire). Exists alongside join-code/QR flow, not replacement —
  added because some students don't reliably have Gmail access to click
  emailed accept link. `firestore.rules`'s new `invites` match block:
  create is teacher/owner-only, read/delete allow either owning teacher
  or invited student themselves (matching email on their auth token) —
  this lets student's own auto-join code consume (delete) its own invite.
- **Teacher can delete any single submission directly**, via `Delete`
  button in `js/teacher.js`'s `loadSubmissions()` row, gated by existing
  `confirmByTyping()` (type student's name to confirm, same pattern as
  section/assignment cascade deletes). No `firestore.rules` change
  needed — delete rule on `submissions` already lets `canActAsOwner`
  delete regardless of `status`.
- **`css/style.css` had zero `@media` queries until mobile-layout fix
  below** — most of app tolerated narrow screens by accident
  (inputs/selects/textareas globally full-width, `.card`/`main` no fixed
  width), but `teacher.html`'s `header` (two flex button groups, no
  wrap) and `.records-grid` (many `white-space:nowrap` columns, no
  scroll wrapper) broke on phones — reported as "teacher dashboard not
  adjusting to mobile". Fixed with one `@media (max-width: 640px)` block
  (header stacks/wraps) plus `#records-table { overflow-x: auto; }`
  (grid scrolls in own box instead of whole page scrolling sideways) —
  both in `css/style.css` only, no HTML/JS changes. Thin,
  single-breakpoint fix, not full responsive redesign — treat as
  starting point, not guarantee every future UI addition degrades
  gracefully on mobile without its own check.

## Conventions

- No bundler/build step by design — keep deployable as-is to GitHub
  Pages. If adding dependency to frontend, use CDN ESM import (see
  `js/firebase-config.js` for pattern), don't introduce npm/webpack for
  static site.
- Don't reintroduce Firebase Storage or Cloud Functions — see
  "deliberately" note above.
- **`css/style.css`/`js/student.js`/`js/teacher.js` loaded with manual
  `?v=N` cache-buster** (`index.html`, `student.html`, `teacher.html`).
  GitHub Pages sets `Cache-Control: max-age=600` with no build step to
  content-hash filenames, so without this deployed fix can sit invisible
  in student's/teacher's browser for up to 10 minutes (longer with
  mobile disk caching) — bump `?v=` on every file changed, in every HTML
  file referencing it, as part of shipping change, not after someone
  reports "I don't see the fix."
