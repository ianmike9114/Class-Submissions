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

### 2a. firestore.rules integration (Firestore emulator) — the real functional/security layer

```bash
npm run test:rules   # firebase emulators:exec wraps vitest; starts the emulator
```

`tests/rules/firestore.rules.test.js` runs the **actual `firestore.rules`**
against the Firestore emulator via `@firebase/rules-unit-testing`
(`assertSucceeds`/`assertFails`). Because rules ARE the access control, this is
the highest-value functional coverage and it is deterministic (no DOM). It
verifies: multi-teacher isolation (teacher B can't read teacher A's
submissions), owner-stamped creates, student self-scope (own uid only,
field-limited edits, no score tampering, no edits once published), self-enroll,
and the super-admin/teachers allowlist. Talks **only** to the local emulator.
`assertFails` cases log `PERMISSION_DENIED` to stderr on success — that's the
rule correctly rejecting, not a failure. Config: `vitest.rules.config.js`
(serial, since tests share one emulator + `clearFirestore`).

### 2b. Page smoke (Playwright)

```bash
npm run e2e                    # bundled Chromium (CI: npx playwright install chromium)
PW_CHANNEL=msedge npm run e2e  # use an installed system browser if the bundled download is blocked
```

`tests/e2e/smoke.spec.js` loads the three real pages at the repo's documented
preview (`python -m http.server 8420`, started by Playwright's `webServer`) on
desktop + mobile viewports and asserts the modules parse/run with no uncaught
errors and the login page reaches its signed-out state. It **aborts all requests
to the production Firebase data/auth backends** (`firestore.googleapis.com`,
`identitytoolkit`, `securetoken`), so a run can never touch real data. Set
`PW_CHANNEL` (msedge/chrome) when `npx playwright install` can't fetch the
bundled browser.

**Full DOM click-through of the dashboards is NOT built** (join→submit→grade→
publish through the UI): the app has no `data-testid` hooks, so such tests would
be brittle. Add hooks + flows incrementally; the rules suite already covers the
underlying behavior. If you drive real sign-in, use the **Auth emulator**
(`npm run emu`) — the Google Identity widget can't run headless, and rules key
off email/uid not `sign_in_provider`, so an emulator email/password user
exercises the same role routing.

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
