# Teacher notification bell (pending submissions + leave requests)

## Context

The teacher currently sees "pending" counts scattered across the subject/
section/assignment card hierarchy (`pendingBadge()`/`leaveBadge()` in
`js/teacher.js`), but has to drill down manually to find which assignment
or section actually needs attention. Add a Facebook-style bell icon in
the teacher header: a red count badge, click opens a dropdown listing
every pending item, click an item jumps straight to it.

Teacher-side only — students don't have an equivalent "pending" concept
today (out of scope, would need a separate seen/unseen tracking design).

## Data

New `getNotifications()` in `js/teacher.js` — one combined fetch (mirrors
the existing `getPendingCounts()`/`getLeaveRequestCounts()` pattern but
resolves names, not just ids, since the dropdown needs to be readable out
of context):

- `subjects` (id → name)
- `sections` (id → {sectionName, subjectId})
- `assignments` (id → {title, sectionId})
- `submissions` where `status == "pending"`, grouped by `assignmentId` → count
- `enrollments` where `leaveRequested == true`, grouped by `sectionId` → count

Returns:
```js
{
  submissions: [{ assignmentId, sectionId, subjectId, title, sectionName, subjectName, count }, ...],
  leaves: [{ sectionId, subjectId, sectionName, subjectName, count }, ...],
  totalCount: <sum of every count above>,
}
```
`totalCount` drives the red badge number — matches the existing app
convention of showing raw pending-item counts (not notification-row
counts).

## Navigation (jump chain)

Clicking a row must replay the full subject → section → (assignment |
enrolled) drill-down, not just jump straight to the target view. Two
existing pieces of state only get set by the intermediate `open*()`
calls:
- `state.subjectId` — only set by `openSubject()`. Used by
  `add-assignment-form`'s write and by `back-to-subject`'s button (which
  just does `show("view-subject")`, assuming that view was already
  populated).
- `enrolledBackView` — set by `openEnrolled()` itself, fine either way.

Skipping straight to `openAssignment()`/`openEnrolled()` would leave
`state.subjectId` stale/null and `view-subject`/`view-section` unpopulated,
breaking Back buttons and a subsequent "Add assignment" write. So:

```js
async function goToAssignment(subjectId, sectionId, assignmentId) {
  await openSubject(subjectId);
  await openSection(sectionId);
  await openAssignment(assignmentId);
  closeNotifDropdown();
}

async function goToLeaveRequests(subjectId, sectionId) {
  await openSubject(subjectId);
  await openSection(sectionId);
  await openEnrolled(sectionId);
  closeNotifDropdown();
}
```

## UI

`teacher.html` header, right-side div, inserted before `#teacher-email`:
```html
<div style="position:relative; display:inline-block;">
  <button class="secondary" id="notif-bell">&#128276;<span id="notif-count" class="notif-badge hidden">0</span></button>
  <div id="notif-dropdown" class="notif-dropdown hidden"></div>
</div>
```

`renderNotifDropdown(data)` builds two optional groups (a group is
omitted entirely when it has zero rows) plus an empty state:
```html
<div class="notif-group-label">Pending submissions</div>
<button class="notif-item" data-goto-assignment="${subjectId}|${sectionId}|${assignmentId}">
  ${title} <span class="muted">(${subjectName} &rsaquo; ${sectionName})</span> — ${count} pending
</button>
<!-- ... -->
<div class="notif-group-label">Leave requests</div>
<button class="notif-item" data-goto-leave="${subjectId}|${sectionId}">
  ${subjectName} &rsaquo; ${sectionName} — ${count} leave request(s)
</button>
```
Both groups empty → `<p class="muted" style="padding:0.5rem 0.75rem;">You're all caught up.</p>`

New CSS in `css/style.css` (first dropdown-style component in the app —
genuinely new pattern, not covered by `DESIGN_SYSTEM.md` today; add it
there once built):
```css
.notif-badge {
  position: absolute;
  top: -6px; right: -6px;
  background: #b91c1c;
  color: white;
  border-radius: 9999px;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.05rem 0.35rem;
  line-height: 1.3;
}
.notif-dropdown {
  position: absolute;
  top: 110%; right: 0;
  background: white;
  border: 1px solid var(--gray-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-hover);
  min-width: 280px;
  max-height: 320px;
  overflow-y: auto;
  z-index: 10;
  padding: 0.5rem 0;
}
.notif-dropdown .notif-group-label {
  padding: 0.4rem 0.75rem 0.2rem;
  font-weight: 700;
  font-size: 0.75rem;
  color: #6b7280;
  text-transform: uppercase;
}
.notif-dropdown button.notif-item {
  display: block;
  width: 100%;
  text-align: left;
  background: none;
  color: var(--text);
  border: none;
  border-radius: 0;
  padding: 0.5rem 0.75rem;
  font-size: 0.9rem;
}
.notif-dropdown button.notif-item:hover { background: var(--gray-bg); }
```

## Toggle / outside-click-close

```js
el("notif-bell").addEventListener("click", async (e) => {
  e.stopPropagation();
  const dropdown = el("notif-dropdown");
  if (!dropdown.classList.contains("hidden")) { dropdown.classList.add("hidden"); return; }
  await refreshNotifications();
  dropdown.classList.remove("hidden");
});
document.addEventListener("click", (e) => {
  if (!e.target.closest("#notif-bell, #notif-dropdown")) el("notif-dropdown").classList.add("hidden");
});
```

## Refresh triggers

No real-time listeners in this app (documented, deliberate limitation) —
`refreshNotifications()` (fetches via `getNotifications()`, updates
`#notif-count` text/visibility, stores the result in a module-level var
for `renderNotifDropdown()` to read) is called at:

1. Init, right after `guardPage("teacher")` resolves — badge is correct
   on first paint, not just after the first click.
2. Every bell click that opens the dropdown (fetch-on-open) — ensures the
   list is fresh at the moment the teacher actually looks at it.
3. Right after a grade is published — hook into `openReview()`'s
   save/publish handler.
4. Right after a leave request is resolved via Remove — hook into
   `openEnrolled()`'s remove-enrollment handler.

## Error handling

A failed fetch inside `refreshNotifications()`/`getNotifications()`
renders `<p class="muted">Couldn't load notifications.</p>` inside the
dropdown instead of throwing. The badge count simply holds its last
known value rather than assuming the fetch always succeeds.

## Out of scope

- Student-side notifications (new grade published, etc.) — different
  problem (needs a seen/unseen tracking mechanism that doesn't exist
  yet), not requested.
- Live/real-time badge updates while the teacher sits on a page — this
  app has no `onSnapshot` listeners by design (see `CLAUDE.md`'s "Known
  v1 limitations"); the refresh triggers above are the practical
  equivalent within that constraint.

## Verification

- Sign in as teacher with at least one pending submission and one
  flagged leave request across two different subjects/sections.
- Confirm the bell badge shows the correct total count on first page
  load, without needing to click anything first.
- Click the bell: dropdown opens, shows both groups with correct
  labels/counts, "You're all caught up" never appears (since there's
  pending data).
- Click a pending-submission row: lands on that assignment's submission
  list (not a blank/wrong view), Back button returns to the correct
  section.
- Click a leave-request row: lands on Enrolled Students for that section,
  Back button returns to the correct section.
- Click outside the open dropdown: it closes without navigating anywhere.
- Publish a grade for the submission just jumped to, reopen the bell:
  count has decremented.
- Remove/resolve the leave request just jumped to, reopen the bell:
  count has decremented.
- Force a Firestore read failure (e.g. offline) and confirm the dropdown
  shows the "Couldn't load notifications." message instead of a JS error.
