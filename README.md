# Class Submissions — Student Upload + AI Rubric-Check

Static site (GitHub Pages) + Firebase (Auth/Firestore/Storage/Functions) +
Gemini. Students sign in with their own Gmail, submit work per assignment,
you run an AI rubric-check that drafts a score + feedback, you review and
publish. Full design: see `.claude/plans` history or ask Claude to recap —
short version is in `CLAUDE.md`.

## One-time setup

### 1. Firebase project
1. Go to https://console.firebase.google.com → Add project.
2. **Authentication** → Sign-in method → enable **Google**.
3. **Firestore Database** → Create database (production mode, any region near PH).
4. **Storage** → Get started (default bucket is fine).
5. **Functions** requires the **Blaze (pay-as-you-go)** plan to call an
   external API (Gemini) from a Cloud Function — the free Spark plan blocks
   outbound network calls. Blaze still has a generous free tier; for one
   class's submission volume you're very unlikely to be charged anything.

### 2. Fill in your details (3 places, must match exactly)
Replace `REPLACE-WITH-TEACHER-GMAIL@gmail.com` with your actual Gmail in:
- `firestore.rules`
- `storage.rules`
- `functions/index.js`
- `js/firebase-config.js` (`TEACHER_EMAIL`)

Replace the Firebase config in `js/firebase-config.js` — get these values
from Firebase Console → Project Settings (gear icon) → General → scroll to
"Your apps" → Add app → Web → copy the `firebaseConfig` object.

Replace `REPLACE-WITH-YOUR-FIREBASE-PROJECT-ID` in `.firebaserc`.

### 3. Gemini API key
1. Get a free key at https://aistudio.google.com/apikey.
2. From this folder: `firebase functions:secrets:set GEMINI_API_KEY` and paste it.

### 4. Install and deploy
```bash
npm install -g firebase-tools   # if not already installed
firebase login
firebase deploy --only firestore:rules,storage:rules,functions
cd functions && npm install && cd ..
```

### 5. Host the frontend on GitHub Pages
1. Create a new GitHub repo, push this folder to it.
2. Repo Settings → Pages → Deploy from branch → `main` / root.
3. Your site is live at `https://<username>.github.io/<repo>/`.

### 6. Test before onboarding students
- Sign in with your own Gmail on `teacher.html` — confirms Google Sign-In +
  teacher role detection works.
- Add a test subject → section → assignment with a 2-criterion rubric.
- Sign in with a *different* Gmail (e.g. a personal test account) on
  `student.html`, join with the section's join code, submit a test file of
  each type you plan to use (doc, pdf, image, code, video link).
- Back on `teacher.html`, run **AI Check** on the non-video ones, confirm
  scores/feedback look reasonable, edit if needed, **Publish**, then
  confirm the student account now sees the result.
- Confirm archiving a subject hides it from the default teacher view and
  from anything student-facing, without deleting its data.

## Day-to-day use
- New subject/section/assignment: all done from `teacher.html`, no code
  changes needed.
- Each section has its own join code (shown in the teacher UI) — give it to
  that class only.
- Video assignments are never AI-checked — grade those manually in the same
  review panel.
- pptx submissions aren't auto-extracted yet (v1 limitation) — grade those
  manually too; see `CLAUDE.md` for where to add that later.
