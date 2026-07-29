# CLAUDE.md

Guidance for Claude Code working in this repo.

## What this is

Static site (GitHub Pages) + Firebase (Auth/Firestore/Storage/Functions) +
Gemini. Students sign in with Gmail, submit assignment files (or a video
link) per subject/section, teacher runs an AI rubric-check that drafts a
score + feedback per criterion, teacher reviews/edits and publishes to the
student. Single teacher = the only admin, hardcoded by email — no
multi-admin system, no password system (Google Sign-In only).

Full setup steps: `README.md`. This file is for **where to edit**, not
how to deploy.

## Architecture (3 layers, no build step)

- **Frontend**: plain HTML/CSS/JS, no bundler. `index.html` (login) →
  `teacher.html` or `student.html` based on whether the signed-in email
  matches `TEACHER_EMAIL`. Firebase JS SDK loaded via CDN ES modules.
- **Firebase**: Auth (Google only) + Firestore (data) + Storage (uploaded
  files) + one Cloud Function (`functions/index.js`, the Gemini call).
- **Rules are the real access control** — `firestore.rules` and
  `storage.rules`, not the frontend code. Any change to who-can-do-what
  goes there, not just in the UI.

`TEACHER_EMAIL` / the admin check is duplicated in **4 places** on
purpose (no shared config in a static-site setup) — if you ever change the
teacher's email, update all 4: `firestore.rules`, `storage.rules`,
`functions/index.js`, `js/firebase-config.js`.

## Task map — common changes → exact edit location

| Change | Edit |
|---|---|
| Teacher dashboard UI/behavior (subjects/sections/assignments/rubric builder/submissions review/publish) | `js/teacher.js` + `teacher.html` |
| Student dashboard UI/behavior (join class/submit/view results) | `js/student.js` + `student.html` |
| Google Sign-In / role routing (teacher vs student) | `js/auth.js` |
| Firebase project keys / teacher email constant (frontend) | `js/firebase-config.js` |
| Who can read/write what in Firestore | `firestore.rules` |
| Who can upload/read files in Storage, file size cap | `storage.rules` |
| AI rubric-check logic (prompt, what file types are auto-extracted, Gemini model/params) | `functions/index.js` (`buildGeminiContent`, `runAiCheck`) |
| Add support for a new auto-checked file type (e.g. pptx) | `functions/index.js` → extend `buildGeminiContent()`'s extension branches; add the new npm dep to `functions/package.json` |
| Styling | `css/style.css` |
| Firebase/Firestore/Storage/Functions deploy config | `firebase.json`, `.firebaserc` |
| Setup/deploy instructions | `README.md` |

## Data model (Firestore)

- `subjects` — name, gradeLevel, archived
- `sections` — subjectId, sectionName, joinCode
- `assignments` — subjectId, sectionId, title, dueDate, allowedFileTypes, rubric[{criterion, maxPoints}]
- `submissions` — assignmentId, studentUID, studentName, fileURL|videoLink, status(pending/ai-drafted/published), aiDraft{scorePerCriterion, feedback}, finalGrade{scorePerCriterion, feedback}
- `enrollments` — studentUID, subjectId, sectionId (created when a student enters a join code)

## Known v1 limitations (deliberate, see README)

- pptx isn't auto-extracted for AI check yet — graded manually. Add support
  in `functions/index.js`'s `buildGeminiContent()` when needed.
- Video submissions are never AI-checked (no content-watching AI call) —
  always graded manually in the same teacher review panel.
- No roster CSV import — students self-enroll via section join-code only.
- No real-time listeners (`onSnapshot`) — lists refresh on load/action, not
  live. Fine at single-class scale; add if it ever matters.

## Conventions

- No bundler/build step by design — keep it deployable as-is to GitHub
  Pages. If you add a dependency to the frontend, use a CDN ESM import
  (see `js/firebase-config.js` for the pattern), don't introduce npm/webpack
  for the static site.
- `functions/` is the only place with an npm install step.
