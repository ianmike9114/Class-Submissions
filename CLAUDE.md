# CLAUDE.md

Guidance for Claude Code working in this repo.

## What this is

Static site (GitHub Pages) + Firebase **Auth + Firestore only** (free
Spark plan — no credit card, ever). Students sign in with Gmail, submit a
**link** (Google Doc/PDF, CodePen or GitHub Gist, Drive, or YouTube — no
file uploads) per subject/section/assignment. Teacher grades each
submission with single score out of assignment's total points, with
optional Drive/Docs rubric-reference link shown alongside score box for
own use, then publishes to student. Multiple teachers can use site, each
isolated to own subjects/sections/assignments/submissions/enrollments;
one super admin (hardcoded by email, see `ADMIN_EMAIL` below) can
see/edit any teacher's data and grants/revokes other teachers' access.
No password system either way (Google Sign-In only).

**AI rubric-check hidden, not deleted.** `js/teacher.js`'s
`AI_CHECK_ENABLED` flag (currently `false`) gates "Run AI Check" button
and "AI drafted" filter option — flip back to `true` to restore both.
`js/gemini.js` (`runRubricCheck()`, calls Gemini directly from browser
with teacher's own key) untouched underneath. Hidden because per-call
Gemini cost wasn't worth it for real usage; see grading-model note below
for why re-enabling isn't pure flip. (The Settings Gemini-key box is no
longer gated by this flag — it now shows whenever `GEMINI_KEY_NEEDED`,
i.e. `AI_CHECK_ENABLED || CODE_GEN_ENABLED`, because the Code Examples
generator below needs the same key.)

**Java code submission + in-app Run.** "Code" assignments accept a pasted
code box (or a `.java` file read as text — no Storage) saved to the
submission's `code`/`codeOutput` fields, not just a link. Students get a
**Run** button (teacher too, on the review card) that executes Java via
`js/runner.js`'s `runJava()` — a browser-direct call to **Wandbox's**
free public API (`wandbox.org`, OpenJDK, no key, CORS-open). Chosen after
the originally-planned Piston public API (`emkc.org`) went whitelist-only
Feb 2026. Wandbox saves the source as `prog.java`, so `runJava()` strips
`public` off top-level `class`/`interface`/`enum`/`record` before sending
(else `public class Main` fails on filename mismatch); Wandbox still
auto-runs whichever class has `main`. External service + no-Storage, so
it doesn't break the zero-cost/no-Blaze constraint; a failed Run degrades
to a friendly message and never blocks submitting. Highlighting on code
blocks is `js/highlight.js` (highlight.js lazy-loaded from CDN, no-op
fallback if blocked). **`firestore.rules` change shipped with this:**
`'code'`/`'codeOutput'` added to the student self-edit `hasOnly()` list
on `submissions` update, else resubmitting edited code is rejected —
**must `firebase deploy --only firestore:rules`**.

**Teacher Code Examples generator.** `js/teacher.js`'s `CODE_GEN_ENABLED`
flag (currently `true`) gates the "💻 Code Examples" sidebar tab and its
`#view-code-gen` panel. `js/gemini.js`'s `generateCodeExample({topic,
language, style})` drafts starter/worked/commented example code (teacher
hands to students) via the same browser-direct Gemini call as the hidden
rubric-check, using the teacher's own key. Teacher-only; writes nothing
to Firestore.

**No Firebase Storage, no Cloud Functions — deliberately.** Both require
paid Blaze plan just to exist, even at zero usage, hard constraint for
project. If future change seems to need either, stop and flag it — breaks
zero-cost guarantee, don't add silently.

Full setup steps: `README.md`. This file for **where to edit**, not how
to deploy.

## Commands

No `package.json`, no bundler, no lint config, no test suite, no CI —
pure static site, zero build tooling, by design (see "no build step"
below). Nothing to `npm install`/build/lint/test.

- **Preview locally**: `python -m http.server 8420` from repo root (also
  configured in `.claude/launch.json`), then open `http://localhost:8420`.
- **Tests** (dev-only, see `.claude/Skills/qa-testing`): `npm test` (unit),
  `npm run test:rules` (rules on emulator), `npm run e2e` (page smoke),
  `npm run e2e:flows` (full user flows on Auth+Firestore emulators via the
  localhost-only `?emu=1` switch in `js/firebase-config.js`), `npm run e2e:prod`
  (read-only live-site smoke; also runs after each deploy + daily), `npm run
  budget -- --students N --teachers M` (Spark daily read/write estimate).
- **Deploy Firestore rules** (only real "build artifact" in repo):
  `firebase deploy --only firestore:rules`, after `firebase login`. Full
  deploy steps (Firebase project setup, GitHub Pages): `README.md`.

## Architecture (3 layers, no build step)

- **Frontend**: plain HTML/CSS/JS, no bundler. `index.html` (login) →
  `teacher.html` or `student.html` based on `js/auth.js`'s
  `isTeacherEmail()` (async: `true` for `ADMIN_EMAIL`, or if
  `teachers/{email}` doc exists — see Data model). Firebase JS SDK loaded
  via CDN ES modules.
- **Firebase**: Auth (Google only) + Firestore (data) only.
- **AI**: `js/gemini.js` calls Gemini API directly from browser using
  teacher's own key (never student's, never in git).
- **Rules are real access control** — `firestore.rules`, not frontend
  code. Any who-can-do-what change goes there, not just UI.
- `firebase.json` only declares `firestore.rules` as rules file — no
  `hosting` block, since GitHub Pages serves static site, not Firebase
  Hosting. `.firebaserc` pins default Firebase project used by
  `firebase deploy --only firestore:rules`.

**Two-tier admin model.** `ADMIN_EMAIL` (super admin, formerly
`TEACHER_EMAIL`) duplicated in **2 places** on purpose (no shared config
in static-site setup) — if super admin's email ever changes, update
both: `firestore.rules`, `js/firebase-config.js`. Regular teachers
different: granted access by super admin at runtime (`teachers/{email}`
doc, added/removed from `teacher.html`'s Settings panel), not hardcoded
anywhere — see "Adding/removing a teacher account" below and `teachers`
collection in Data model.

**Sign-in uses Google Identity Services directly, not
`signInWithPopup`/`signInWithRedirect`.** Both route through cross-domain
hop (this site → Firebase `authDomain` → Google → back) that modern
browsers' third-party storage partitioning silently breaks with zero
console error, reproduced on Edge and Brave alike during setup.
`js/auth.js`'s `initGoogleSignIn()` instead gets ID token from Google's
own widget (loaded via `accounts.google.com/gsi/client` script tag on
`index.html`) and hands it to Firebase via `signInWithCredential` — no
cross-domain redirect involved. Needs `GOOGLE_CLIENT_ID` in
`js/firebase-config.js` (Firebase Console → Authentication → Sign-in
method → Google → Web SDK configuration → Web client ID) **and** same
client ID's Authorized JavaScript origins (Google Cloud Console →
Credentials, separate from Firebase's own Authorized domains list) must
include site's real origin. Don't revert to
`signInWithPopup`/`signInWithRedirect` without strong reason — tried
first, silently failed cross-browser.

## Task map and data model

For "which file/function to edit for change X" and full Firestore
schema, see `.claude/Skills/student-lms/SKILL.md` (invoked automatically
for any change to app's teacher/student/rules files) — detailed,
frequently-changing reference; this file stays short since loaded into
every session automatically.

For any UI/CSS change, read `DESIGN_SYSTEM.md` first, not
`css/style.css` directly.

## Design notes (read the matching file before editing that area)

The deliberate limitations and per-feature decisions (why something is built the
way it is, which rules changes shipped with it) live in `docs/design-notes/`,
not here, so they are not loaded into every session.

| Area | Read first | Covers |
|---|---|---|
| Sign-in and joining a class | `docs/design-notes/sign-in-and-joining.md` | in-app browsers, email-link sign-in, Remember this device, QR join, invite by Gmail, hidden join-code box |
| Spark read budget and caching | `docs/design-notes/read-budget-caching.md` | submission count/search reads, student and teacher caches, version markers, listeners |
| Grading and records | `docs/design-notes/grading-and-records.md` | single raw score, WW/PT grouping, return penalty, manual exam scores, exam import, Class Record reader, hidden AI rubric-check |
| Quizzes | `docs/design-notes/quizzes.md` | quiz builder, runner and anti-cheat, question bank, AI provider, Android app bridge, quiz from a lesson file |
| Photos, files and reports | `docs/design-notes/photos-files-reports.md` | links-only rule, photo capture and compression, Photo ZIPs, Open in Chrome, download button, accomplishment report and collage |
| Access, enrollment and deletes | `docs/design-notes/access-enrollment-deletes.md` | multi-teacher isolation, cascade deletes, type-the-name confirm, remove enrollment, leave requests, delete a submission |
| Terms, layout and notifications | `docs/design-notes/terms-layout-notifications.md` | current-term filter, organized layout, mobile breakpoint, new-joins bell, Email class (Gmail) |

**Sync rule:** a change that adds or alters a deliberate limitation or feature
decision must update the matching `docs/design-notes/` file in the same
session (add a row above for a new file). Do not add feature notes to this file.

**Hard rules that always apply** (details in the files above):

- Never download whole `submissions` to count or search (docs carry base64
  photos); use `getCountFromServer` / the cached search corpus.
- Every assignment add/edit/delete path in `js/teacher.js` must call
  `touchSection(sectionId, { changed, deleted })`; subject/section/assignment or
  headcount writes must call `invalidateStructure()`; teacher writes that change
  what a student sees on a submission must call `touchStudentSubs()`.
- A `firestore.rules` change is not live until `firebase deploy --only
  firestore:rules`.
- Do not build without being asked: weighted/transmuted grades, Class Record
  `.xlsx` export, roster CSV import, a visible join-code box.
- Do not loosen `js/class-record.js` `loadWorkbook()`'s string-type row check.
- Quiz anti-cheat is deterrence, not a lock; never promise screenshot blocking
  on the web.
- `auth.js`, `gemini.js` and `quiz.js` imports carry their own `?v=`; bump it
  when those files change.

## Conventions

- No bundler/build step by design — keep deployable as-is to GitHub
  Pages. If adding dependency to frontend, use CDN ESM import (see
  `js/firebase-config.js` for pattern), don't introduce npm/webpack for
  static site.
- Don't reintroduce Firebase Storage or Cloud Functions — see
  "deliberately" note above.
- **`css/style.css`/`js/student.js`/`js/teacher.js` loaded with manual
  `?v=N` cache-buster** (`index.html`, `student.html`, `teacher.html`).
  GitHub Pages sets `Cache-Control: max-age=600` with no build step to
  content-hash filenames, so without this deployed fix can sit invisible
  in student's/teacher's browser for up to 10 minutes (longer with
  mobile disk caching) — bump `?v=` on every file changed, in every HTML
  file referencing it, as part of shipping change, not after someone
  reports "I don't see the fix."
