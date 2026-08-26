# Reliability + data integrity

At single-class scale bugs here are rare annoyances. At 30 teachers / 600
students, concurrent actions and accumulated data make them routine. Focus on
data loss, orphans, races, and how the app behaves when Firestore says no.

## Checklist

1. **Cascade deletes.** `cascadeDeleteSubject()` / `cascadeDeleteSection()` /
   `cascadeDeleteAssignment()` (shared `deleteWhere()`) walk subject → sections
   → assignments → submissions + enrollments. Verify **no branch is missed**
   (an orphaned submission whose parent assignment is gone still counts toward
   storage and can crash a render that assumes a parent). Also: a big subject
   delete can fire hundreds of deletes — check it can't blow the **20k
   deletes/day** budget, and that a mid-cascade quota/network failure doesn't
   leave a **half-deleted tree** (Firestore has no multi-doc transaction across
   this many docs here). Partial-cascade recovery = **HIGH**.

2. **Enrollment races.** Student self-enroll (`enroll()`, `js/student.js`) —
   can a double-tap or invite + join-code both firing create **duplicate
   enrollments** for the same student+section? `applyPendingInvites()` runs
   right before `loadEverything()` and deletes the invite whether or not it
   enrolled — confirm it can't race with a manual join to double-enroll. Dupes
   inflate rosters and every per-enrollment read. **MED–HIGH**.

3. **Invite double-fire.** `applyPendingInvites()` deletes the invite doc after
   consuming (so a stale invite can't re-fire) — confirm the delete happens even
   when enrollment was a no-op, else a lingering invite re-enrolls on every
   login. **MED**.

4. **Stale reads (no `onSnapshot`).** Lists refresh on load/action, not live.
   Two teachers (or teacher + admin "view as") acting on the same section see
   stale state until reload; a student's just-published grade won't appear until
   they reopen. Acceptable by design at small scale — at 600 students judge
   whether any workflow *depends* on liveness (e.g. teacher grades, student
   refreshes expecting to see it). Usually **MED**, document as known.

5. **Error handling on quota/offline.** When Firestore returns
   `resource-exhausted` (quota hit — see scale axis) or the network drops, does
   the UI show a clear message or silently render empty? A blank dashboard that
   looks like "no data / lost my work" to a teacher is a support nightmare at
   scale. Check load functions and the submit path (`js/student.js` ~864-884)
   catch and surface errors. Silent-empty on quota = **HIGH** (compounds the
   scale blocker with user panic).

6. **1 MiB doc overflow.** Photo submissions embed compressed images in the
   submission doc (`compressImage()`, `PER_PHOTO_MAX_LEN`≈100k × up to
   `MAX_PHOTOS`=10). Confirm the compression guarantees the *whole* doc
   (photos + other fields) stays < 1 MiB — a dense-handwriting photo that
   compresses poorly, ×10, plus fields, could exceed it and the **write fails
   outright**, losing the student's submission. Verify there's a guard/fallback
   (Drive-link path) and a clear error, not a silent failure. **HIGH**.

7. **Idempotency of grade publish / resubmit.** Re-clicking publish or
   redo-request shouldn't corrupt `finalGrade` or spawn duplicate state. Spot
   check the grading handlers.

## Severity guidance

- Silent data loss (failed submission write, half-cascade orphan, lost grade):
  **HIGH**.
- Duplicate enrollments, invite re-fire: **MED–HIGH** by frequency.
- Staleness from no live listeners: **MED**, usually document-as-known.
