---
name: student-lms
description: Modify the Class Submissions app — student link submission, join-code enrollment, teacher rubric builder, browser-side AI (Gemini) rubric-check drafting, submission review/publish. Use for any change to teacher.html/student.html/js/*.js/firestore.rules in this repo.
---

# Student LMS routing

Don't explore the codebase first — `CLAUDE.md` in the repo root has the
full task map (change → exact file) and architecture summary. Read that
file, jump straight to the named file(s).

Quick pointers:
- Teacher-side change → `js/teacher.js` (+ `teacher.html` if UI markup)
- Student-side change → `js/student.js` (+ `student.html` if UI markup)
- AI rubric-check behavior (prompt, Gemini model, key storage) → `js/gemini.js`
- Access control → `firestore.rules`
- Deploy/setup steps → `README.md`

Reminders specific to this repo:
- **No Firebase Storage, no Cloud Functions — this is deliberate**, not an
  oversight. Both require the paid Blaze plan just to exist, and staying
  fully free (no card, ever) was a hard requirement. Submissions are
  always a link (Doc/PDF/Gist/Drive/YouTube), and the AI check is a direct
  browser→Gemini call. Do not suggest adding either back without the user
  explicitly asking to take on that cost/complexity.
- `TEACHER_EMAIL` is duplicated in 2 files on purpose (no shared config in
  a static-site, no-build-step setup) — `firestore.rules` and
  `js/firebase-config.js`. If a change touches the teacher-identity check,
  update both.
- No bundler. Frontend JS is plain ES modules loaded straight in the
  browser (Firebase SDK via CDN). Don't introduce a build step.
- The Gemini API key lives in the teacher's browser localStorage only
  (`js/gemini.js`), set via the Settings box in `teacher.html`. Never hard
  code a key into any committed file.
- After any change to `firestore.rules`, remind the user they need to
  `firebase deploy --only firestore:rules` — local edits alone don't take
  effect.
