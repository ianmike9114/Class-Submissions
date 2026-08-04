---
name: student-lms
description: Modify the Class Submissions app — student link submission, join-code enrollment, single-score grading, submission review/publish, browser-side AI (Gemini) rubric-check drafting (currently hidden). Use for any change to teacher.html/student.html/js/*.js/firestore.rules in this repo.
---

# Student LMS routing

Read `CLAUDE.md` in the repo root first — architecture, conventions,
known v1 limitations. This file is the full task-map (change → exact
file/function) and Firestore data model — jump straight to the named
file(s) below, no need to re-derive either from the code each session.

**Any UI/CSS/markup change → read `DESIGN_SYSTEM.md` first, not
`css/style.css`.** It has every pattern (cards, buttons, collapsible
details/summary, tables, status colors, embed iframes) as copy-pasteable
HTML with the exact class names — written specifically so you don't have
to re-derive the design system from the stylesheet every session.

## Task map — common changes → exact edit location

| Change | Edit |
|---|---|
| Teacher dashboard UI/behavior (subjects/sections/assignments/submissions review/publish/Settings) | `js/teacher.js` + `teacher.html` |
| Grading (single score out of an assignment's total points, optional rubric-reference link/embed on Review) | `js/teacher.js` (`openReview()`, `totalPoints` on `assignments`, `finalGrade{score,feedback}` on `submissions`) — replaced the old per-criterion rubric builder; see limitations |
| AI rubric-check on/off | `js/teacher.js`'s `AI_CHECK_ENABLED` flag (top of file) — hidden by default, code (`js/gemini.js`) untouched |
| School Year / Term on a Subject | `js/teacher.js` (`add-subject-form` handler, `loadSubjects()`, `openSubject()`) + `teacher.html`'s `#subject-year`/`#subject-term` — one Subject per term, teacher creates a new one each term |
| Editing an existing Subject's Year/Term, or a Section's name | `js/teacher.js`'s `editSubjectYearTerm()` / `editSectionName()` — inline edit forms on the subject/section card, same pattern (click Edit → form appears in place → Save → `updateDoc` → reload list) |
| Roster gender (Male/Female), Records grid gender grouping | `js/teacher.js`'s `addRosterNames()` (parses `MALE`/`FEMALE` header lines in the pasted text as gender markers, tags every name after until the next marker) + `loadRecords()` (groups body rows into Male/Female/Other blocks when the roster has gender data, flat otherwise) — `sections.roster` is now `{name, gender}[]`, both `js/teacher.js` and `js/student.js` normalize legacy plain-string rosters on read |
| "Who's submitting" pending-count badge (subject/section/assignment cards) | `js/teacher.js`'s `getPendingCounts()` (one shared subject/section/assignment rollup) + `pendingBadge(count)`, called from `loadSubjects()`/`loadSections()`/`loadAssignments()` — in-app only, no real push notifications (would need a server component, breaks the zero-cost rule, deliberately not built - see limitations) |
| Per-assignment scores summary (Name + Score, graded students only) | `js/teacher.js`'s `renderScoresSummary()`, called from `loadSubmissions()` — a collapsed `<details>` above the submission cards on `#view-assignment`, separate from the section-wide Records grid (`loadRecords()`) which shows every roster student across every assignment |
| Photo submissions gallery + one-click ZIP download (all of an assignment's `photoPages`/legacy `photoData` images in one place) | `js/teacher.js`'s `renderImagesGallery()`, called from `loadSubmissions()` right after `renderScoresSummary()` — a collapsed `<details>` on `#view-assignment`, `teacher.html`'s `#images-gallery`; only renders when at least one submission has photos; "Download all as ZIP" uses the `jszip` CDN script tag (`teacher.html`) to bundle every photo client-side (`<student>-page<n>.jpg`) — no Storage, no server, reads data already on the submission docs; ZIP-building itself is the shared `downloadPhotosZip()` helper |
| Header-wide "Photo ZIPs" panel — every assignment with photo submissions, not just the one currently open | `js/teacher.js`'s `getPhotoAssignments()` (fetches every owned submission once, groups by assignment) / `renderPhotosDropdown()` (list + per-row ZIP button, `downloadPhotosZip()` shared with the per-assignment gallery above) + `teacher.html`'s `#photos-bell`/`#photos-dropdown` next to the notification bell — added because the per-assignment ZIP button lives inside a collapsed `<details>` a teacher may never open |
| Instructions/rubric reference visible while checking submissions | `js/teacher.js`'s `renderAssignmentContext()`, called from `openAssignment()` — a collapsed `<details>` above the scores summary on `#view-assignment`, `teacher.html`'s `#assignment-context`; reuses `toEmbedUrl()` the same way the student-side instructions block and `openReview()`'s rubric block already do |
| Accomplishment report + photo collage generator (DepEd work-from-home/modular activity documentation) | `js/teacher.js`'s `renderCollagePreview()`/`drawScatteredCollage()` (randomized scrapbook-style `<canvas>` layout, reshuffles on "Regenerate layout") / `buildAccomplishmentReportDocx()`/`generateAccomplishmentReport()` (`.docx` via the `docx` CDN ESM import), all called from `renderImagesGallery()` — same per-assignment scope as the photo gallery/ZIP above; `draftReportDescription()` auto-drafts the editable narrative text (title/section/dates + the assignment's `instructions` if set), no student/photo-count table |
| Section-wide activities overview (all Written Work + Performance Task assignments, title/points/due, for eyeballing/encoding into the Class Record) | `js/teacher.js`'s `renderActivitiesSummary()`, called from `loadAssignments()` — a collapsed `<details>` above the assignment cards on `#view-section`, `teacher.html`'s `#activities-summary`; distinct from the per-assignment scores summary (lists students) and the Records grid (also lists students, per-assignment columns) — this one lists activities |
| Fixing a garbled student name from anywhere it shows (Enrolled Students, or a submission card while reviewing) | `js/teacher.js`'s `renameStudentEverywhere(studentUID, newName)` — updates every `enrollments` doc AND every `submissions` doc for that `studentUID` in one go, since `submissions.studentName` is a cached snapshot taken at submit time, not looked up live; both edit-name entry points (`openEnrolled()`, `loadSubmissions()`) call this shared helper now |
| Student dashboard UI/behavior (join class/submit a link/view results) | `js/student.js` + `student.html` |
| Google Sign-In / role routing (teacher vs student) | `js/auth.js` (uses Google Identity Services directly via `initGoogleSignIn()` + `signInWithCredential`, not Firebase's own `signInWithPopup`/`signInWithRedirect` — those were tried first and silently failed on Edge/Brave, cross-domain storage partitioning with zero console error; don't revert without a strong reason, see `CLAUDE.md`. `use_fedcm_for_button` was removed for the same reason: Brave's engine doesn't implement the FedCM API at all, so it threw `NotSupportedError` internally with no fallback — this app never calls `accounts.id.prompt()`, so dropping the flag only affects the button and has no other side effect. `isTeacherEmail()` is async, checks `ADMIN_EMAIL` then the `teachers` collection) |
| Firebase project keys / super admin email constant (frontend) | `js/firebase-config.js` (`ADMIN_EMAIL`) |
| Adding/removing a teacher account (isolated dashboard, granted by the super admin) | `js/teacher.js`'s `loadTeachers()` (list + remove) / `add-teacher-form` handler (add, `setDoc(doc(db,"teachers",email), ...)`) / `renderViewAsPicker()` (admin's per-teacher "view as" `<select>`, sets `state.viewAsEmail`) — all gated behind `#admin-teachers-section` in `teacher.html`'s Settings panel, shown only when `currentUser.email === ADMIN_EMAIL`; `ownerScopedQuery()`/`ownedByViewAs()` (top of `js/teacher.js`) are the shared helpers every list query and write in the file goes through for per-teacher isolation |
| Who can read/write what in Firestore | `firestore.rules` — after any change here, remind the user to `firebase deploy --only firestore:rules`; local edits alone don't take effect |
| AI rubric-check logic (prompt, Gemini model/params, key storage, image-vision fetch) | `js/gemini.js` (`runRubricCheck()`; `tryFetchImagePart()` for "image" assignments — best-effort, see limitations; `photoData` param sends an in-app camera capture directly as inline image data, no link needed). The Gemini key lives in the teacher's browser `localStorage` only, set via the Settings box — never hard-code a key into any committed file |
| In-app photo capture, multi-page (student, "image" and "document" assignments) | `js/student.js` (`compressImage()` per photo, `pendingPhotos` Map + `renderPhotoThumbs()` — up to `MAX_PHOTOS` (10) pages per submission, each capped at `PER_PHOTO_MAX_LEN` chars so all of them together still fit Firestore's 1MiB doc cap; saved as `submissions.photoPages` string[] of base64 data URLs, no Storage involved; the file input has no `capture` attribute so the OS chooser offers camera or gallery; `renderSubmitForm()`'s type check gates which assignment types show it) + `js/teacher.js` (`loadSubmissions()` renders a `.photo-thumbs` row when `photoPages` is set, falls back to the legacy single `photoData` field for submissions made before multi-page support) |
| Delete a subject, section, or assignment (cascades) | `js/teacher.js` (`cascadeDeleteSubject()`/`cascadeDeleteSection()`/`cascadeDeleteAssignment()`, shared `deleteWhere()` helper) — deletes everything under the thing you deleted (see Data model below); subjects also have Archive as a non-destructive alternative |
| Student fixing their own garbled display name | `js/student.js`'s inline edit control on each "My classes" card (`loadEverything()`) + `firestore.rules`'s `enrollments` update rule (students may only touch `studentName` on their own enrollment) — same interaction pattern as the teacher's Enrolled Students "Edit name" |
| Inline preview embedding (which links embed vs. fall back to a plain link) | `js/embed.js`'s `toEmbedUrl()` — single Drive files, Drive **folders** (`embeddedfolderview`, `#grid` view — this is the fix for "a multi-file Drive folder link redirects instead of embedding"), Google Docs/Slides/Sheets, YouTube (watch or `youtu.be`), CodePen. GitHub Gist and anything else fall back to a plain `<a href>` — every caller (`renderAssignmentContext()`, `openReview()`'s rubric block, `student.js`'s instructions block) already has that iframe-or-link fallback, so fixing a link *type* here fixes it everywhere at once |
| Android "Open in Chrome" button next to a non-embeddable fallback link (some phones hand the tap to a native "Document Viewer"-type app instead of Chrome) | `js/embed.js`'s `openInChromeButton(url)` (renders nothing off-Android — no iOS equivalent) + `wireOpenInChromeButtons(container)` (one delegated click listener per container, called once at init — `js/student.js`'s `#assignments-list`, `js/teacher.js`'s `#assignment-context`) — same `intent://...package=com.android.chrome` technique as `index.html`'s in-app-browser escape hatch |
| Roster seeding (per section) / Records gradebook grid (grouped by component - Written Work / Performance Task) | `js/teacher.js` (`renderRosterPreview()`, `addRosterNames()` for manual typed/pasted entry, `loadRecords()`) + `teacher.html` (`#view-records`) — the Class Record `.xlsx` upload (`loadWorkbook()`, `js/class-record.js`) is still there as a "Or upload instead" fallback, but manual entry is the default path; `openSection()` preloads the section's already-saved roster into the same editable list so it's not a one-shot upload-only flow |
| Home button (jump to `view-subjects` from any depth) | `teacher.html`'s header `#go-home` + `js/teacher.js`'s listener (same body as `back-to-subjects`) |
| In-app-browser sign-in warning (Messenger/Instagram/Line/TikTok links) | `index.html`'s inline module script, `isInAppBrowser()` (user-agent sniff) + `#in-app-browser-warning` banner - Google blocks OAuth inside these embedded WebViews on purpose (`disallowed_useragent`), can't be bypassed, only worked around by pointing the user at a real browser (Android gets an `intent://` "Open in Chrome" button, everyone gets "Copy link") |
| Sign-in failure notification (GIS script didn't load, credential exchange failed, or a slow-load timeout) | `index.html`'s `showError()`/`FRIENDLY_ERRORS` + the `#error` box (hidden until something actually fails) |
| Preventing duplicate enrollment in the same section, join success feedback | `js/student.js`'s `join-form` handler (checks for an existing `enrollments` doc for that `studentUID`+`sectionId` before enrolling either way) |
| Settings panel toggle (Gemini key, hidden by default; teacher-account management, super admin only) | `teacher.html`'s header `#toggle-settings` button + `#settings-panel` (starts with `hidden` class, independent of the `show()` view stack so it stays open/closed across navigation) — the button itself stays visible for the super admin even with `AI_CHECK_ENABLED` off, since it's now also the entry point to `#admin-teachers-section` |
| Enrolled students list (subject-wide from `#view-subject`, or one section only from `#view-section`'s own "View Enrolled Students" button) + removing a wrong/duplicate enrollment | `js/teacher.js` (`openEnrolled(onlySectionId)` - omit the arg for subject-wide, pass `state.sectionId` for one section; `deleteDoc` on the Remove button, row numbers via `${i+1}`) + `teacher.html` (`#view-enrolled`, shared by both entry points) |
| Student requesting to leave a class (flagged, teacher approves - not instant self-removal) | `js/student.js` (My classes card's `data-toggle-leave` button, `updateDoc(..., {leaveRequested})`) + `js/teacher.js` (`getLeaveRequestCounts()`/`leaveBadge()` mirroring the pending-submission badge, `openEnrolled()`'s request-aware Remove confirm message) + `firestore.rules`'s `enrollments` update rule (added `leaveRequested` to the student-self-update field allowlist; delete stays teacher-only) |
| Row numbers on the Enrolled Students table | `js/teacher.js`'s `openEnrolled()` row rendering (`#` column, same pattern as `renderRosterPreview()`'s existing `${i+1}`) - deliberately not added to the Records grid (`loadRecords()`, gender-grouped) |
| Student retracting their own submission (only while `status == "pending"`, never after grading) | `js/student.js`'s `loadEverything()` submission branch ("Remove submission" button, `deleteDoc`) + `firestore.rules`'s `submissions` delete rule (student may delete only their own pending submission; teacher-only once published) |
| Small icon-style delete buttons (Enrolled Students Remove, subject/section/assignment Delete) | `css/style.css`'s `button.danger.icon` (compact circular variant of `.danger`) + the 4 button sites in `js/teacher.js` - markup-only change; see next row for the subject/section/assignment confirm text itself |
| Delete confirmation strength (subject/section/assignment cascade deletes vs. remove-one-enrollment/remove-a-teacher) | `js/teacher.js`'s `confirmByTyping(message, name)` — used only on the 3 cascade deletes (`loadSubjects()`/`loadSections()`/`loadAssignments()`'s delete handlers, each building an id→name `Map` for the prompt), since those wipe everything nested under the thing you deleted; the lower-stakes single-doc removals (`openEnrolled()`'s Remove, `loadTeachers()`'s Remove) stay a plain `confirm()` |
| Join flow / pick-your-name-from-roster | `js/student.js` (`join-form` handler, `renderNamePicker()`, `claimedNames()`, `enroll()`) + `student.html`'s `#join-name-picker` — only kicks in when the section already has a roster (`sections.roster`), otherwise falls back to using the Google account name; QR/deep-link join → next row |
| QR-code join (per-section "Show QR", scan-to-join deep link) | `js/teacher.js`'s `joinLinkFor()`/`renderSectionQR()` (called from `loadSections()`, renders into `#qr-${sectionId}`) + `teacher.html`'s `qrcodejs` CDN `<script>` tag (client-side generation only — the join link never leaves the device, no external QR image API) + `js/student.js`'s `?code=` deep-link handling (`applyPendingJoinCode()`, stashes into `sessionStorage` before `guardPage()` can redirect a signed-out student through `index.html` for sign-in, so the code survives that hop) — no `firestore.rules` change needed, `sections` read was already `isSignedIn()`-only; `renderSectionQR()` composites the `state.subjectName` — section name label directly onto the same canvas as the QR pattern (not just a sibling caption), so a tight screenshot/print crop of just the code stays identifiable out of context — a plain `<p>` caption above the code still exists too, for on-screen readability/accessibility (`state.subjectName` is set in `openSubject()`) |
| Notification bell (header dropdown: pending submissions + leave requests + new joins, click to jump straight there) | `js/teacher.js`'s `getNotifications()`/`refreshNotifications()` (data), `renderNotifDropdown()`/`closeNotifDropdown()` (UI), `goToAssignment()`/`goToLeaveRequests()`/`goToNewJoins()` (navigation — replays `openSubject → openSection → openAssignment/openEnrolled` so Back buttons and `state.subjectId` stay correct) + `teacher.html`'s `#notif-bell`/`#notif-count`/`#notif-dropdown` — refreshes on page load, on bell click, after publishing a grade, and after resolving a leave request (no real-time listeners, see limitations) |
| "New joins" bucket specifically (who just enrolled, by name) | `js/student.js`'s `enroll()` stamps `seen: false` + `joinedAt` on every new `enrollments` doc; `js/teacher.js`'s `getNotifications()` queries `seen == false` (owner-scoped) grouped by section; `goToNewJoins()` marks those docs `seen: true` when the teacher clicks the row (the names are already visible in the dropdown text itself, so clicking is the read receipt — unlike pending submissions/leave requests, which only clear when the underlying thing is resolved) |
| Student's Assignments list grouping by subject | `js/student.js` (`loadEverything()` — groups by `subjectName` via a `sectionId → subjectName` map built from the student's own enrollments) |
| Styling / UI patterns (cards, buttons, tables, collapsibles, status colors) | `DESIGN_SYSTEM.md` first — has every pattern with copy-pasteable HTML, avoids re-reading `css/style.css` from scratch. Only open `css/style.css` itself for a genuinely new pattern not covered there. Color/font/radius tokens are the "Academic Clarity" palette (deep navy `--blue`, Source Serif 4 headlines, Atkinson Hyperlegible Next body, loaded via Google Fonts `<link>` in each HTML `<head>`) — see `DESIGN_SYSTEM.md`'s Tokens section for exact values |
| Firestore deploy config | `firebase.json`, `.firebaserc` |
| Setup/deploy instructions | `README.md` |

## Data model (Firestore)

- `teachers` — doc ID is the granted teacher's lowercased email; fields
  `email`, `addedAt`, `addedBy`. Purely an allowlist (existence = access),
  managed only by the super admin from `teacher.html`'s Settings panel
  (`loadTeachers()`/`add-teacher-form` in `js/teacher.js`). The super admin
  itself is never a doc here — it's the permanently hardcoded `ADMIN_EMAIL`
  (see `CLAUDE.md`'s Architecture section), which avoids a bootstrap
  chicken-and-egg problem for granting the very first admin.
- `subjects`, `sections`, `assignments`, `submissions`, `enrollments` all
  carry an `ownerEmail` field (the creating teacher's email; for
  student-created `submissions`/`enrollments` it's copied from the parent
  assignment/section, not the student) — this is what isolates each
  teacher's dashboard to their own data. **Docs created before multi-
  teacher support have no `ownerEmail` field at all** and are treated as
  the super admin's via `firestore.rules`' `isLegacyUnowned()` and
  `js/teacher.js`'s matching `ownedByViewAs()` — no backfill is required
  for the app to keep working, though running one (stamp `ownerEmail:
  ADMIN_EMAIL` on every pre-existing doc) is recommended before onboarding
  a second real teacher, so no legacy-null edge case is ever hit by a
  student submitting against an old, not-yet-backfilled assignment. Every
  list query and write in `js/teacher.js` goes through the shared
  `ownerScopedQuery(collectionName, ...wheres)` / `ownedByViewAs(data)`
  helpers (top of the file) rather than filtering by `ownerEmail` inline —
  `ownerScopedQuery()` queries unfiltered for the super admin (Firestore's
  rules already grant them unconditional list access) and narrows with
  `ownedByViewAs()` client-side, since a plain `where("ownerEmail","==",
  ...)` filter would silently exclude every legacy doc. A granted
  (non-admin) teacher always gets a strict server-side filter instead,
  since they never have legacy data. `state.viewAsEmail` (defaults to the
  signed-in teacher's own email) is what both helpers key off — the super
  admin's "view as" `<select>` (`renderViewAsPicker()`) is the only thing
  that ever changes it to someone else's email.
- `subjects` — name, gradeLevel, schoolYear (free text, e.g. "2026-2027"), term ("1"|"2"|"3"), archived, ownerName (the creating teacher's Google display name, stamped at creation — shown to students as "Teacher: X" on their My Classes card via `enrollments.teacherName`, copied at join time). Old subjects from before Term/Year existed just show "—" for both — not backfilled; same "—" fallback for subjects created before `ownerName` existed.
- `sections` — subjectId, sectionName, joinCode
- `assignments` — subjectId, sectionId, title, instructions (free text shown to students - objective/output format/anything they need), instructionsLink (optional Drive/Docs/folder link to instructions, embedded via `js/embed.js`'s `toEmbedUrl()` same as submission previews - a single field, but a Drive **folder** link works for multiple files at once, embedding as a thumbnail grid), component ("written" | "performance" - drives the Records grid's grouped header, older assignments without this land in a fallback "Other" group), dueDate, allowedFileTypes (a link-type hint, not an upload constraint), totalPoints (number - the score cap, teacher grades one raw number against this), rubricReferenceLink (optional Drive/Docs link to the teacher's own rubric PDF/Word, shown embedded on the Review screen for the teacher's reference only - not parsed, not used to compute anything)
- `submissions` — assignmentId, studentUID, studentName, link (may be empty if `photoPages` is used instead), photoPages (optional - string[] of base64 `data:image/jpeg;base64,...` pages from in-app photo capture (camera or gallery) on "image"/"document" assignments, up to `MAX_PHOTOS` (10), each compressed client-side to `PER_PHOTO_MAX_LEN` so the whole array still fits the 1MiB Firestore doc cap; no Storage; older submissions may instead have a single `photoData` string field - both are handled on display, and both feed the per-assignment photo gallery/ZIP download), status(pending/published — "ai-drafted" only appears on submissions graded before AI check was hidden), finalGrade{score, feedback} (score is a single number out of the assignment's `totalPoints`). A student may `deleteDoc` their own submission while `status == "pending"` (rule-enforced in `firestore.rules`, not just hidden in the UI) - once `published`, it's immutable from their side.
- `enrollments` — studentUID, studentName (if the section had a roster at
  join time, this is the exact roster spelling the student picked via
  `js/student.js`'s name picker, not their Google account name - see
  `sections.roster` below), studentEmail (student's Gmail - added for the
  Enrolled Students list; enrollments created before this field was added
  just show blank there), subjectId, subjectName, teacherName (copied from
  `subjects.ownerName` at join time, "—" if the subject predates that
  field), sectionId, sectionName
  (created when a student enters a join code), leaveRequested (optional bool
  - student self-flags via My Classes' "Request to leave"/"Cancel leave
  request" toggle; teacher sees it flagged in Enrolled Students and acts via
  the existing Remove flow, which still doesn't cascade to that student's
  submissions, same as any other removal), seen (bool, defaults false at
  enroll time - powers the notification bell's "new joins" bucket, flipped
  to true once the teacher's clicked that row in `js/teacher.js`;
  enrollments from before this field existed simply never match a
  `seen == false` query, so they read as already-seen with no backfill
  needed), joinedAt (`serverTimestamp()`, stamped alongside `seen` - not
  currently read anywhere, just available if a "joined on X" display is
  ever wanted)
- `sections.roster` — `{name, gender}[]` of official students, set via the
  Set Roster manual paste or `.xlsx` upload in `view-section` (gender is
  `"Male"`/`"Female"`/`""`; xlsx-loaded rosters always get `""` since the
  sheet reader only reads one name column). Manual paste auto-detects
  `MALE`/`FEMALE` header lines the same way a real Class Record lays them
  out - `js/teacher.js`'s `addRosterNames()` tags every following name
  with that gender until the next header. **Sections saved before gender
  tracking existed have a plain `string[]` roster instead** - every reader
  (`openSection()`, `loadRecords()` in `js/teacher.js`,
  `renderNamePicker()` in `js/student.js`) normalizes `typeof r ===
  "string" ? {name: r, gender: ""} : r` before use, so old sections keep
  working, just without gender grouping until re-saved. Drives three
  things: (1) at join time, `js/student.js`'s `renderNamePicker()` makes
  the student pick their name from this list instead of trusting their
  Google display name, so `studentName` matches the roster exactly by
  construction going forward - already-claimed names are excluded from the
  picker (`claimedNames()`, queried live against `enrollments`); (2) the
  Records grid's rows — matched against `enrollments.studentName`
  (case-insensitive) to find each roster student's actual submissions, and
  grouped into Male/Female/Other blocks (`.gender-group` header rows) when
  the roster has gender data. A roster name with no matching enrollment
  shows as "Not joined" rather than being silently omitted — that's the
  whole point of seeding from the real roster instead of just listing
  whoever self-enrolled.
