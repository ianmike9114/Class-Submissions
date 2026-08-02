# Teacher Notification Bell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Facebook-style bell icon to the teacher header — red count badge, click opens a dropdown of pending submissions (grouped by assignment) and leave requests (grouped by section), click a row jumps straight to it.

**Architecture:** Pure client-side addition to the existing `js/teacher.js` monolith (no new files — this repo has no bundler, every page is one flat script). One data function (`getNotifications()`) resolves ids to display names in a single combined Firestore fetch; render/toggle logic lives in module scope next to the existing `open*()` view functions it calls into.

**Tech Stack:** Vanilla JS (ES modules), Firebase Firestore SDK (already imported in `js/teacher.js`), plain CSS (no framework). No test runner exists in this repo (static site, no build step, no `package.json`) — every task's verification step is a manual check against a locally-served copy of the app via the Browser pane, following the same pattern already used to verify the QR-join and Academic-Clarity-restyle work earlier in this repo's history.

## Global Constraints

- No Firebase Storage, no Cloud Functions — this feature is 100% client-side reads/writes against `subjects`/`sections`/`assignments`/`submissions`/`enrollments`, all already-readable by a signed-in teacher per `firestore.rules`. No rules changes needed.
- No bundler/build step — plain `<script type="module">`, no npm install.
- Bump the `js/teacher.js?v=N` cache-buster in `teacher.html` on every task that changes `js/teacher.js` (GitHub Pages caches up to 10 min+, per `CLAUDE.md`). Current value going in is `?v=3` (set by the prior QR-join work) — this plan bumps it once, to `?v=4`, in Task 2, and every later task's verification loads that same `?v=4` copy (no need to re-bump per task).
- Teacher-only feature — nothing in this plan touches `student.html`/`js/student.js`.
- Reuse existing functions, don't reimplement: `openSubject(subjectId)`, `openSection(sectionId)`, `openAssignment(assignmentId)`, `openEnrolled(sectionId)` (all in `js/teacher.js`) are the only supported way to navigate to a view — they set required module state (`state.subjectId`, `state.sectionId`, `state.assignmentId`, `enrolledBackView`) that Back buttons and later writes (e.g. `add-assignment-form`) depend on. Never call `show("view-assignment")`/`show("view-enrolled")` directly to "jump" somewhere.

---

### Task 1: Notification bell/dropdown CSS

**Files:**
- Modify: `css/style.css:106-113` (insert new rules immediately after the existing `.qr-code` block, before `.hidden`)

**Interfaces:**
- Produces: CSS classes `.notif-badge`, `.notif-dropdown`, `.notif-dropdown .notif-group-label`, `.notif-dropdown button.notif-item` — consumed by Task 2's HTML and Task 4's generated markup.

- [ ] **Step 1: Add the CSS block**

In `css/style.css`, insert this immediately after the closing `}` of `.qr-code` (currently line 113) and before `.hidden { display: none !important; }`:

```css
.notif-badge {
  position: absolute;
  top: -6px;
  right: -6px;
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
  top: 110%;
  right: 0;
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

- [ ] **Step 2: Verify the rules parse (no CSS syntax errors)**

Run:
```bash
python -c "import re,sys; s=open('css/style.css').read(); print('OK' if s.count('{')==s.count('}') else 'BRACE MISMATCH')"
```
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add css/style.css
git commit -m "Add notification dropdown/badge CSS for teacher notification bell"
```

---

### Task 2: Bell icon + dropdown markup in the header

**Files:**
- Modify: `teacher.html:13-23` (header block)
- Modify: `teacher.html` (cache-buster line, currently `<script type="module" src="js/teacher.js?v=3"></script>`)

**Interfaces:**
- Produces: DOM elements `#notif-bell`, `#notif-count`, `#notif-dropdown` — consumed by Task 3/4/5's `el(...)` lookups in `js/teacher.js`.

- [ ] **Step 1: Add the bell markup**

In `teacher.html`, the header currently reads:
```html
  <header>
    <div style="display:flex; align-items:center; gap:0.75rem;">
      <button class="secondary" id="go-home">&#8962; Home</button>
      <button class="secondary" id="toggle-settings">&#9881; Settings</button>
      <h1>Teacher Dashboard</h1>
    </div>
    <div>
      <span id="teacher-email" class="muted" style="color:#dbe4ff;"></span>
      <button class="secondary" id="sign-out">Sign out</button>
    </div>
  </header>
```
Replace the second `<div>` with:
```html
    <div style="display:flex; align-items:center; gap:0.75rem;">
      <div style="position:relative; display:inline-block;">
        <button class="secondary" id="notif-bell">&#128276;<span id="notif-count" class="notif-badge hidden">0</span></button>
        <div id="notif-dropdown" class="notif-dropdown hidden"></div>
      </div>
      <span id="teacher-email" class="muted" style="color:#dbe4ff;"></span>
      <button class="secondary" id="sign-out">Sign out</button>
    </div>
```

- [ ] **Step 2: Bump the cache-buster**

Change:
```html
  <script type="module" src="js/teacher.js?v=3"></script>
```
to:
```html
  <script type="module" src="js/teacher.js?v=4"></script>
```

- [ ] **Step 3: Verify the markup is well-formed**

Run:
```bash
python -c "import re; s=open('teacher.html').read(); assert s.count('id=\"notif-bell\"')==1; assert s.count('id=\"notif-count\"')==1; assert s.count('id=\"notif-dropdown\"')==1; assert 'js/teacher.js?v=4' in s; print('OK')"
```
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add teacher.html
git commit -m "Add notification bell markup to teacher header"
```

---

### Task 3: `getNotifications()` data layer + `refreshNotifications()`

**Files:**
- Modify: `js/teacher.js` — add near the top, right after the existing `getLeaveRequestCounts()`/`leaveBadge()` block (currently ending around line 131, right before the `// ---------- subjects ----------` or next section comment — insert directly after `function leaveBadge(count) { ... }`).

**Interfaces:**
- Consumes: `db`, `collection`, `getDocs`, `query`, `where` (already imported at the top of `js/teacher.js`); `el(id)` helper (already defined).
- Produces:
  - `async function getNotifications()` → `Promise<{ submissions: Array<{assignmentId, sectionId, subjectId, title, sectionName, subjectName, count}>, leaves: Array<{sectionId, subjectId, sectionName, subjectName, count}>, totalCount: number }>`
  - `let lastNotifications` — module-level `{ submissions, leaves, totalCount, error }`, consumed by Task 4's `renderNotifDropdown()`.
  - `async function refreshNotifications()` → updates `lastNotifications` and the `#notif-count` badge text/visibility. Consumed by Task 4 (bell click, init) and Task 6 (post-publish, post-remove hooks).

- [ ] **Step 1: Add the module-level state var and `getNotifications()`**

Insert immediately after the existing `function leaveBadge(count) { ... }` block in `js/teacher.js`:

```js
let lastNotifications = { submissions: [], leaves: [], totalCount: 0, error: false };

// One combined fetch that resolves ids to display names (unlike
// getPendingCounts()/getLeaveRequestCounts() above, which only need ids
// because they're rendered inside a view that already has that context)
// - this powers the header-wide notification dropdown, which has no
// surrounding context of its own.
async function getNotifications() {
  const [subjectsSnap, sectionsSnap, assignSnap, pendingSnap, leaveSnap] = await Promise.all([
    getDocs(collection(db, "subjects")),
    getDocs(collection(db, "sections")),
    getDocs(collection(db, "assignments")),
    getDocs(query(collection(db, "submissions"), where("status", "==", "pending"))),
    getDocs(query(collection(db, "enrollments"), where("leaveRequested", "==", true))),
  ]);

  const subjectNames = new Map(subjectsSnap.docs.map((d) => [d.id, d.data().name]));
  const sections = new Map(sectionsSnap.docs.map((d) => [d.id, d.data()]));
  const assignments = new Map(assignSnap.docs.map((d) => [d.id, d.data()]));

  const submissionCounts = new Map();
  pendingSnap.forEach((d) => {
    const assignmentId = d.data().assignmentId;
    submissionCounts.set(assignmentId, (submissionCounts.get(assignmentId) || 0) + 1);
  });
  const submissions = [...submissionCounts.entries()].map(([assignmentId, count]) => {
    const a = assignments.get(assignmentId) || {};
    const section = sections.get(a.sectionId) || {};
    return {
      assignmentId,
      sectionId: a.sectionId,
      subjectId: section.subjectId,
      title: a.title || "(deleted assignment)",
      sectionName: section.sectionName || "(deleted section)",
      subjectName: subjectNames.get(section.subjectId) || "(deleted subject)",
      count,
    };
  });

  const leaveCounts = new Map();
  leaveSnap.forEach((d) => {
    const sectionId = d.data().sectionId;
    leaveCounts.set(sectionId, (leaveCounts.get(sectionId) || 0) + 1);
  });
  const leaves = [...leaveCounts.entries()].map(([sectionId, count]) => {
    const section = sections.get(sectionId) || {};
    return {
      sectionId,
      subjectId: section.subjectId,
      sectionName: section.sectionName || "(deleted section)",
      subjectName: subjectNames.get(section.subjectId) || "(deleted subject)",
      count,
    };
  });

  const totalCount =
    submissions.reduce((sum, s) => sum + s.count, 0) +
    leaves.reduce((sum, l) => sum + l.count, 0);

  return { submissions, leaves, totalCount };
}

async function refreshNotifications() {
  try {
    const data = await getNotifications();
    lastNotifications = { ...data, error: false };
  } catch (err) {
    lastNotifications = { ...lastNotifications, error: true };
  }
  const countEl = el("notif-count");
  countEl.textContent = lastNotifications.totalCount;
  countEl.classList.toggle("hidden", lastNotifications.totalCount === 0);
}
```

- [ ] **Step 2: Verify the file still parses as a valid ES module**

Run:
```bash
node --check js/teacher.js
```
Expected: no output, exit code 0 (syntax is valid — this doesn't run the module, just parses it, so it's safe despite the file's top-level Firebase imports).

- [ ] **Step 3: Commit**

```bash
git add js/teacher.js
git commit -m "Add getNotifications()/refreshNotifications() data layer for the notification bell"
```

---

### Task 4: Render dropdown, toggle, wire into init

**Files:**
- Modify: `js/teacher.js` — add render/toggle functions right after Task 3's `refreshNotifications()`.
- Modify: `js/teacher.js:923` (inside the `guardPage("teacher").then(...)` init block — exact line may have shifted after Task 3's insertion, locate by the `loadSubjects();` call inside that block).

**Interfaces:**
- Consumes: `lastNotifications` and `refreshNotifications()` (Task 3); `el(id)` helper.
- Produces: `function renderNotifDropdown()`, `function closeNotifDropdown()` — both consumed by Task 5 (navigation) and Task 6 (post-action hooks call `refreshNotifications()`, which doesn't itself re-render an *open* dropdown, so this task's bell-click handler is the only place `renderNotifDropdown()` gets called; that's intentional — see Task 6 note).

- [ ] **Step 1: Add render + toggle + outside-click-close**

Insert right after `refreshNotifications()` from Task 3:

```js
function closeNotifDropdown() {
  el("notif-dropdown").classList.add("hidden");
}

function renderNotifDropdown() {
  const { submissions, leaves, error } = lastNotifications;
  const dropdown = el("notif-dropdown");

  if (error) {
    dropdown.innerHTML = '<p class="muted" style="padding:0.5rem 0.75rem;">Couldn\'t load notifications.</p>';
    return;
  }
  if (submissions.length === 0 && leaves.length === 0) {
    dropdown.innerHTML = '<p class="muted" style="padding:0.5rem 0.75rem;">You\'re all caught up.</p>';
    return;
  }

  const submissionRows = submissions.map((s) => `
    <button class="notif-item" data-goto-assignment="${s.subjectId}|${s.sectionId}|${s.assignmentId}">
      ${s.title} <span class="muted">(${s.subjectName} &rsaquo; ${s.sectionName})</span> — ${s.count} pending
    </button>`).join("");
  const leaveRows = leaves.map((l) => `
    <button class="notif-item" data-goto-leave="${l.subjectId}|${l.sectionId}">
      ${l.subjectName} &rsaquo; ${l.sectionName} — ${l.count} leave request${l.count > 1 ? "s" : ""}
    </button>`).join("");

  dropdown.innerHTML =
    (submissions.length ? `<div class="notif-group-label">Pending submissions</div>${submissionRows}` : "") +
    (leaves.length ? `<div class="notif-group-label">Leave requests</div>${leaveRows}` : "");

  dropdown.querySelectorAll("[data-goto-assignment]").forEach((b) =>
    b.addEventListener("click", () => {
      const [subjectId, sectionId, assignmentId] = b.dataset.gotoAssignment.split("|");
      goToAssignment(subjectId, sectionId, assignmentId);
    }));
  dropdown.querySelectorAll("[data-goto-leave]").forEach((b) =>
    b.addEventListener("click", () => {
      const [subjectId, sectionId] = b.dataset.gotoLeave.split("|");
      goToLeaveRequests(subjectId, sectionId);
    }));
}

el("notif-bell").addEventListener("click", async (e) => {
  e.stopPropagation();
  const dropdown = el("notif-dropdown");
  if (!dropdown.classList.contains("hidden")) {
    closeNotifDropdown();
    return;
  }
  await refreshNotifications();
  renderNotifDropdown();
  dropdown.classList.remove("hidden");
});

document.addEventListener("click", (e) => {
  if (!e.target.closest("#notif-bell, #notif-dropdown")) closeNotifDropdown();
});
```

Note: this references `goToAssignment`/`goToLeaveRequests`, which don't exist until Task 5. That's fine — they're function declarations (hoisted), and both tasks land in the same file before it's ever loaded in a browser, so order of insertion within the file doesn't matter as long as both land before this plan's verification steps run. If you're executing Task 4 in isolation and want it to load standalone, temporarily stub:
```js
async function goToAssignment() { console.log("stub - implemented in Task 5"); }
async function goToLeaveRequests() { console.log("stub - implemented in Task 5"); }
```
then delete the stub once Task 5 lands. (If executing tasks back-to-back in one sitting, skip the stub — just proceed straight to Task 5.)

- [ ] **Step 2: Wire `refreshNotifications()` into the init block**

In `js/teacher.js`, find the `guardPage("teacher").then((user) => { ... })` block. It currently ends:
```js
  loadSubjects();
  show("view-subjects");
});
```
Change to:
```js
  loadSubjects();
  refreshNotifications();
  show("view-subjects");
});
```

- [ ] **Step 3: Verify the file still parses**

Run:
```bash
node --check js/teacher.js
```
Expected: no output, exit code 0.

- [ ] **Step 4: Commit**

```bash
git add js/teacher.js
git commit -m "Add notification dropdown rendering and bell toggle behavior"
```

---

### Task 5: Navigation (`goToAssignment`/`goToLeaveRequests`)

**Files:**
- Modify: `js/teacher.js` — add right after the functions from Task 4 (or replace the temporary stubs if you added them).

**Interfaces:**
- Consumes: `openSubject(subjectId)`, `openSection(sectionId)`, `openAssignment(assignmentId)`, `openEnrolled(sectionId)` (all pre-existing in `js/teacher.js`); `closeNotifDropdown()` (Task 4).
- Produces: `async function goToAssignment(subjectId, sectionId, assignmentId)`, `async function goToLeaveRequests(subjectId, sectionId)` — consumed by Task 4's `renderNotifDropdown()` click handlers (already wired in Task 4, calling these by name).

- [ ] **Step 1: Add the navigation functions**

```js
async function goToAssignment(subjectId, sectionId, assignmentId) {
  closeNotifDropdown();
  await openSubject(subjectId);
  await openSection(sectionId);
  await openAssignment(assignmentId);
}

async function goToLeaveRequests(subjectId, sectionId) {
  closeNotifDropdown();
  await openSubject(subjectId);
  await openSection(sectionId);
  await openEnrolled(sectionId);
}
```

If Task 4 used the temporary stub, delete the stub now and put these in its place (same names, same call sites already wired).

- [ ] **Step 2: Verify the file still parses**

Run:
```bash
node --check js/teacher.js
```
Expected: no output, exit code 0.

- [ ] **Step 3: End-to-end manual verification (first point in this plan where the full feature is testable)**

This is the first task where the whole click-through path exists, so this is where real browser verification starts. Requires `.claude/launch.json`'s `static` config (`python -m http.server 8420`) already present in this repo.

1. Start the static server preview (`preview_start` with `{name: "static"}` if using the Browser pane tool, or manually: `python -m http.server 8420` from the repo root).
2. Sign in as the teacher account in a real browser tab (this step needs a real Google account — the automated Browser pane can't complete OAuth, so do this part manually once and keep the tab open for the rest of this task).
3. Manually create test data if none exists: one subject → one section → one assignment, then submit + leave one submission `pending` (submit as a student in another tab/incognito), and flag one enrollment's `leaveRequested` (as that student, use "Request to leave" on their My Classes card).
4. Reload `teacher.html`. Confirm the bell shows a red badge with the correct total count without clicking anything.
5. Click the bell. Confirm the dropdown opens with a "Pending submissions" group (assignment title + subject/section context + count) and a "Leave requests" group (subject/section + count).
6. Click the pending-submission row. Confirm it lands on that assignment's submission list (not blank), and that the assignment context/title is correct.
7. Click the section's "Open" → then the section's Back button. Confirm it returns to the correct section view (not blank) — this validates that `goToAssignment()`'s full `openSubject → openSection → openAssignment` chain left `state.subjectId`/`state.sectionId` correctly set, unlike a shortcut straight to `openAssignment()` would have.
8. Repeat steps 5–7 for a leave-request row, confirming it lands on Enrolled Students for the right section and Back works.
9. Click the bell again with the dropdown open — confirm it closes. Open it again, then click anywhere outside it — confirm it closes without navigating.

Record the outcome in the task's commit message body (pass/fail per sub-step); if anything fails, fix before committing.

- [ ] **Step 4: Commit**

```bash
git add js/teacher.js
git commit -m "Add notification-bell navigation (jump to assignment/leave-requests view)"
```

---

### Task 6: Refresh after grading/leave-resolution + docs

**Files:**
- Modify: `js/teacher.js` (`openReview()`'s publish handler, `openEnrolled()`'s remove handler)
- Modify: `DESIGN_SYSTEM.md`
- Modify: `CLAUDE.md`
- Modify: `.claude/Skills/student-lms/SKILL.md`
- Modify: `SKILLS.md`

**Interfaces:**
- Consumes: `refreshNotifications()` (Task 3).
- Produces: nothing new consumed elsewhere — this is the last task.

- [ ] **Step 1: Refresh after publishing a grade**

In `js/teacher.js`, inside `openReview(submissionId)`, the publish button handler currently reads:
```js
  container.querySelector(`[data-publish]`).addEventListener("click", async () => {
    await updateDoc(ref, {
      finalGrade: {
        score: Number(el(`score-${submissionId}`).value) || 0,
        feedback: el(`feedback-${submissionId}`).value,
      },
      status: "published",
      publishedAt: Date.now(),
    });
    loadSubmissions();
  });
```
Change the last line to:
```js
    loadSubmissions();
    refreshNotifications();
```

- [ ] **Step 2: Refresh after resolving a leave request**

In `js/teacher.js`, inside `openEnrolled(onlySectionId)`, the remove-enrollment handler currently reads:
```js
  list.querySelectorAll("[data-remove-enrollment]").forEach((b) =>
    b.addEventListener("click", async () => {
      const wasRequested = b.dataset.leaveRequested === "true";
      const msg = wasRequested
        ? "Remove this student's enrollment? They requested to leave this class. This frees their roster name for someone else to claim, and they'd need to join again with the code."
        : "Remove this student's enrollment? This frees their roster name for someone else to claim, and they'd need to join again with the code.";
      const ok = confirm(msg);
      if (!ok) return;
      await deleteDoc(doc(db, "enrollments", b.dataset.removeEnrollment));
      openEnrolled(onlySectionId);
    }));
```
Change the last line to:
```js
      openEnrolled(onlySectionId);
      refreshNotifications();
```

Note: `refreshNotifications()` only updates the badge number — it does not re-render an already-open dropdown (per the design spec, the dropdown itself refreshes on open, not live). If the dropdown happens to be open when one of these hooks fires (unlikely — publishing/removing both happen from a different view than the dropdown), the badge count updates but the open dropdown's list doesn't change until it's closed and reopened. That's an accepted, documented tradeoff, not a bug — no `onSnapshot` listeners anywhere in this app.

- [ ] **Step 3: Verify the file still parses**

Run:
```bash
node --check js/teacher.js
```
Expected: no output, exit code 0.

- [ ] **Step 4: Manual verification of the refresh hooks**

Using the same signed-in teacher tab from Task 5:
1. Note the current bell badge count.
2. Publish a grade for the pending submission used in Task 5. Reopen the bell. Confirm the count decreased by 1 and that submission's assignment row either disappeared (if it was the last pending one for that assignment) or its count decreased.
3. Remove/resolve the leave-flagged enrollment used in Task 5. Reopen the bell. Confirm the count decreased by 1 and that section's leave-request row disappeared or its count decreased.

- [ ] **Step 5: Update `DESIGN_SYSTEM.md`**

Add a new pattern section (after the existing "## QR code (per-section join)" section, matching its style):
```markdown
## Notification bell (header)

```html
<div style="position:relative; display:inline-block;">
  <button class="secondary" id="notif-bell">&#128276;<span id="notif-count" class="notif-badge hidden">0</span></button>
  <div id="notif-dropdown" class="notif-dropdown hidden"></div>
</div>
```
Red circular `.notif-badge` overlaps the button's top-right corner (only shown when count > 0). `.notif-dropdown` is an absolute-positioned panel below-right of the button — the first dropdown-style component in the app, closes on an outside click or a second click on the bell. Rows are plain `button.notif-item` elements grouped under `.notif-group-label` headers; a group is omitted entirely when empty. See `CLAUDE.md`'s task map for the data/navigation functions behind it.
```

- [ ] **Step 6: Update `CLAUDE.md`'s task map**

Add a new row to the task-map table (near the "QR-code join" row added by the prior QR-join work):
```markdown
| Notification bell (header dropdown: pending submissions + leave requests, click to jump straight there) | `js/teacher.js`'s `getNotifications()`/`refreshNotifications()` (data), `renderNotifDropdown()`/`closeNotifDropdown()` (UI), `goToAssignment()`/`goToLeaveRequests()` (navigation — replays `openSubject → openSection → openAssignment/openEnrolled` so Back buttons and `state.subjectId` stay correct) + `teacher.html`'s `#notif-bell`/`#notif-count`/`#notif-dropdown` — refreshes on page load, on bell click, after publishing a grade, and after resolving a leave request (no real-time listeners, see limitations) |
```

- [ ] **Step 7: Update `.claude/Skills/student-lms/SKILL.md`**

Add one bullet to the existing quick-pointers list (near the pending-badge bullet):
```markdown
- Notification bell (header dropdown, click to jump to a pending submission or leave request) → `CLAUDE.md` task map's "Notification bell" row
```

- [ ] **Step 8: Update `SKILLS.md`**

Add a new dated section (matching the existing "QR-code join (added 2026-08)" / "Academic Clarity restyle (added 2026-08)" sections):
```markdown
## Notification bell (added 2026-08)

Header bell + dropdown, teacher-only. Click a row to jump straight to a
pending assignment's submissions or a section's leave-flagged enrollment:
- `js/teacher.js`: `getNotifications()`/`refreshNotifications()` (data), `renderNotifDropdown()` (UI), `goToAssignment()`/`goToLeaveRequests()` (navigation)
- `teacher.html`: `#notif-bell`/`#notif-count`/`#notif-dropdown`
- No real-time updates (app convention) — refreshes on load, on bell click, and right after grading/leave-resolution actions
```

- [ ] **Step 9: Commit**

```bash
git add js/teacher.js DESIGN_SYSTEM.md CLAUDE.md .claude/Skills/student-lms/SKILL.md SKILLS.md
git commit -m "Refresh notification bell after grading/leave-resolution, document the feature"
```

---

## Self-Review Notes

- **Spec coverage:** every section of `docs/superpowers/specs/2026-08-02-notification-bell-design.md` maps to a task — Data → Task 3, Navigation → Task 5, UI → Tasks 1–2 & 4, Toggle/outside-click-close → Task 4, Refresh triggers → Tasks 3/4 (init, on-open) & 6 (post-action), Error handling → Task 3/4 (`lastNotifications.error` → "Couldn't load notifications." message), Out of scope items are correctly not implemented anywhere in this plan.
- **Type/name consistency checked:** `getNotifications()` return shape (`{submissions, leaves, totalCount}`) matches what `refreshNotifications()`/`renderNotifDropdown()` destructure in Tasks 3–4; `goToAssignment(subjectId, sectionId, assignmentId)`/`goToLeaveRequests(subjectId, sectionId)` signatures in Task 5 match exactly what Task 4's `data-goto-assignment`/`data-goto-leave` click handlers call.
- **No placeholders** — every step has real, complete code; the one deliberate "temporary stub" option in Task 4 is explicitly scoped to isolated single-task execution and explicitly removed by Task 5.
