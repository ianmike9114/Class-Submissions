# Class Submissions — Student Upload + AI Rubric-Check

Static site (GitHub Pages) + Firebase (Auth + Firestore only — **free Spark
plan, no credit card, ever**). Students sign in with their own Gmail,
submit a link per assignment (Google Doc/PDF, GitHub Gist, Drive, or
YouTube — no file uploads), you run an AI rubric-check that drafts a score
+ feedback, you review and publish.

No Cloud Functions, no Firebase Storage — both require the paid Blaze plan
just to exist, even at zero usage. Instead: submissions are always a link,
and the AI check calls Gemini directly from your browser using your own
free API key (typed into the app's Settings box, kept in that browser's
local storage only — never committed to git, never sent anywhere else).

## One-time setup

### 1. Firebase project (Spark plan — free, no card)
1. Go to https://console.firebase.google.com → Add project.
2. **Authentication** → Sign-in method → enable **Google**.
3. **Firestore Database** → Create database (production mode, any region near PH).
4. That's it — do **not** touch Storage or Functions, and don't click any "Upgrade to Blaze" prompt.

### 2. Fill in your details (2 places, must match exactly)
Replace `galutira.ianjoseph.f@gmail.com` if you ever change the teacher
account, in:
- `firestore.rules`
- `js/firebase-config.js` (`TEACHER_EMAIL`)

Replace the Firebase config in `js/firebase-config.js` — get these values
from Firebase Console → Project Settings (gear icon) → General → scroll to
"Your apps" → Add app → Web → copy the `firebaseConfig` object.

Replace the project ID in `.firebaserc`.

### 2b. Google Sign-In client ID + authorized origin

Sign-in uses Google Identity Services directly (not Firebase's own popup/
redirect flow — those silently fail on some browsers due to third-party
storage blocking). This needs one more value plus one console setting:

1. Firebase Console → **Authentication** → **Sign-in method** → click the
   **Google** row → expand **Web SDK configuration** → copy the **Web
   client ID** (ends in `.apps.googleusercontent.com`).
2. Paste it into `js/firebase-config.js` → `GOOGLE_CLIENT_ID`.
3. Go to [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
   (same project), find that same OAuth client (named something like "Web
   client (auto created by Google Service)"), open it, and under
   **Authorized JavaScript origins** add your site's real origin — e.g.
   `https://<username>.github.io` (origin only, no path, no trailing
   slash). Save.

### 3. Deploy Firestore rules
```bash
npm install -g firebase-tools   # if not already installed
firebase login
firebase deploy --only firestore:rules
```

### 4. Host the frontend on GitHub Pages
1. Create a new GitHub repo, push this folder to it.
2. Repo Settings → Pages → Deploy from branch → `main` / root.
3. Your site is live at `https://<username>.github.io/<repo>/`.

### 5. Add your Gemini key (in the app itself, not a file)
1. Get a free key at https://aistudio.google.com/apikey.
2. Open `teacher.html` on your live site, sign in, paste the key into the
   **Settings** box at the top, click **Save key**. It stays in that
   browser only.

### 6. Test before onboarding students
- Sign in with your own Gmail on `teacher.html` — confirms Google Sign-In +
  teacher role detection works, and save your Gemini key there.
- Add a test subject → section → assignment with a 2-criterion rubric.
- Sign in with a *different* Gmail (e.g. a personal test account) on
  `student.html`, join with the section's join code, submit a link for
  each type you plan to use (a public Google Doc, a GitHub Gist, a YouTube
  link).
- Back on `teacher.html`, run **AI Check**, confirm scores/feedback look
  reasonable, edit if needed, **Publish**, then confirm the student
  account now sees the result.
- Confirm archiving a subject hides it from the default teacher view and
  from anything student-facing, without deleting its data.

## Day-to-day use
- New subject/section/assignment: all done from `teacher.html`, no code
  changes needed.
- Each section has its own join code (shown in the teacher UI) — give it to
  that class only.
- Students always submit a **link**, sharing permissions must be "anyone
  with the link can view" for non-YouTube links or the AI (and you) can't
  open it.
- If AI Check ever fails or looks wrong for a given submission, just grade
  it manually in the same Review panel — nothing is blocked on the AI step.
