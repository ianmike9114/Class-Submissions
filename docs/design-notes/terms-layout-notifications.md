# Terms, layout and notifications

Deliberate design decisions and known limits. Moved out of `CLAUDE.md` so they load only
when needed. Read before editing this area; add new notes for this area here.

- **Per-teacher "current term" filter (`settings/{ownerEmail}` collection).**
  A teacher picks the active `{ currentSchoolYear, currentTerm }` from the
  subjects grid ("Set the current term"); it's stored in `settings/{their
  email}`. The grid's "Showing current term / all terms" dropdown then hides
  subjects outside that term (`js/teacher.js`'s `loadSubjects()` +
  `getCurrentTermSetting()`), and students stop seeing prior-term classes:
  `js/student.js`'s `getHiddenSectionIds()` (renamed from
  `getArchivedSectionIds`) now hides sections whose subject is archived **or**
  outside the owning teacher's current term, reading that teacher's `settings`
  doc. **Backward-compatible:** no setting (or blank fields) hides nothing by
  term; every read is best-effort. **`firestore.rules` adds a `settings`
  match block** (single-doc `get` open to any signed-in user — students read
  their teacher's marker; write owner/super-admin only) — **must `firebase
  deploy --only firestore:rules`**, else the teacher's "Set as current" write
  is denied and the feature stays dark (grid/students just show all terms).
  **Site-wide admin override (`settings/all-teachers`).** A super admin can tick
  "Apply to ALL teachers" next to "Set as current" (`#current-term-global`,
  revealed only for `isSuperAdmin`); it writes a single `settings/all-teachers`
  doc. (The id is a plain string, deliberately **not** a `__…__` sentinel —
  Firestore rejects any doc id matching `__.*__` as reserved; real teacher
  settings docs are keyed by email, so `all-teachers` can't collide with one.)
  When present it **overrides every teacher's own setting**: `js/student.js`'s
  `getHiddenSectionIds()` reads `all-teachers` first and, if set, hides any subject
  whose (SY, term) ≠ it for **all** owners, so students site-wide see only that
  term regardless of which teacher owns the class. `js/teacher.js`'s
  `getGlobalTermSetting()` + `loadSubjects()` make the admin's own grid mirror
  the override. Unticking the box (as admin) `deleteDoc`s `all-teachers`, falling
  everyone back to per-teacher settings. **No rules change** — the existing
  `settings` block already lets `isSuperAdmin()` write/delete any id (incl.
  `all-teachers`) and any signed-in user `get` it.
  **Admin term wins school-wide (supersedes the checkbox).** The super admin's
  own `settings/{ADMIN_EMAIL}` term now governs every teacher's classes for
  students: effective order is `all-teachers` → admin's setting → owner's own
  (owner's only when the admin set none). Under an active term a subject with a
  **blank SY/term is hidden** (the term preview lists those as "No term set" so
  their teacher fixes them via Edit Year/Term). Term/SY compare normalized
  (`normTerm()`/`normYear()` in both JS files: "Term 2" == "2", dash/space
  variants equal). `js/teacher.js`'s `getAdminTermSetting()` makes every grid
  mirror it; the "Apply to ALL teachers" checkbox is now permanently hidden and
  an admin "Set as current" (as self) clears any stale `all-teachers`. Added
  after students kept seeing Term 1 classes whose teachers had an old term saved
  or no term on the subject. Patterns + debug order:
  `.claude/Skills/lms-layout-expert/SKILL.md`.
- **Organized layout (dropdowns, chips, ⋯ menus).** Student `My classes` is a
  `.class-grid` of cards (Edit name / Request to leave in a `<details class="menu">`);
  the course outline is subject → lesson `<details>` dropdowns with a type icon,
  short due date and one status chip per item (`renderOutline()`/`itemStatus()`),
  and the empty detail pane shows **Up next** (`renderUpNext()`). Student `main` is
  1180px wide (`body.student-page`). Teacher section assignments (`loadAssignments()`)
  are grouped by lesson in `state.topics` order, as compact `.assign-row`s with one
  primary button and Share/Copy/Delete in a `⋯` menu. Styles: bottom block of
  `css/style.css`. See `lms-layout-expert` skill.
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
- **"Email class (Gmail)" — zero-setup alternative to EmailJS notify.**
  `js/teacher.js`'s `buildEmailClassUrl()`/`emailClass()` open the teacher's
  *own* Gmail compose (desktop: `mail.google.com/mail/?view=cm`; phones,
  `(pointer: coarse)`: `mailto:` → Gmail app, since Gmail mobile web drops
  compose fields) with every non-pending enrolled `studentEmail` in BCC and
  `buildAssignmentAnnouncement()` as the body. Lives in each assignment
  row's ⋯ menu; after adding an assignment with no EmailJS config,
  `showEmailClassPrompt()` shows a bottom prompt with a **real link**, not
  `window.open` — the submit click's user activation has expired after the
  `addDoc`/enrollment awaits, so a scripted open would be pop-up blocked.
  Nothing is sent by the app; teacher presses Send. No rules change.
