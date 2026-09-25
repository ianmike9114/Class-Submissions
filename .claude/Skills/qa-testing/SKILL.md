---
name: qa-testing
description: How to run and write quality tests for the DepEd Student LMS — unit tests (Vitest, on pure JS), end-to-end/functional tests (Playwright against the local Firebase emulator), and a Spark-plan quota budget that stands in for load testing. Also documents the dev-only test harness (package.json, tests/, scripts/) that is NOT deployed, and the one-command cache-buster version bump. Use whenever the user wants to test, unit-test, functional-test, load-test, QA, or "quality inspect" the app; add or fix a test; set up CI; or bump asset versions so users don't get stale files.
---

# QA testing — DepEd Student LMS

This app is a **live-production, zero-cost (Firebase Spark) static site** with
**no build step** for the shipped code. The test tooling here is **dev-only**:
`package.json`, `tests/`, `scripts/`, `playwright.config.js` are ignored by
GitHub Pages, which serves the raw HTML/CSS/JS. Adding or running tests must
**never** change what gets deployed or introduce a runtime npm dependency.

## Hard rules (do not break)

- **Never load-test / e2e-test against production Firebase.** Emulator only,
  always. Production Spark has a hard daily quota (~50k reads / 20k writes); a
  test run against it can exhaust the quota and take the live site down for real
  teachers and students mid-day.
- **Source edits for testability are additive only** — add `export`, never
  change behavior. (Already done: `stripTopLevelPublic` in `js/runner.js`,
  `cellRef` in `js/class-record.js`.)
- No Firebase Storage / Cloud Functions, ever (breaks zero-cost).

## Test tiers

### 1. Unit (Vitest) — fast, offline, no Firebase

```bash
npm test          # one-shot
npm run test:watch
```

Covers **pure** functions only (no DOM, no live Firebase). Current suites in
`tests/unit/`:

- `embed.test.js` — `js/embed.js` link → embeddable-URL parsing
  (Drive/Docs/Slides/Sheets/YouTube/CodePen, plain-link fallback,
  `openInChromeButton` UA gate). Highest value: a silent break degrades every
  embed in the app.
- `runner.test.js` — `stripTopLevelPublic` (must strip `public class/interface/
  enum/record` but NEVER `public static`/`public void`) + `runJava`'s
  never-throws contract with a **mocked `fetch`** (no real Wandbox call).
- `class-record.test.js` — `loadWorkbook` row-walk must stop on the first
  non-string (`t !== "s"`) cell, to skip DepEd's trailing formula-`0` rows.
  Uses a stubbed `globalThis.XLSX`.

Anything importing `js/firebase-config.js` (transitively) initializes a live
Firebase app on import — keep unit tests on leaf modules that don't. Everything
Firebase/DOM-bound belongs in the e2e tier.

**Adding a unit test:** only for a pure function. If the logic you want to test
is buried inside a Firebase/DOM function (e.g. the grouping inside
`getNotifications()` in `js/teacher.js`), extract it to a pure helper + `export`
it first (additive), then test the helper.

### 2. End-to-end / functional (Playwright + emulator)

```bash
npm run emu       # shell 1: Firestore + Auth emulator
npm run e2e       # shell 2: Playwright against http://localhost:8420
```

Specs in `tests/e2e/` drive the real pages at the repo's documented preview
(`python -m http.server 8420`) with Firebase pointed at the **emulator**. Core
flows that must never break: student joins by code → submits a link → pending;
teacher grades → publishes → student sees score; role routing sends teacher vs
student to the right page. Auth uses the emulator's test-token sign-in (the real
Google Identity widget can't run headless). Confirm during a run that the
Firebase console shows **no** new production reads/writes.

### 3. "Load" → Spark quota budget (the real deploy-safety artifact)

A local emulator has **no quotas**, so it cannot validate Spark limits. What
protects a Spark deploy is a **reads/writes-per-session budget**, not a load
generator. See `tests/load/quota-budget.md`: it counts Firestore ops per key
session (student/teacher dashboard load, `getNotifications()` fan-out, submit,
grade) × realistic concurrent users vs the 50k read / 20k write daily cap.
Pair with the `deployment-critic` skill for the full read-load analysis.
An optional emulator-only concurrency smoke (`tests/load/concurrency.mjs`) just
confirms nothing races under parallel ops — it is **never** allowed to target
production.

## Cache maintenance (NOT "clear cache every session")

Literally clearing the cache each session is an anti-pattern here — it kills the
PWA offline shell and re-downloads every asset on mobile data. The app already
does the right thing: `sw.js` is **network-first** (a reachable network always
wins, so a fresh deploy is never hidden) and its `activate` handler purges old
caches whenever `CACHE_NAME` bumps. The only real gap is remembering to bump
versions on every deploy. Use:

```bash
npm run bump      # scripts/bump-version.mjs
```

It advances the `?v=N` on `css/style.css`, `js/teacher.js`, `js/student.js`
across all three HTML files **and** the `CACHE_NAME` in `sw.js` together, so a
deploy can never ship a half-bumped set (the manual foot-gun CLAUDE.md warns
about). Run it as part of shipping any change to those files.

## CI (optional)

`.github/workflows/test.yml` (if present) runs `npm test` on push/PR; the
emulator-backed e2e tier can run in CI via `firebase emulators:exec`. Free on
GitHub at this scale.

## "Can we download an expert agent for each task?"

No marketplace — this skill **is** the durable expert; it auto-routes future
sessions to the right tier and rules. Optional custom subagents under
`.claude/agents/` (unit / e2e / quota) can be added if the user specifically
wants agents, but the skill already covers the workflow.
