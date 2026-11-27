# Design: .NET (Term 1) and Java (Term 2) Code Lab on the Class Submissions LMS

## Context
ian teaches the G12 Tech-Pro electives Computer Programming (.NET Technology) in Term 1 and
Computer Programming (Java) in Term 2 (same learners, 2-term setup). Both DepEd BOWs (June 19, 2026)
run Weeks 1-10. Learners use school laptops for big builds and phones for activities.
Goal: no separate app. Extend the existing LMS so phone activities run in the browser, ready
activities per BOW week can be posted in one click, and big laptop projects (ASP.NET MVC, Swing)
have a proper submission. Stays on Firebase Spark, no Storage, no Cloud Functions.

Decided with ian: Approach 1 (extend LMS); priorities = Code + Run on phone, Activity Bank per BOW,
Project submissions (no auto-check of outputs). Build .NET pieces first.

## Coverage map
| Term | BOW weeks | Topic | Mode |
|---|---|---|---|
| T1 .NET | 1-3 | HTML, CSS | `web` live preview (phone) |
| T1 .NET | 3-5 | JavaScript, DOM | `web` live preview + console panel (phone) |
| T1 .NET | 5-7 | C# console, OOP, file I/O | `csharp` Run via Wandbox (phone) |
| T1 .NET | 8-10 | ASP.NET MVC, DB, Web API, web-to-app, costing | `project` (laptop) / link |
| T2 Java | 1-6 | basics to threads | `java` Run (exists) |
| T2 Java | 7-8 | Swing GUI | `project` (laptop) |
| T2 Java | 9-10 | business plan, pitch, GUI design | link (exists) |

## Phase 1 (Term 1, .NET) - build now
1. **Language picker on Code assignments** (`js/teacher.js` add/edit assignment form): new
   assignment fields `codeLang` (`java` default for old docs | `csharp` | `web`) and optional
   `starterCode`. Old assignments without `codeLang` behave exactly as today (Java).
   Every add/edit path keeps calling `touchSection()` / `invalidateStructure()`.
2. **C# Run** (`js/runner.js`): generalize to `runCode(lang, source, stdin)`; keep `runJava()`
   as a wrapper. C# uses Wandbox's mono compiler (confirm exact name from
   `https://wandbox.org/api/list.json` at build time). Same friendly-failure behavior.
3. **Live web preview** (new `js/webpreview.js`): HTML/CSS/JS in one textarea (or 3 tabs),
   rendered in `<iframe sandbox="allow-scripts" srcdoc=...>` - NO `allow-same-origin`, so learner JS
   cannot reach the Firebase session. Small console panel catches `console.log`/errors via
   postMessage. Used on the student submit form and the teacher review card. Check the
   report-only CSP in `vercel.json` does not flag srcdoc frames.
4. **Student submit form** (`js/student.js` `renderSubmitForm`): label, placeholder, file accept
   (`.cs`, `.html`) and Run/Preview button follow `codeLang`; textarea prefilled with
   `starterCode` on first submit. Code still saved in existing `code`/`codeOutput` fields.
5. **Project submission** (new assignment type `project`): repo/Drive link (existing `link`),
   demo video link (new field `demoLink`, YouTube/Drive), screenshots (existing photo pages).
   `firestore.rules`: add `demoLink` to both student `hasOnly()` lists (create ~line 171,
   update ~line 212) -> **`firebase deploy --only firestore:rules`**.
6. **Activity Bank** (new `data/activity-bank/dotnet.json`, teacher UI in add-assignment flow):
   entries `{subject, term, week, competency (verbatim BOW), title, type, codeLang,
   instructions, starterCode, points, group: "WW"|"PT"}`. Teacher picks week -> activity ->
   it prefills the normal add-assignment form (teacher can edit, then save through the
   existing add path). Content: 1 activity per competency for .NET weeks 1-10 plus the 3
   suggested PTs, drafted from the BOW, humanizer pass, plain English, ian reviews before use.
   Static JSON loaded with fetch; no Firestore reads.

## Phase 2 (before Term 2, Java)
7. `data/activity-bank/java.json` for Java weeks 1-10 + PTs (Swing weeks use `project`).
8. Java starter code for Scanner activities; confirm Wandbox file I/O + threads demos run.

## Docs and shipping rules
- New `docs/design-notes/code-lab.md` (languages, sandbox rule, Wandbox dependency, bank format)
  + row in CLAUDE.md design-notes table; update `.claude/Skills/student-lms/SKILL.md` task map.
- Bump `?v=` for every changed CSS/JS in every HTML file; `gemini.js`/`auth.js`/`quiz.js` own `?v=`.
- This file is the approved spec (2026-11-27).
- Implementation runs on Sonnet sessions/subagents (orchestrator skill: tickets 1-6),
  after budget-guard popup. Non-destructive: old Java assignments/submissions unchanged.

## Verification
- `npm test`: unit tests for `runCode` lang mapping, `stripTopLevelPublic`, bank JSON schema
  (every entry has week/competency/type; competencies match BOW text).
- `npm run test:rules`: student can set `demoLink`, cannot set other new fields.
- `npm run e2e:flows` on emulators: teacher posts a bank activity (csharp + web + project),
  student submits from a 375px mobile viewport, Run/Preview shows output, teacher sees it.
- Manual on `python -m http.server 8420`: iframe sandbox check (learner JS
  `parent.document` throws), C# `Console.ReadLine` with stdin, old Java assignment still runs.
- slop-critic pass before calling it done; `npm run e2e:prod` after deploy.
