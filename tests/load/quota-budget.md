# Spark quota budget (the "load test" for this app)

The free Firebase Spark plan doesn't slow down under load. It **stops**: after
**50,000 document reads** or **20,000 writes** in a day (reset at midnight
Pacific time, about 3–4 PM Philippine time), every read or write fails until
the reset. So the useful "load test" is a **budget**: how many reads and
writes a realistic day costs, and how many students fit before the limit.

A load generator against production would burn the real quota and take the
site down. Against the emulator it proves nothing, because the emulator has
no quota. Neither is used.

## Run it

```bash
npm run budget -- --students 300 --teachers 10
npm run budget -- --students 300 --teachers 10 --studentSessionsPerDay 1 --assignmentsPerClass 15
```

The output shows reads and writes per action, per student and per teacher
per day, the daily totals against the limits, and **GREEN** (<50%),
**YELLOW** (50–80%) or **RED** (>80%). It also prints **"max active
students/day"**. The command exits with code 1 on RED.

## Where the numbers come from

`tests/load/session-costs.json` holds one formula per action, each traced to
the code (`where`). Firestore bills **1 read per document returned** (at
least 1 per query), and `count()` costs 1 read per up to 1,000 index
entries. The defaults (`assumptions`) are typical class sizes; override any
of them with `--name value`.

| Action | Code | Reads (default assumptions) |
|---|---|---|
| Student dashboard load | `js/student.js` `loadEverything()` + `js/assignment-cache.js` | ~23: enrollments + sections, plus subjects/settings on a 30-min miss, only the assignments a teacher added/edited (`assignmentDelta()`), own submissions only for sections the teacher graded since |
| Student submit | submit form → `loadEverything()` reload | ~13 reads + 2 writes (submission + own `subsVersion` stamp) |
| Teacher Home visit | `loadSubjects()`, `getNotifications()` | ~46 with warm caches (term settings, subjects, inbox) |
| Teacher structure refresh | `cachedOwnerDocs` structure keys + `computeMissingWorkCounts()` | ~147: first visit, then every 10-15 min or after own edits |
| Grade one assignment | `loadSubmissions()` (memoized) + `openReview()` + publish | ~123 reads + 1 write per score (40 students) |

**How the student side stays cheap.** Before the assignment cache, every
dashboard load and every reload after an action read *every* assignment and
*every* submission the student ever made (~174 reads, ~72 students/day). Now:

- Each class's assignments are remembered in the student's browser
  (`lms.asgCache.<uid>`) and re-read only when `sections/{id}.assignmentsVersion`
  changes. `js/teacher.js` `touchSection()` stamps it on every assignment
  add/edit/delete, with a 6-hour TTL as a safety net.
- Only submissions for the assignments on screen are read (this term), not
  past terms.
- After an action, the class/term lookup is reused for 10 minutes.

With 10 teachers the free plan now fits about **200 active students/day**;
**Teacher side.** Before, the teacher read cache lived only 3 seconds, so
*every* Home visit re-read all assignments, every enrollment and one count()
per past-due assignment (~377 reads), and *every* Publish/Return re-read the
whole class's submissions plus all notifications (~200 reads per score - about
8,000 to grade a class of 40). Now subjects/sections/assignments are cached 10
minutes (`invalidateStructure()` on the teacher's own edits), the missing-work
badge uses count() headcounts for the shown subjects only and is cached 15
minutes, and Publish/Return re-render and update the bell from memory. A
teacher's day (10 Home visits, 2 classes graded) is ~1,150 reads instead of
roughly 20,000.

**Own submissions are cached too.** Each section's submissions live in
`lms.subCache.<uid>` and are re-read only when that enrollment's
`subsVersion` changes - stamped by the teacher's `touchStudentSubs()` on
publish/return/redo/delete/retake and by the student's own writes (so their
other devices refresh) - or after 1 hour. Photo-heavy sections that would
overflow localStorage (`fitToBudget()`) simply stay uncached. Subjects + term
settings are remembered for 30 minutes. About 104 reads per student per day,
~360 students/day with 10 teachers.

**Only changed assignments are re-read.** `sections/{id}.assignmentVersions`
maps every assignment id to a timestamp (`touchSection(sectionId, { changed,
deleted })` on each write, backfilled once per section by
`backfillAssignmentVersions()` when the teacher opens it). Students re-read
just the ids whose timestamp moved (`documentId() in` query) and drop deleted
ones, instead of the whole class. About 60 reads per student per day, ~620
students/day with 10 teachers.

## Check against reality

These are estimates from code. Compare them monthly with **Firebase Console
→ Firestore → Usage** (reads/writes per day). If real usage differs, adjust
`assumptions` so the calculator matches.

Photo submissions don't change the read count, but each photo-heavy document
is large, which counts toward the **10 GiB/month** download limit. The teacher
photo-ZIP panel is the main consumer.
