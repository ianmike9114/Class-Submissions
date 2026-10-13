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
| Student dashboard load | `js/student.js` `loadEverything()` | ~174: every assignment in the student's classes plus their own submissions |
| Student submit | submit form → `loadEverything()` reload | ~174 reads + 1 write |
| Teacher Home | `loadSubjects()`, `getNotifications()`, `getMissingWorkCounts()` | ~377, cached for the session |
| Grade one assignment | `loadSubmissions()` + publish | ~43 reads + 1 write per score |

**Reads are the bottleneck, not writes.** The biggest single cost is the
student dashboard reading *every* assignment and *every* own submission on
each load. Cutting that (for example, only the current term's assignments, or
caching between page loads) is the lever if the budget goes RED.

## Check against reality

These are estimates from code. Compare them monthly with **Firebase Console
→ Firestore → Usage** (reads/writes per day). If real usage differs, adjust
`assumptions` so the calculator matches.

Photo submissions don't change the read count, but each photo-heavy document
is large, which counts toward the **10 GiB/month** download limit. The teacher
photo-ZIP panel is the main consumer.
