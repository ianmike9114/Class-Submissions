# Handoff: Class Submissions LMS

Read this first when you come back. Keep it short. Replace "Next" each session instead of piling up old lists.

## Now
- Last updated: 2026-11-24
- Branch: `main` (last commit 2026-11-18: Print chip on assignment rows, gemini.js cache-buster)
- Committed: **no**. 44 uncommitted changes on `main`, mostly the `LAC-Session-TLE/` rework (old files
  deleted, new numbered set untracked), plus `.claude/Skills/lac-session-docs`, `.claude/Skills/docx-layout-check/`,
  `.claude/launch.json`, `docs/design-notes/ios-app-plan.md` and this file.
- Open worktrees under `.claude/worktrees/` (11), some possibly stale: grader-lenient-rule, module-term-week,
  lms-app-issues-improvements, phase4-ux, sync-github-local, and others.
- State: web app and Android app live. iPhone app planned, not started.

## Next
1. Decide what to do with the uncommitted `LAC-Session-TLE/` changes on `main` (commit on a branch, or
   move them out of the LMS repo, since they aren't LMS code).
2. Commit `docs/design-notes/ios-app-plan.md` and this handoff.
3. Clean up merged or stale worktrees (`git worktree list`, check each branch before removing).
4. iPhone app: when ready, run the `orchestrator` skill on Phase 1 of `docs/design-notes/ios-app-plan.md`
   (branch `feat/ios-app`).

## Open questions for ian
- iPhone distribution after testing: school fee waiver, $99/year, or keep iPhone students on the PWA?
- Should LAC session documents live in this repo at all?

## Log
<!-- newest first, one or two lines per session -->
- 2026-11-25: Adopted the shadcn look on branch `feat/shadcn-look` (not committed, not deployed): style.css tokens + light/dark mode,
  `js/theme.js` toggle (teacher topbar, student header), Geist font, DESIGN_SYSTEM.md rewritten, css v63 / teacher.js v127 / sw v49.
  Smoke e2e pass; `quota-budget.test.js` fails to parse on main too (pre-existing). Next: ian reviews signed in, then commit + deploy.
- 2026-11-25: shadcn look prototype in `docs/design-notes/shadcn-prototype/` (open `index.html` through a local server): current vs shadcn-lite on the
  assignment review screen, sample data. ian to choose adopt, blend (navy + fonts) or keep. No live CSS changed. Global skill `shadcn-ui-expert` added.
- 2026-11-24: Wrote `docs/design-notes/ios-app-plan.md` (Capacitor iOS build, screenshot blocking,
  distribution options). Added the orchestrator skill and brief/spec/handoff templates globally. No code changes.
- 2026-11-18: Print chip on assignment rows; gemini.js cache-buster.
- 2026-11-16: Module Publisher and Auto-Grader agents, grader check-all mode, term/week from school calendar,
  "Needs your attention" box for students (#99 to #104).
