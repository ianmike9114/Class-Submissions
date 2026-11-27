# Code Lab (.NET / Java)

Deliberate design decisions and known limits. Moved out of `CLAUDE.md` so they load only
when needed. Read before editing this area; add new notes for this area here.

- **One language table: `js/code-langs.js`.** `CODE_LANGS` holds every per-language
  fact (label, highlight name, file `accept`, `mode` run vs preview, Wandbox
  `compiler`, placeholder, hint). `langOf(assignment)` falls back to `"java"` when
  `codeLang` is missing, so every older Code assignment behaves exactly as before.
  Student form, teacher review card and runner all read this table; add a language
  here, not in three places.
- **C# runs on Wandbox `mono-6.12.0.199`, not dotnetcore.** `dotnetcore-8.0.402` on
  Wandbox fails every build with "File size limit exceeded" (checked 2026-11-27);
  mono builds fine and supports `Console.ReadLine` (stdin) and `System.IO` files.
  Mono has **no C# 9 top-level statements**, so every starter and Activity Bank
  item uses `class Program { static void Main() { ... } }`. `runCode(lang, source,
  stdin)` in `js/runner.js` is the entry point (`runJava` is a thin wrapper). A
  top-level statement in line 1 gets a CS1525 hint telling the learner to wrap it
  in `Main`. Re-check the compiler name if Wandbox changes its list.
- **Wandbox is an external dependency.** Browser-direct, free, no key. A failed or
  slow Run shows a friendly message and never blocks Submit. Nothing is stored in
  Storage or Functions, so the zero-cost rule holds. Program input (stdin) is a
  box under the code for run languages.
- **Web preview sandbox: never `allow-same-origin`.** `js/webpreview.js`
  `mountPreview()` renders learner HTML in `<iframe srcdoc sandbox="allow-scripts
  allow-modals">`. Adding `allow-same-origin` would let learner JavaScript read
  the signed-in Firebase session, so don't. The console panel is a `postMessage`
  bridge: messages are accepted only when `event.source` is the preview frame and
  capped at 200 entries. A `srcdoc` frame inherits the page's report-only CSP.
  Links with `target=_blank` and `mailto:` do not open inside the sandbox; that is
  expected. Preview never sends the code anywhere.
- **Assignment and submission fields.** Assignments (type `code` only): `codeLang`
  (`java`/`csharp`/`web`), `starterCode`. Both are removed with `deleteField()` when
  the teacher switches type away from `code`. New type `allowedFileTypes:
  "project"`: a link plus a demo video link, no code box. Student form: starter
  code prefills on the first submit only; an untouched starter counts as empty (so
  it cannot be submitted as work); stale run output is cleared when the code is
  edited.
- **`demoLink` is a rules change.** Project submissions carry `demoLink` (video
  link, size < 2000). `firestore.rules` allows it in the student create and update
  `hasOnly()` lists. **Must `firebase deploy --only firestore:rules`** before the
  Project UI is used, else a student's project submit is rejected.
- **Activity Bank (`data/activity-bank/<subject>.json`).** A JSON array, one entry
  per ready-to-post activity: `id`, `subject`, `term`, `week`, `competency`,
  `title`, `type` (`code`/`project`/...), `codeLang`, `instructions`,
  `starterCode`, `points`, `component`. `js/activity-bank.js`: `loadBank(subject)`
  fetches `data/activity-bank/<subject>.json?v=1` (**bump that `?v=` when the JSON
  changes**, same max-age=600 reason as the other cache-busters), `weeksOf(bank)`
  groups by week, `toAssignmentFields(entry)` maps an entry to assignment fields.
  Teacher picker `#bank-picker` only **fills the add-assignment form**; it never
  saves, so the teacher reviews and posts. `dotnet.json` has 50 BOW competencies
  plus 8 PTs (Term 1, weeks 1-10). Laptop items assume one stack: ASP.NET Core MVC
  (.NET 8) in Visual Studio Community; phone-doable items use the in-app C#/web
  boxes. Learner text is plain English (humanizer pass).
- **Phase 2 (Term 2, Java).** Add `data/activity-bank/java.json` (BOW weeks 1-10
  and PTs; Swing weeks use `project`, Scanner-based starters for run items), then
  add a "Computer Programming (Java)" option to `#bank-subject` in `teacher.html`.
  No other code changes: loader, picker and fields are subject-agnostic.
