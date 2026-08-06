---
name: student-lms
description: Modify the Class Submissions app — student link submission, join-code enrollment, single-score grading, submission review/publish, browser-side AI (Gemini) rubric-check drafting (currently hidden). Use for any change to teacher.html/student.html/js/*.js/firestore.rules in this repo.
---

# Student LMS routing

Read `CLAUDE.md` in repo root first — architecture, conventions, known
v1 limitations. This file is full task-map (change → exact
file/function) and Firestore data model — jump straight to named
file(s) below, no need to re-derive either from code each session.

**Any UI/CSS/markup change → read `DESIGN_SYSTEM.md` first, not
`css/style.css`.** Has every pattern (cards, buttons, collapsible
details/summary, tables, status colors, embed iframes) as
copy-pasteable HTML with exact class names — written specifically so
you don't have to re-derive design system from stylesheet every
session.

**Mobile-layout work → `css/style.css`'s `@media (max-width: 640px)`
block** (added for "teacher dashboard not adjusting to mobile" fix —
stacks/wraps `header`, plus `#records-table { overflow-x: auto; }` for
Records grid). Only breakpoint in whole stylesheet — check it still
covers any new header buttons or wide tables added.

## Task map — common changes → exact edit location

| Change | Edit |
|---|---|
| Teacher dashboard UI/behavior (subjects/sections/assignments/submissions review/publish/Settings) | `js/teacher.js` + `teacher.html` |
| Grading (single score out of assignment's total points, optional rubric-reference link/embed on Review) | `js/teacher.js` (`openReview()`, `totalPoints` on `assignments`, `finalGrade{score,feedback}` on `submissions`) — replaced old per-criterion rubric builder; see limitations |
| AI rubric-check on/off | `js/teacher.js`'s `AI_CHECK_ENABLED` flag (top of file) — hidden by default, code (`js/gemini.js`) untouched |
| School Year / Term on Subject | `js/teacher.js` (`add-subject-form` handler, `loadSubjects()`, `openSubject()`) + `teacher.html`'s `#subject-year`/`#subject-term` — one Subject per term, teacher creates new one each term |
| Editing existing Subject's Year/Term, or Section's name | `js/teacher.js`'s `editSubjectYearTerm()` / `editSectionName()` — inline edit forms on subject/section card, same pattern (click Edit → form appears in place → Save → `updateDoc` → reload list) |
| Roster gender (Male/Female), Records grid gender grouping | `js/teacher.js`'s `addRosterNames()` (parses `MALE`/`FEMALE` header lines in pasted text as gender markers, tags every name after until next marker) + `loadRecords()` (groups body rows into Male/Female/Other blocks when roster has gender data, flat otherwise) — `sections.roster` now `{name, gender}[]`, both `js/teacher.js` and `js/student.js` normalize legacy plain-string rosters on read |
| "Who's submitting" pending-count badge (subject/section/assignment cards) | `js/teacher.js`'s `getPendingCounts()` (one shared subject/section/assignment rollup) + `pendingBadge(count)`, called from `loadSubjects()`/`loadSections()`/`loadAssignments()` — in-app only, no real push notifications (would need server component, breaks zero-cost rule, deliberately not built - see limitations) |
| Per-assignment scores summary (Name + Score, graded students only) | `js/teacher.js`'s `renderScoresSummary()`, called from `loadSubmissions()` — collapsed `<details>` above submission cards on `#view-assignment`, separate from section-wide Records grid (`loadRecords()`) which shows every roster student across every assignment |
| Photo submissions gallery + one-click ZIP download (all of assignment's `photoPages`/legacy `photoData` images in one place) | `js/teacher.js`'s `renderImagesGallery()`, called from `loadSubmissions()` right after `renderScoresSummary()` — collapsed `<details>` on `#view-assignment`, `teacher.html`'s `#images-gallery`; only renders when at least one submission has photos; "Download all as ZIP" uses `jszip` CDN script tag (`teacher.html`) to bundle every photo client-side (`<student>-page<n>.jpg`) — no Storage, no server, reads data already on submission docs; ZIP-building itself is shared `downloadPhotosZip()` helper |
| Header-wide "Photo ZIPs" panel — every assignment with photo submissions, not just one currently open | `js/teacher.js`'s `getPhotoAssignments()` (fetches every owned submission once, groups by assignment) / `renderPhotosDropdown()` (list + per-row ZIP button, `downloadPhotosZip()` shared with per-assignment gallery above) + `teacher.html`'s `#photos-bell`/`#photos-dropdown` next to notification bell — added because per-assignment ZIP button lives inside collapsed `<details>` a teacher may never open |
| Instructions/rubric reference visible while checking submissions | `js/teacher.js`'s `renderAssignmentContext()`, called from `openAssignment()` — collapsed `<details>` above scores summary on `#view-assignment`, `teacher.html`'s `#assignment-context`; reuses `toEmbedUrl()` same way student-side instructions block and `openReview()`'s rubric block already do |
| Accomplishment report + photo collage generator (DepEd work-from-home/modular activity documentation) | `js/teacher.js`'s `renderCollagePreview()`/`drawScatteredCollage()` (randomized scrapbook-style `<canvas>` layout, reshuffles on "Regenerate layout") / `buildAccomplishmentReportDocx()`/`generateAccomplishmentReport()` (`.docx` via `docx` CDN ESM import), all called from `renderImagesGallery()` — same per-assignment scope as photo gallery/ZIP above; `draftReportDescription()` auto-drafts editable narrative text (title/section/dates + assignment's `instructions` if set), no student/photo-count table |
| Section-wide activities overview (all Written Work + Performance Task assignments, title/points/due, for eyeballing/encoding into Class Record) | `js/teacher.js`'s `renderActivitiesSummary()`, called from `loadAssignments()` — collapsed `<details>` above assignment cards on `#view-section`, `teacher.html`'s `#activities-summary`; distinct from per-assignment scores summary (lists students) and Records grid (also lists students, per-assignment columns) — this one lists activities |
| Fixing garbled student name from anywhere it shows (Enrolled Students, or submission card while reviewing) | `js/teacher.js`'s `renameStudentEverywhere(studentUID, newName)` — updates every `enrollments` doc AND every `submissions` doc for that `studentUID` in one go, since `submissions.studentName` is cached snapshot taken at submit time, not looked up live; both edit-name entry points (`openEnrolled()`, `loadSubmissions()`) call this shared helper now |
| Student dashboard UI/behavior (join class/submit link/view results) | `js/student.js` + `student.html` |
| Google Sign-In / role routing (teacher vs student) | `js/auth.js` (uses Google Identity Services directly via `initGoogleSignIn()` + `signInWithCredential`, not Firebase's own `signInWithPopup`/`signInWithRedirect` — those tried first and silently failed on Edge/Brave, cross-domain storage partitioning with zero console error; don't revert without strong reason, see `CLAUDE.md`. `use_fedcm_for_button` removed for same reason: Brave's engine doesn't implement FedCM API at all, so it threw `NotSupportedError` internally with no fallback — this app never calls `accounts.id.prompt()`, so dropping flag only affects button, no other side effect. `isTeacherEmail()` async, checks `ADMIN_EMAIL` then `teachers` collection) |
| Firebase project keys / super admin email constant (frontend) | `js/firebase-config.js` (`ADMIN_EMAIL`) |
| Adding/removing teacher account (isolated dashboard, granted by super admin) | `js/teacher.js`'s `loadTeachers()` (list + remove) / `add-teacher-form` handler (add, `setDoc(doc(db,"teachers",email), ...)`) / `renderViewAsPicker()` (admin's per-teacher "view as" `<select>`, sets `state.viewAsEmail`) — all gated behind `#admin-teachers-section` in `teacher.html`'s Settings panel, shown only when `currentUser.email === ADMIN_EMAIL`; `ownerScopedQuery()`/`ownedByViewAs()` (top of `js/teacher.js`) are shared helpers every list query and write in file goes through for per-teacher isolation |
| Who can read/write what in Firestore | `firestore.rules` — after any change here, remind user to `firebase deploy --only firestore:rules`; local edits alone don't take effect |
| AI rubric-check logic (prompt, Gemini model/params, key storage, image-vision fetch) | `js/gemini.js` (`runRubricCheck()`; `tryFetchImagePart()` for "image" assignments — best-effort, see limitations; `photoData` param sends in-app camera capture directly as inline image data, no link needed). Gemini key lives in teacher's browser `localStorage` only, set via Settings box — never hard-code key into any committed file |
| In-app photo capture, multi-page (student, "image" and "document" assignments) | `js/student.js` (`compressImage()` per photo, `pendingPhotos` Map + `renderPhotoThumbs()` — up to `MAX_PHOTOS` (10) pages per submission, each capped at `PER_PHOTO_MAX_LEN` chars so all of them together still fit Firestore's 1MiB doc cap; saved as `submissions.photoPages` string[] of base64 data URLs, no Storage involved; file input has no `capture` attribute so OS chooser offers camera or gallery; `renderSubmitForm()`'s type check gates which assignment types show it) + `js/teacher.js` (`loadSubmissions()` renders `.photo-thumbs` row when `photoPages` set, falls back to legacy single `photoData` field for submissions made before multi-page support) |
| Delete subject, section, or assignment (cascades) | `js/teacher.js` (`cascadeDeleteSubject()`/`cascadeDeleteSection()`/`cascadeDeleteAssignment()`, shared `deleteWhere()` helper) — deletes everything under thing deleted (see Data model below); subjects also have Archive as non-destructive alternative |
| Student fixing own garbled display name | `js/student.js`'s inline edit control on each "My classes" card (`loadEverything()`) + `firestore.rules`'s `enrollments` update rule (students may only touch `studentName` on own enrollment) — same interaction pattern as teacher's Enrolled Students "Edit name" |
| Inline preview embedding (which links embed vs. fall back to plain link) | `js/embed.js`'s `toEmbedUrl()` — single Drive files, Drive **folders** (`embeddedfolderview`, `#grid` view — fix for "multi-file Drive folder link redirects instead of embedding"), Google Docs/Slides/Sheets, YouTube (watch or `youtu.be`), CodePen. GitHub Gist and anything else fall back to plain `<a href>` — every caller (`renderAssignmentContext()`, `openReview()`'s rubric block, `student.js`'s instructions block) already has that iframe-or-link fallback, so fixing link *type* here fixes it everywhere at once |
| Android "Open in Chrome" button next to non-embeddable fallback link (some phones hand tap to native "Document Viewer"-type app instead of Chrome) | `js/embed.js`'s `openInChromeButton(url)` (renders nothing off-Android — no iOS equivalent) + `wireOpenInChromeButtons(container)` (one delegated click listener per container, called once at init — `js/student.js`'s `#assignments-list`, `js/teacher.js`'s `#assignment-context`) — same `intent://...package=com.android.chrome` technique as `index.html`'s in-app-browser escape hatch |
| Roster seeding (per section) / Records gradebook grid (grouped by component - Written Work / Performance Task) | `js/teacher.js` (`renderRosterPreview()`, `addRosterNames()` for manual typed/pasted entry, `loadRecords()`) + `teacher.html` (`#view-records`) — Class Record `.xlsx` upload (`loadWorkbook()`, `js/class-record.js`) still there as "Or upload instead" fallback, but manual entry is default path; `openSection()` preloads section's already-saved roster into same editable list so not one-shot upload-only flow |
| Home button (jump to `view-subjects` from any depth) | `teacher.html`'s header `#go-home` + `js/teacher.js`'s listener (same body as `back-to-subjects`) |
| In-app-browser sign-in warning (Messenger/Instagram/Line/TikTok links) | `index.html`'s inline module script, `isInAppBrowser()` (user-agent sniff) + `#in-app-browser-warning` banner - Google blocks OAuth inside these embedded WebViews on purpose (`disallowed_useragent`), can't be bypassed, only worked around by pointing user at real browser (Android gets `intent://` "Open in Chrome" button, everyone gets "Copy link") |
| Sign-in failure notification (GIS script didn't load, credential exchange failed, or slow-load timeout) | `index.html`'s `showError()`/`FRIENDLY_ERRORS` + `#error` box (hidden until something actually fails) |
| Preventing duplicate enrollment in same section, join success feedback | `js/student.js`'s `join-form` handler (checks for existing `enrollments` doc for that `studentUID`+`sectionId` before enrolling either way) |
| Invite student by Gmail, auto-join on sign-in (no email-click-to-accept step) | `js/teacher.js`'s `loadSections()` ("Invite by email" `<details>` next to "Show QR", `getPendingInvites()` for section's pending list + Cancel) + `js/student.js`'s `applyPendingInvites()` (called right after sign-in, before `loadEverything()`) — writes/consumes `invites` collection (see Data model), supplements join-code/QR flow rather than replacing it |
| Settings panel toggle (Gemini key, hidden by default; teacher-account management, super admin only) | `teacher.html`'s header `#toggle-settings` button + `#settings-panel` (starts with `hidden` class, independent of `show()` view stack so it stays open/closed across navigation) — button itself stays visible for super admin even with `AI_CHECK_ENABLED` off, since now also entry point to `#admin-teachers-section` |
| Enrolled students list (subject-wide from `#view-subject`, or one section only from `#view-section`'s own "View Enrolled Students" button) + removing wrong/duplicate enrollment | `js/teacher.js` (`openEnrolled(onlySectionId)` - omit arg for subject-wide, pass `state.sectionId` for one section; `deleteDoc` on Remove button, row numbers via `${i+1}`) + `teacher.html` (`#view-enrolled`, shared by both entry points) |
| Student requesting to leave class (flagged, teacher approves - not instant self-removal) | `js/student.js` (My classes card's `data-toggle-leave` button, `updateDoc(..., {leaveRequested})`) + `js/teacher.js` (`getLeaveRequestCounts()`/`leaveBadge()` mirroring pending-submission badge, `openEnrolled()`'s request-aware Remove confirm message) + `firestore.rules`'s `enrollments` update rule (added `leaveRequested` to student-self-update field allowlist; delete stays teacher-only) |
| Row numbers on Enrolled Students table | `js/teacher.js`'s `openEnrolled()` row rendering (`#` column, same pattern as `renderRosterPreview()`'s existing `${i+1}`) - deliberately not added to Records grid (`loadRecords()`, gender-grouped) |
| Student retracting own submission (only while `status == "pending"`, never after grading) | `js/student.js`'s `loadEverything()` submission branch ("Remove submission" button, `deleteDoc`) + `firestore.rules`'s `submissions` delete rule (student may delete only own pending submission; teacher-only once published) |
| Teacher deleting any single submission directly (typed-name confirm) | `js/teacher.js`'s `loadSubmissions()` "Delete" button, gated by existing `confirmByTyping()` — no `firestore.rules` change needed, `canActAsOwner` could already delete submission regardless of `status` |
| Small icon-style delete buttons (Enrolled Students Remove, subject/section/assignment Delete) | `css/style.css`'s `button.danger.icon` (compact circular variant of `.danger`) + 4 button sites in `js/teacher.js` - markup-only change; see next row for subject/section/assignment confirm text itself |
| Delete confirmation strength (subject/section/assignment cascade deletes vs. remove-one-enrollment/remove-a-teacher) | `js/teacher.js`'s `confirmByTyping(message, name)` — used only on 3 cascade deletes (`loadSubjects()`/`loadSections()`/`loadAssignments()`'s delete handlers, each building id→name `Map` for prompt), since those wipe everything nested under thing deleted; lower-stakes single-doc removals (`openEnrolled()`'s Remove, `loadTeachers()`'s Remove) stay plain `confirm()` |
| Join flow / pick-your-name-from-roster | `js/student.js` (`join-form` handler, `renderNamePicker()`, `claimedNames()`, `enroll()`) + `student.html`'s `#join-name-picker` — only kicks in when section already has roster (`sections.roster`), otherwise falls back to using Google account name; QR/deep-link join → next row |
| QR-code join (per-section "Show QR", scan-to-join deep link) | `js/teacher.js`'s `joinLinkFor()`/`renderSectionQR()` (called from `loadSections()`, renders into `#qr-${sectionId}`) + `teacher.html`'s `qrcodejs` CDN `<script>` tag (client-side generation only — join link never leaves device, no external QR image API) + `js/student.js`'s `?code=` deep-link handling (`applyPendingJoinCode()`, stashes into `sessionStorage` before `guardPage()` can redirect signed-out student through `index.html` for sign-in, so code survives that hop) — no `firestore.rules` change needed, `sections` read already `isSignedIn()`-only; `renderSectionQR()` composites `state.subjectName` — section name label directly onto same canvas as QR pattern (not just sibling caption), so tight screenshot/print crop of just code stays identifiable out of context — plain `<p>` caption above code still exists too, for on-screen readability/accessibility (`state.subjectName` set in `openSubject()`) |
| Notification bell (header dropdown: pending submissions + leave requests + new joins, click to jump straight there) | `js/teacher.js`'s `getNotifications()`/`refreshNotifications()` (data), `renderNotifDropdown()`/`closeNotifDropdown()` (UI), `goToAssignment()`/`goToLeaveRequests()`/`goToNewJoins()` (navigation — replays `openSubject → openSection → openAssignment/openEnrolled` so Back buttons and `state.subjectId` stay correct) + `teacher.html`'s `#notif-bell`/`#notif-count`/`#notif-dropdown` — refreshes on page load, on bell click, after publishing grade, and after resolving leave request (no real-time listeners, see limitations) |
| "New joins" bucket specifically (who just enrolled, by name) | `js/student.js`'s `enroll()` stamps `seen: false` + `joinedAt` on every new `enrollments` doc; `js/teacher.js`'s `getNotifications()` queries `seen == false` (owner-scoped) grouped by section; `goToNewJoins()` marks those docs `seen: true` when teacher clicks row (names already visible in dropdown text itself, so clicking is read receipt — unlike pending submissions/leave requests, which only clear when underlying thing resolved) |
| Student's Assignments list grouping by subject | `js/student.js` (`loadEverything()` — groups by `subjectName` via `sectionId → subjectName` map built from student's own enrollments) |
| Styling / UI patterns (cards, buttons, tables, collapsibles, status colors) | `DESIGN_SYSTEM.md` first — has every pattern with copy-pasteable HTML, avoids re-reading `css/style.css` from scratch. Only open `css/style.css` itself for genuinely new pattern not covered there. Color/font/radius tokens are "Academic Clarity" palette (deep navy `--blue`, Source Serif 4 headlines, Atkinson Hyperlegible Next body, loaded via Google Fonts `<link>` in each HTML `<head>`) — see `DESIGN_SYSTEM.md`'s Tokens section for exact values |
| Firestore deploy config | `firebase.json`, `.firebaserc` |
| Setup/deploy instructions | `README.md` |

## Data model (Firestore)

- `teachers` — doc ID is granted teacher's lowercased email; fields
  `email`, `addedAt`, `addedBy`. Purely allowlist (existence = access),
  managed only by super admin from `teacher.html`'s Settings panel
  (`loadTeachers()`/`add-teacher-form` in `js/teacher.js`). Super admin
  itself never doc here — it's permanently hardcoded `ADMIN_EMAIL` (see
  `CLAUDE.md`'s Architecture section), avoids bootstrap chicken-and-egg
  problem for granting very first admin.
- `subjects`, `sections`, `assignments`, `submissions`, `enrollments` all
  carry `ownerEmail` field (creating teacher's email; for
  student-created `submissions`/`enrollments` copied from parent
  assignment/section, not student) — isolates each teacher's dashboard
  to own data. **Docs created before multi-teacher support have no
  `ownerEmail` field at all** and treated as super admin's via
  `firestore.rules`' `isLegacyUnowned()` and `js/teacher.js`'s matching
  `ownedByViewAs()` — no backfill required for app to keep working,
  though running one (stamp `ownerEmail:
  ADMIN_EMAIL` on every pre-existing doc) recommended before onboarding
  second real teacher, so no legacy-null edge case ever hit by student
  submitting against old, not-yet-backfilled assignment. Every list
  query and write in `js/teacher.js` goes through shared
  `ownerScopedQuery(collectionName, ...wheres)` / `ownedByViewAs(data)`
  helpers (top of file) rather than filtering by `ownerEmail` inline —
  `ownerScopedQuery()` queries unfiltered for super admin (Firestore's
  rules already grant them unconditional list access) and narrows with
  `ownedByViewAs()` client-side, since plain `where("ownerEmail","==",
  ...)` filter would silently exclude every legacy doc. Granted (non-admin) teacher always
  gets strict server-side filter instead, since never have legacy data.
  `state.viewAsEmail` (defaults to signed-in teacher's own email) is
  what both helpers key off — super admin's "view as" `<select>`
  (`renderViewAsPicker()`) is only thing that ever changes it to
  someone else's email.
- `subjects` — name, gradeLevel, schoolYear (free text, e.g. "2026-2027"), term ("1"|"2"|"3"), archived, ownerName (creating teacher's Google display name, stamped at creation — shown to students as "Teacher: X" on their My Classes card via `enrollments.teacherName`, copied at join time). Old subjects from before Term/Year existed just show "—" for both — not backfilled; same "—" fallback for subjects created before `ownerName` existed.
- `sections` — subjectId, sectionName, joinCode
- `assignments` — subjectId, sectionId, title, instructions (free text shown to students - objective/output format/anything needed), instructionsLink (optional Drive/Docs/folder link to instructions, embedded via `js/embed.js`'s `toEmbedUrl()` same as submission previews - single field, but Drive **folder** link works for multiple files at once, embedding as thumbnail grid), component ("written" | "performance" - drives Records grid's grouped header, older assignments without this land in fallback "Other" group), dueDate, allowedFileTypes (link-type hint, not upload constraint), totalPoints (number - score cap, teacher grades one raw number against this), rubricReferenceLink (optional Drive/Docs link to teacher's own rubric PDF/Word, shown embedded on Review screen for teacher's reference only - not parsed, not used to compute anything)
- `submissions` — assignmentId, studentUID, studentName, link (may be empty if `photoPages` used instead), photoPages (optional - string[] of base64 `data:image/jpeg;base64,...` pages from in-app photo capture (camera or gallery) on "image"/"document" assignments, up to `MAX_PHOTOS` (10), each compressed client-side to `PER_PHOTO_MAX_LEN` so whole array still fits 1MiB Firestore doc cap; no Storage; older submissions may instead have single `photoData` string field - both handled on display, both feed per-assignment photo gallery/ZIP download), status(pending/published — "ai-drafted" only appears on submissions graded before AI check hidden), finalGrade{score, feedback} (score is single number out of assignment's `totalPoints`). Student may `deleteDoc` own submission while `status == "pending"` (rule-enforced in `firestore.rules`, not just hidden in UI) - once `published`, immutable from their side.
- `enrollments` — studentUID, studentName (if section had roster at
  join time, this is exact roster spelling student picked via
  `js/student.js`'s name picker, not their Google account name - see
  `sections.roster` below), studentEmail (student's Gmail - added for
  Enrolled Students list; enrollments created before this field added
  just show blank there), subjectId, subjectName, teacherName (copied
  from `subjects.ownerName` at join time, "—" if subject predates that
  field), sectionId, sectionName
  (created when student enters join code), leaveRequested (optional bool
  - student self-flags via My Classes' "Request to leave"/"Cancel leave
  request" toggle; teacher sees it flagged in Enrolled Students and acts
  via existing Remove flow, which still doesn't cascade to that
  student's submissions, same as any other removal), seen (bool,
  defaults false at enroll time - powers notification bell's "new
  joins" bucket, flipped to true once teacher's clicked that row in
  `js/teacher.js`; enrollments from before this field existed simply
  never match `seen == false` query, so read as already-seen with no
  backfill needed), joinedAt (`serverTimestamp()`, stamped alongside
  `seen` - not currently read anywhere, just available if "joined on X"
  display ever wanted)
- `invites` — studentEmail (lowercased Gmail teacher typed in),
  studentName, subjectId, subjectName, sectionId, sectionName, teacherName,
  ownerEmail, createdAt. Written by `js/teacher.js`'s "Invite by email"
  form (`loadSections()`); consumed (read then `deleteDoc`'d) by
  `js/student.js`'s `applyPendingInvites()` moment invited student signs
  in with that email — calls same `enroll()` used by join-code flow, so
  resulting `enrollments` doc identical either way. One doc per invited
  student per section; deleted whether or not resulted in new enrollment
  (e.g. student had already joined some other way), so stale invite can
  never re-fire or accumulate.
- `sections.roster` — `{name, gender}[]` of official students, set via
  Set Roster manual paste or `.xlsx` upload in `view-section` (gender is
  `"Male"`/`"Female"`/`""`; xlsx-loaded rosters always get `""` since
  sheet reader only reads one name column). Manual paste auto-detects
  `MALE`/`FEMALE` header lines same way real Class Record lays them
  out - `js/teacher.js`'s `addRosterNames()` tags every following name
  with that gender until next header. **Sections saved before gender
  tracking existed have plain `string[]` roster instead** - every reader
  (`openSection()`, `loadRecords()` in `js/teacher.js`,
  `renderNamePicker()` in `js/student.js`) normalizes `typeof r ===
  "string" ? {name: r, gender: ""} : r` before use, so old sections keep
  working, just without gender grouping until re-saved. Drives three
  things: (1) at join time, `js/student.js`'s `renderNamePicker()` makes
  student pick name from this list instead of trusting their Google
  display name, so `studentName` matches roster exactly by construction
  going forward - already-claimed names excluded from picker
  (`claimedNames()`, queried live against `enrollments`); (2) Records
  grid's rows — matched against `enrollments.studentName`
  (case-insensitive) to find each roster student's actual submissions,
  and grouped into Male/Female/Other blocks (`.gender-group` header rows)
  when roster has gender data. Roster name with no matching enrollment
  shows as "Not joined" rather than being silently omitted — that's
  whole point of seeding from real roster instead of just listing
  whoever self-enrolled.
