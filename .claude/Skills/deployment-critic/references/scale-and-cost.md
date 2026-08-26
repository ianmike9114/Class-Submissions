# Scale + free-tier cost (primary axis)

This is the axis most likely to produce a **BLOCKER**. On the free **Spark**
plan there is no billing — the app doesn't cost money, it *stops working* when
a daily quota is hit. Reads/writes start returning `resource-exhausted` and the
UI silently shows empty or fails to save until the quota resets (midnight
Pacific). At 30 teachers / 600 students that is a real, daily risk.

## Spark plan quotas (hard ceilings, per day unless noted)

| Resource | Free ceiling | Notes |
|----------|-------------|-------|
| Document **reads** | **50,000 / day** | 1 read billed **per document returned** by a query (empty result = 0). This is the binding constraint. |
| Document **writes** | **20,000 / day** | create + update each = 1 write. |
| Document **deletes** | **20,000 / day** | cascade deletes burn these fast. |
| Stored data | **1 GiB total** | no Firestore auto-cleanup. |
| **Doc size** | **1 MiB / document** | hard per-doc cap — photo submissions ride here. |
| Firebase **Storage** | **not available** | Spark can't enable it without Blaze. Deliberate constraint. |
| Cloud **Functions** | **not available** | same. Don't propose server-side aggregation. |

A query that returns N docs costs **N reads**, not 1. So "one query" that
scans the whole account is not cheap — it's as expensive as the account is big.

## Measured read-load map (verify against live code — lines drift)

Billing rule: **reads = documents returned**, summed across every query an
action fires.

### Student opens `student.html`
Entry: `guardPage("student")` → `applyPendingInvites()` → `loadEverything()`.

| Function | Where | Reads |
|----------|-------|-------|
| `applyPendingInvites()` | `js/student.js` (~94-113) | usually 0 (invites query empty) |
| `loadEverything()` enrollments | `js/student.js` (~238-240) | **E** (E = classes joined) |
| `loadEverything()` assignments | `js/student.js` (~316-318) | **A** (all assignments across sections) |
| `loadEverything()` submissions **N+1** | `js/student.js` (~336-343) | **up to A** — `Promise.all` fires one `submissions` query *per assignment* |

**Total ≈ E + 2A reads per open.** Example 6 classes × ~5 assignments (A≈30)
→ ≈ 65 reads. Grows with assignment count. **The N+1 is the fixable core:** all
of a student's submissions are already reachable by a single
`submissions where studentUID == <uid>` query — collapsing the per-assignment
loop into that one query drops `2A` to `A + (their submissions)`.

### Teacher opens `teacher.html`
Entry: `guardPage("teacher")` → `refreshNotifications()` → `restoreNavState()`
(→ `loadSubjects()` on a fresh load) (+ admin extras).

| Function | Where | Reads |
|----------|-------|-------|
| `getNotifications()` — **7 whole-account queries** | `js/teacher.js` (~492-501) | S + Sec + A + P(pending subs) + L(leave) + J(new joins) + R(resubmit) |
| `loadSubjects()` | `js/teacher.js` (~838-847) | S |
| `getPendingCounts()` (called inside loadSubjects) | `js/teacher.js` (~254-259) | Sec + A + P **again** |
| `getLeaveRequestCounts()` | `js/teacher.js` (~283-287) | Sec + L **again** |
| admin only: `loadTeachers()` + `renderViewAsPicker()` | `js/teacher.js` (~3208, ~3242) | +2×T |

**Landing total ≈ 2S + 3·Sec + 2A + 2P + 2L + J + R.** subjects/sections/
assignments/pending are each re-scanned **2–3×** on one page load. Example
S=8, Sec=16, A=120, P=20 → **≈ 350 reads just to land.**

### Deeper navigation (multipliers — flag these)

| Action | Where | Cost |
|--------|-------|------|
| `getEnrollmentNotRespondingOverview()` — **worst N+1** | `js/teacher.js` (~739-816) | scales as **subjects × sections × assignments** (nested submissions query per assignment). Fires from Master Lists view. |
| `openSubject` → `loadSections()` | `js/teacher.js` (~1066-1070) | re-runs `getPendingCounts` (3 scans) + `getLeaveRequestCounts` (2) + `getPendingInvites` + `getMasterLists` — **whole-account rollups again, per subject opened** |
| `openSection` → `loadAssignments()` | `js/teacher.js` (~1511-1513) | + another full `getPendingCounts` (3 scans) |
| every mutation → `refreshNotifications()` | `js/teacher.js` (~2348, ~2475, ~2498, ~1404) | re-fires the 7-query `getNotifications` scan after **each** publish / grade / leave-resolve / redo |

A single teacher grading a batch can therefore fire the ~168-read notification
scan dozens of times in a session.

## Scale-math worksheet

```
teacher_reads/day  ≈ teachers × opens_per_teacher × avg_reads_per_action
student_reads/day  ≈ students × opens_per_student × (E + 2A)
total = teacher_reads + student_reads   →  compare to 50,000
```

Worked default (30 / 600):
- Teachers: 30 × ~10 actions/day × ~200 reads ≈ **60,000**
- Students: 600 × ~1.5 opens × ~65 ≈ **58,500**
- **Total ≈ 118,000 reads/day vs 50,000 cap → NO-GO.**

Even halving every assumption lands near/over the cap. Treat read quota as the
headline blocker until the duplicate scans and N+1s are removed.

## Zero-budget mitigations to recommend (all Spark-legal)

1. **Kill the student N+1** (`js/student.js` ~336-343): replace per-assignment
   submission queries with one `where studentUID ==` query, join client-side.
   Biggest single student-side win.
2. **Dedupe teacher landing scans.** `getNotifications()` and `loadSubjects()`
   independently scan subjects/sections/assignments/pending. Fetch each
   collection **once** per load and derive all badges/counts client-side from
   that single result set.
3. **`getCountFromServer()` for pure counts.** Badge numbers (pending, leave,
   joins) only need a *count*, not the docs. Aggregation queries bill **1 read
   per ≤1000 docs scanned**, not per doc — huge cut for notification badges.
   Spark-supported, no Functions needed.
4. **Session cache.** Cache subjects/sections/assignments in memory (or
   `localStorage`) for the session so re-opening a subject/section doesn't
   re-scan the whole account each time.
5. **Don't re-fire full `refreshNotifications()` after every mutation** — update
   the one affected badge locally, or debounce.
6. **`onSnapshot` only where it *lowers* total reads** (a listener that
   replaces repeated polling), never as a always-on live feed — a naive
   listener over a big collection can *increase* reads.
7. **Storage projection.** Photo submissions live inside Firestore docs (no
   Storage). `MAX_PHOTOS`=10 × `PER_PHOTO_MAX_LEN`≈100k chars ≈ up to ~1 MiB
   per submission doc. 600 students × several photo assignments → estimate total
   bytes against the **1 GiB** stored-data ceiling and the **1 MiB/doc** cap;
   flag if a dense-photo assignment could push a single doc past 1 MiB (write
   fails outright).

## What to put in the report

- The read-quota overflow as a **BLOCKER** with the worked daily-reads number
  vs 50k, citing the student N+1 (`js/student.js` ~336-343) and the teacher
  duplicate scans (`js/teacher.js` ~492-501 / ~838-847).
- The Master-Lists S×Sec×A N+1 (`~739-816`) as **HIGH** (not on landing path,
  but blows quota when used).
- Write/delete budgets only if the target implies bulk writes near 20k/day
  (e.g. cascade-delete of a big subject, or mass invite generation).
- Storage/doc-size as **HIGH** or **MED** depending on photo-assignment usage.
