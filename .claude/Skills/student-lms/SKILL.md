---
name: student-lms
description: Modify the Class Submissions app — student file/video upload, join-code enrollment, teacher rubric builder, AI (Gemini) rubric-check drafting, submission review/publish. Use for any change to teacher.html/student.html/js/*.js/functions/index.js/firestore.rules/storage.rules in this repo.
---

# Student LMS routing

Don't explore the codebase first — `CLAUDE.md` in the repo root has the
full task map (change → exact file) and architecture summary. Read that
file, jump straight to the named file(s).

Quick pointers:
- Teacher-side change → `js/teacher.js` (+ `teacher.html` if UI markup)
- Student-side change → `js/student.js` (+ `student.html` if UI markup)
- AI rubric-check behavior (prompt, file-type support, model) → `functions/index.js`
- Access control → `firestore.rules` / `storage.rules`
- Deploy/setup steps → `README.md`

Reminders specific to this repo:
- `TEACHER_EMAIL` is duplicated in 4 files on purpose (no shared config in
  a static-site, no-build-step setup) — see `CLAUDE.md` for the list. If a
  change touches the teacher-identity check, update all 4, not just one.
- No bundler. Frontend JS is plain ES modules loaded straight in the
  browser (Firebase SDK via CDN). Don't introduce a build step for the
  static site — only `functions/` has its own `npm install`.
- Video submissions never go through the AI check path — that's
  intentional (see `functions/index.js`'s `runAiCheck`, it rejects
  `videoLink` submissions), not a bug to "fix".
- After any change to `firestore.rules` or `storage.rules`, remind the user
  they need to `firebase deploy --only firestore:rules,storage:rules` —
  local edits alone don't take effect.
