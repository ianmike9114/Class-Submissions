---
name: lms-organization
description: The standing information-architecture map for this LMS — how the teacher and student dashboards are (and should be) organized so a low-tech DepEd teacher or a student on a cheap phone instantly understands what they're looking at and what to do next. Defines the correct top-to-bottom section order, the grouping model (student = Subject → Topic/Lesson → assignment leaf, with materials separated from graded work; teacher = subjects → sections → assignments → submissions spine with secondary tools tucked away), labeling/heading rules, empty states, and what belongs collapsed. Use whenever a screen "is confusing / cluttered / hard to follow", when asked to reorganize, declutter, or "make it user-friendly / like Google Classroom", or before adding a new panel/section to either tab so it lands in the right place. Density and collapse mechanics live in [[compact-mode]]; heuristics in [[ui-ux-playbook]]; the create-flow specifics in [[classroom-material-flow]]; visual polish in [[clean-ui-craft]]; which file/function to edit in [[student-lms]].
---

# lms-organization — how the two dashboards are laid out

Audience is low-tech: DepEd teachers who are not power users and students on small,
slow phones. The bar is **obvious at a glance**, not feature-rich. This skill is the
IA reference; it does not change data — grouping/order/labels only. For collapse
mechanics use `[[compact-mode]]`; for which function renders what use `[[student-lms]]`.

## Student dashboard — canonical order (top → bottom)

1. **Header** — avatar, email, Refresh, Install, Sign out.
2. **Urgent callouts first** — `#needs-resubmission` (returned work to fix). Never
   below the fold, never inside a closed block. If nothing's urgent it doesn't render.
3. **My classes** — `#classes-list`. One card per live enrollment. A student must
   only see **current-term** classes (finished terms are hidden by
   `getHiddenSectionIds()` in `js/student.js`); a dashboard showing retired-term
   classes is the #1 reported confusion and is an IA bug, not decoration.
4. **Assignments** — the work area:
   - Short "How this page works" note, collapsed (`<details class="student-guide">`).
   - Search box.
   - **Course outline** (Subject → Topic/Lesson → assignment leaf) as the primary
     navigator, plus the detail pane and Prev/Next stepper.
5. **Join card** stays hidden (QR/deep-link only) — do not re-expose the code box.

### Student grouping model (don't fight it)
- **Subject → Topic/Lesson → assignment.** `renderOutline()` (`js/student.js` ~822)
  groups by subject, then by the assignment's `lesson`, ordered by the teacher's
  managed topic order first. Keep this hierarchy; don't flatten it.
- **Materials are separated from graded work.** Progress counts split "submitted /
  gradable" from "Materials done / total". Preserve that separation in any relabel.
- **One clear status per assignment card:** Material · due date · Submitted/pending ·
  Graded · Returned-please-revise. Exactly one primary status, human words.

## Teacher dashboard — canonical spine

1. **Header actions**, grouped by job (not a flat button wall): manage-classes vs
   notifications/tools. On phones the header must wrap/stack (existing 640px block).
2. **The spine, in flow order and open:** Subjects → Sections → Assignments →
   Submissions. This is the teacher's mental model; keep it the visible backbone.
3. **Secondary tools collapsed** (`<details>` / dropdowns): term-filter & preview,
   QR/invite, photo ZIPs/collage, records extras, teacher-access settings. Present
   but folded so the dashboard opens scannable (see `[[compact-mode]]`).
4. **The term-filter panel is a control, not the headline** — its "Visible to
   students / Hidden from students" preview describes only the viewed teacher's own
   subjects; label it so a teacher never reads it as the whole school's roster.

## Labeling & empty-state rules

- **Headings say the noun a teacher/student uses:** "My classes", "Assignments",
  "Submissions" — not internal terms.
- **Titles:** `Subject — Section` joined by a spaced em-dash; keep student-name
  parentheses from overflowing (truncate/wrap gracefully on narrow cards).
- **Every list has a real empty state** ("No assignments yet", "No submissions to
  review") — never a bare blank region that reads as broken.
- **Escape teacher-entered text** (`esc()`) wherever it's interpolated into markup;
  some inline cards still interpolate raw — fix on touch, don't add new raw sinks.

## When adding a new section/panel

Ask: is it primary (belongs in the open spine/flow) or secondary (collapse it)?
Does it duplicate an existing group — can it live inside one instead of adding a new
top-level block? Put urgent/actionable things high and open; put reference/config
things low and folded.

## Ship checklist

- Order matches the canonical lists above; primary open, secondary collapsed.
- Student sees only current-term classes; every list has an empty state.
- Materials stay separated from graded work; one clear status per card.
- Headings/labels are audience words; titles don't overflow on phones.
- No Firestore schema/rules change (IA is layout + labels only).
- Verified desktop + 375px (`[[responsive-audit]]`); `?v=N` bumped on every changed
  asset in each referencing HTML.
