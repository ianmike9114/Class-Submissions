---
name: lms-layout-expert
description: Hands-on expert for the three things this LMS keeps getting asked to fix — (1) "students still see last term's classes" (term-visibility model, admin term wins school-wide, blank-term rule, how to debug it), (2) "organize / declutter this screen, use dropdowns, use the empty space" (subject → lesson <details> dropdowns, one-status-chip rows, "⋯" overflow menus, Up next panel), and (3) "make it responsive for desktop and mobile" (1180px student workspace, 640px breakpoint, 44px taps, no sideways scroll). Use whenever the teacher sends a screenshot saying a list is messy/trashy, a term should be hidden/archived, or a layout wastes space or breaks on phones — on either student.html or teacher.html. Gives the exact functions, CSS classes, and the verify + ship checklist. Builds on [[lms-organization]] (WHERE things go) and [[compact-mode]] (collapse mechanics); routing in [[student-lms]]; audit steps in [[responsive-audit]].
---

# lms-layout-expert

Low-tech audience: teachers who aren't power users, students on cheap phones.
Goal = **obvious at a glance**. Layout + labels only — never a Firestore schema
or `firestore.rules` change unless the task truly needs one.

## 1. Term visibility ("Term 1 still shows")

**Model (students — `js/student.js` `getHiddenSectionIds()`):** effective term =
1. `settings/all-teachers` (legacy site-wide override, still honored), else
2. `settings/{ADMIN_EMAIL}` — **the super admin's own current term is school-wide
   and wins over every teacher's own setting**, else
3. `settings/{ownerEmail}` (only used when the admin set no term).

A subject is hidden when `archived`, or when under an active term its
`(schoolYear, term)` ≠ the effective one. **A subject with blank SY/term counts as
a mismatch → hidden.** Comparison is normalized (`normTerm()` takes the digits so
"Term 2" == "2"; `normYear()` strips spaces and unifies dashes).

**Teacher grid (`js/teacher.js` `loadSubjects()`)** mirrors the same order via
`getGlobalTermSetting()` → `getAdminTermSetting()` → `getCurrentTermSetting()`, so
what a teacher sees = what students see. The term preview lists **Visible / Hidden /
No term set** classes (`renderTermPreview()`). The old "Apply to ALL teachers"
checkbox stays hidden; admin's "Set as current" (as self) clears `all-teachers`.

**Debug order when a past-term class still shows:**
1. Is the deploy live? Check `student.js?v=` in the served `student.html` vs repo;
   Vercel deploys from `main` only after push.
2. Admin's current term set? (Teacher grid label says "school-wide, set by admin".)
3. The class's subject SY/Term — wrong values (e.g. Term 2 tagged on a Term 1 class)
   show it; fix with **Edit Year/Term**, never by code special-casing.
4. Still wrong → console: `hidden-section lookup failed` means a read was denied —
   everything falls back to visible by design (never blank the dashboard).

## 2. Organizing a cluttered list

**Row anatomy (every list):** type badge (`.chip-material` 📄 / `.chip-todo` ✎) →
title (`overflow-wrap:anywhere`, clamp to 2 lines) → one muted meta line
(`Due Oct 2 · 50 pts · document`) → **exactly one status chip** → **one primary
button** → everything else in a `⋯` menu.

**Patterns (all native, no library):**
- **Dropdown groups:** `<details class="outline-subject">` (subject, summary carries
  counts + progress bar) → `<details class="outline-lesson">` (lesson/topic + count).
  Desktop opens only the first subject with open work; phones start collapsed.
  A lone "General" group renders flat. `openAssignment()` opens ancestor `<details>`;
  `filterAssignments()` matches `data-title` and auto-opens groups with hits.
- **Overflow menu:** `<details class="menu"><summary>⋯</summary><div class="menu-panel">…`
  Each page JS has one delegated outside-click closer. Destructive item = `.menu-danger`,
  always last. Keep existing `data-*` attributes so handlers don't change.
- **Status chips:** `.chip-done` `.chip-submitted` `.chip-todo` `.chip-soon`
  `.chip-missing`/`.chip-returned` `.chip-material` `.chip-link` (file links as chips).
  Student wording from `itemStatus()`: Done ✓ / Read / Graded ✓ / Submitted /
  Fix & resubmit / Missing / Due in Nd / Due today / To do.
- **Empty space is a feature slot:** an empty detail pane shows **Up next**
  (`renderUpNext()` — unsubmitted open work by due date, then unread materials),
  never a lone "pick something" line.
- **Teacher section list:** `loadAssignments()` groups by lesson in `state.topics`
  order ("General" last), oldest first, each group `<details class="card assign-group">`
  of `.assign-row`s (2-col grid: `.assign-main` | `.assign-actions`).
- **My classes:** `.class-grid` of `.class-card` (subject / section / Teacher / As),
  Edit name + Request to leave inside the `⋯` menu.

Build from data already fetched — no extra Firestore reads for layout. Escape every
teacher-entered string (`esc()` student, `escAttr()` teacher).

## 3. Responsive

- Student workspace: `body.student-page main { max-width: 1180px }`; outline column
  `#course-outline { flex-basis: 320px }`; teacher page keeps its shell.
- Single breakpoint `@media (max-width: 640px)` (bottom block of `css/style.css` for
  these components): grids → 1 column, `.assign-row` stacks with full-width primary
  button, taps ≥ 44px (`.outline-item`, `.menu > summary`, `.menu-panel button`).
- `renderOutline()` reads `matchMedia("(max-width: 640px)")` at render time.

## 4. Verify

1. `node --check js/student.js js/teacher.js`.
2. Pages need Google sign-in, so check layout with a **static harness** in the
   scratchpad: copy `css/style.css`, paste the render functions + fake docs
   (`{ id, data: () => ({...}) }`), serve with `python -m http.server`, open in the
   browser pane at 1280px and 375px (reload after resizing — open-state is decided
   at render). Confirm `document.documentElement.scrollWidth === innerWidth`.
3. Real data check after deploy: as a student, past-term classes gone; teacher term
   preview buckets look right.

## 5. Ship

- `node scripts/bump-version.mjs` (bumps every `?v=` + `sw.js` CACHE_NAME).
- Update `CLAUDE.md` / `[[student-lms]]` task map if a function moved.
- Commit only the touched files (repo often has unrelated LAC-session changes).
  Push / PR / deploy only when the teacher says so.
