# CLAUDE.md

Guidance for Claude Code working in this repo.

## What this is

Static site (GitHub Pages) + Firebase **Auth + Firestore only** (free
Spark plan — no credit card, ever). Students sign in with Gmail, submit a
**link** (Google Doc/PDF, GitHub Gist, Drive, or YouTube — no file
uploads) per subject/section/assignment. Teacher runs an AI rubric-check
that calls Gemini **directly from the browser** (teacher's own key,
Settings box, localStorage only) to draft a score + feedback per
criterion, then reviews/edits and publishes to the student. Single teacher
= the only admin, hardcoded by email — no multi-admin system, no password
system (Google Sign-In only).

**No Firebase Storage, no Cloud Functions — deliberately.** Both require
the paid Blaze plan just to exist, even at zero usage, which was a hard
constraint for this project. If a future change seems to need either,
stop and flag it — it breaks the zero-cost guarantee, don't add silently.

Full setup steps: `README.md`. This file is for **where to edit**, not
how to deploy.

## Architecture (3 layers, no build step)

- **Frontend**: plain HTML/CSS/JS, no bundler. `index.html` (login) →
  `teacher.html` or `student.html` based on whether the signed-in email
  matches `TEACHER_EMAIL`. Firebase JS SDK loaded via CDN ES modules.
- **Firebase**: Auth (Google only) + Firestore (data) only.
- **AI**: `js/gemini.js` calls the Gemini API directly from the browser
  using the teacher's own key (never the student's, never in git).
- **Rules are the real access control** — `firestore.rules`, not the
  frontend code. Any change to who-can-do-what goes there, not just in
  the UI.

`TEACHER_EMAIL` / the admin check is duplicated in **2 places** on
purpose (no shared config in a static-site setup) — if you ever change the
teacher's email, update both: `firestore.rules`, `js/firebase-config.js`.

## Task map — common changes → exact edit location

| Change | Edit |
|---|---|
| Teacher dashboard UI/behavior (subjects/sections/assignments/rubric builder/submissions review/publish/Settings) | `js/teacher.js` + `teacher.html` |
| Student dashboard UI/behavior (join class/submit a link/view results) | `js/student.js` + `student.html` |
| Google Sign-In / role routing (teacher vs student) | `js/auth.js` |
| Firebase project keys / teacher email constant (frontend) | `js/firebase-config.js` |
| Who can read/write what in Firestore | `firestore.rules` |
| AI rubric-check logic (prompt, Gemini model/params, key storage) | `js/gemini.js` |
| Inline submission preview (which links embed vs. fall back to a plain link) | `js/embed.js` (`toEmbedUrl()`) |
| Export published scores into the teacher's Class Record `.xlsx` | `js/class-record.js` (workbook read/match/write, client-side via SheetJS CDN script in `teacher.html`) |
| Styling | `css/style.css` |
| Firestore deploy config | `firebase.json`, `.firebaserc` |
| Setup/deploy instructions | `README.md` |

## Data model (Firestore)

- `subjects` — name, gradeLevel, archived
- `sections` — subjectId, sectionName, joinCode
- `assignments` — subjectId, sectionId, title, dueDate, allowedFileTypes (a link-type hint, not an upload constraint), rubric[{criterion, maxPoints}]
- `submissions` — assignmentId, studentUID, studentName, link, status(pending/ai-drafted/published), aiDraft{scorePerCriterion, feedback}, finalGrade{scorePerCriterion, feedback}
- `enrollments` — studentUID, subjectId, sectionId (created when a student enters a join code)

## Known v1 limitations (deliberate, see README)

- No file uploads — everything is a link. Non-YouTube links must be shared
  "anyone with the link can view" or the AI (and the teacher) can't open
  them.
- AI check quality depends on Gemini's `urlContext` tool successfully
  fetching the linked content; YouTube links use native video
  understanding instead (more reliable). If a check fails or looks wrong,
  the teacher just grades manually in the same Review panel — nothing is
  blocked on it.
- No roster CSV import — students self-enroll via section join-code only
  (Class Record export is one-way: app → file, not the reverse).
- Class Record name matching is exact/case-insensitive only, and always
  requires teacher confirmation in the match table before any write — see
  `js/class-record.js`. Never make this auto-write without confirmation;
  it's writing into the teacher's real gradebook.
- No real-time listeners (`onSnapshot`) — lists refresh on load/action, not
  live. Fine at single-class scale; add if it ever matters.

## Conventions

- No bundler/build step by design — keep it deployable as-is to GitHub
  Pages. If you add a dependency to the frontend, use a CDN ESM import
  (see `js/firebase-config.js` for the pattern), don't introduce npm/webpack
  for the static site.
- Do not reintroduce Firebase Storage or Cloud Functions — see the
  "deliberately" note above.
