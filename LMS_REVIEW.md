# LMS Review: Current State, Gaps, and Suggestions

A candid review of the Class Submissions app as of 2026-08-06, written to
be read occasionally (not loaded into every Claude Code session — see
`CLAUDE.md` for that). Grounded in the actual code and rules, not
generic advice.

## Strengths

- **Zero-cost architecture actually holds up.** Auth + Firestore only,
  no Storage, no Cloud Functions, verified nowhere in the code tries to
  sneak either back in. This is a real constraint that's been respected
  consistently across a long feature history (see `CLAUDE.md`'s "Known
  v1 limitations" — every entry there is a deliberate trade-off, not an
  accident).
- **`firestore.rules` is well-reasoned, not just permissive-by-default.**
  Every `match` block has a comment explaining *why* a given read/write
  is scoped the way it is (e.g. `sections`/`assignments` staying
  signed-in-readable because students resolve them by join code before
  they know the owner). That's rare — most small apps either lock
  everything down and break features, or leave rules wide open.
  Two intentional gaps are called out explicitly in `CLAUDE.md` rather
  than hidden.
- **Destructive actions are guarded proportionally to their blast
  radius.** Cascade deletes (subject/section/assignment) require typing
  the exact name; single-doc removals (one enrollment, one teacher's
  access) stay a plain `confirm()`. That's a real design decision, not
  boilerplate caution copy-pasted everywhere.
- **The app tracks its own technical debt.** `CLAUDE.md`'s "Known v1
  limitations" section is unusually thorough — every shortcut is
  documented with the reasoning behind it, which is exactly what lets a
  fresh Claude Code session (or a future contributor) avoid re-litigating
  settled decisions.

## Gaps and risks

Ranked roughly by how much they'd actually hurt if they bit:

1. **`README.md` is stale against the current grading model.** It still
   describes "you run an AI rubric-check that drafts a score + feedback"
   as the default flow and references a "2-criterion rubric" test step.
   The real default today is single raw-score grading with AI check
   hidden (`AI_CHECK_ENABLED = false`). Anyone following the README to
   onboard a second teacher would be confused by step 6's rubric
   instructions. **Cheap fix, worth doing soon.**
2. **No backup path for grade data.** The Class Record `.xlsx` export was
   deliberately removed (teacher finalizes grades themselves elsewhere —
   a reasonable call), but that also means Firestore is now the *only*
   copy of every score ever entered, with no scheduled export. If the
   super admin's Google account were ever locked out or the Firebase
   project deleted by mistake, there's no recovery path.
3. **No `firestore.indexes.json` committed.** Every compound query in
   the app happens to work with Firestore's automatic single-field
   indexes today, but the first time a query needs a composite index,
   it fails at runtime with a console-link error — and nothing catches
   that before it happens in front of a live student or teacher.
4. **`ADMIN_EMAIL` is hand-duplicated in 2 files with no check that they
   match.** `firestore.rules` and `js/firebase-config.js` both hardcode
   it (documented in `CLAUDE.md`, deliberate — no shared config in a
   static site). A typo in either file during a future edit wouldn't
   throw an error; it would just silently break admin access for one of
   the two contexts (rules vs. UI routing) until someone noticed.
5. **No error visibility beyond `alert()`.** If a student hits a
   Firestore permission error or a malformed query, they see a browser
   alert and the teacher never finds out unless the student happens to
   mention it. There's no lightweight signal (even a simple logged-doc)
   that surfaces "something broke" to the person who could fix it.
6. **Zero automated verification.** Acceptable at solo-teacher scale and
   consistent with the "no build step" philosophy, but every change
   currently gets verified by hand in a browser each session (see the
   verification steps in recent commits) — there's no repeatable script
   to rerun, so regressions in an untouched feature could slip through
   silently.
7. **Accessibility hasn't had an explicit pass.** `DESIGN_SYSTEM.md`
   defines visual tokens (color, type, spacing) but there's no stated
   contrast-ratio check or systematic `aria-label` coverage beyond the
   handful spotted in the code (e.g. the photo lightbox's close button).

## Feature suggestions

All respect the existing zero-cost/no-Storage/no-Functions constraint —
nothing here needs a paid plan or a backend.

- **Extend the "Not responding" overview into a light analytics view.**
  It already computes per-section submission counts (`js/teacher.js`'s
  `getEnrollmentNotRespondingOverview()`) — a natural next step is an
  average-score-per-assignment or submission-rate-over-time summary
  reusing the same Records grid data, no new infrastructure needed.
- **PWA app-shell caching.** A small service worker caching `css/`,
  `js/`, and the three HTML shells would make repeat visits load
  instantly and partially work offline — pure static-site technique,
  works fine on GitHub Pages, no Firebase Hosting required.
- **Self-host the two Google Fonts.** Cuts one more render-blocking
  external request per page load. Trade-off: adds ~200-400KB to the repo
  once, not per page load — worth it if load speed on slow connections
  matters more than repo size.
- **A repeatable manual QA checklist** (plain markdown, not a test
  runner — respects "no CI/no build step") covering the golden-path
  flows (sign-in, join, submit, grade, publish) so verification isn't
  reinvented from scratch each session.
- **Minimal client-side error logging.** A `window.onerror` handler that
  writes to a small owner-scoped `clientErrors` Firestore collection
  (rules already have the pattern for owner-scoped collections) would
  give the teacher visibility into problems students hit silently today
  — zero-cost, no third-party service.
- **README refresh** to match the single-score grading model (see gap
  #1 above) — this one's nearly free.

## Website optimization — status

Done in the most recent pass (2026-08-06):
- Lazy-loaded `xlsx`/`qrcodejs`/`jszip`/`docx` — previously ~950KB+ of
  unconditional blocking script on every `teacher.html` load, now loaded
  only on first actual use of roster-upload/QR/ZIP/report features.
- Parallelized two sequential N+1 Firestore read chains
  (`getEnrollmentNotRespondingOverview()` in `js/teacher.js`,
  `loadEverything()` in `js/student.js`) with `Promise.all` — same read
  count, far less wall-clock wait.
- Fixed mobile horizontal-scroll overflow for every `.records-grid`
  table app-wide (previously only the Records grid itself had a scroll
  wrapper; 7 other tables — Enrolled Students, Master Lists, Activities
  summary, etc. — didn't).
- Bumped two under-sized mobile touch targets (`.danger.icon`,
  `.photo-thumb` delete button) from ~20px to 32px.

Next candidates, lower priority/impact than what's already shipped:
- Self-host fonts (see Feature suggestions above).
- Cache `getPendingCounts()`/`getLeaveRequestCounts()` results for a
  short TTL within a session instead of re-fetching on every navigation
  — these run on nearly every view change today.
- Add `firestore.indexes.json` proactively (see gap #3).

## Claude Code usage optimization

See the new `session-efficiency` skill
(`.claude/skills/session-efficiency/SKILL.md`) for the durable version
of this. Headline points:
- `CLAUDE.md` and `.claude/Skills/student-lms/SKILL.md` are both
  compressed already (2026-08-06) — same technical content, ~8-12%
  fewer words, since both load into every session automatically.
- Broad audits (performance, mobile, security) are cheaper run as
  background `Agent` calls than inline in the main conversation — the
  full research transcript stays out of the main context, only the
  summary comes back.
- Claude has no live access to this app's actual Firestore data or a
  signed-in browser session — questions like "did X sync for real"
  can't be answered from here; verify in the live app instead.
