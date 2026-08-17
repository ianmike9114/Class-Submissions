# Class Submissions — Student Link Uploads + Grading

Static site (GitHub Pages) + Firebase (Auth + Firestore only — **free Spark
plan, no credit card, ever**). Students sign in with their own Gmail,
submit a link per assignment (Google Doc/PDF, CodePen or GitHub Gist,
Drive, or YouTube — no file uploads), you grade it with a single score
out of that assignment's total points, add optional feedback, and
publish.

No Cloud Functions, no Firebase Storage — both require the paid Blaze plan
just to exist, even at zero usage. Instead: submissions are always a link,
graded manually.

An optional AI rubric-check (drafts a score + feedback via your own free
Gemini key, called directly from your browser) exists in the code but is
**off by default** — real usage showed the per-call Gemini cost wasn't
worth it for most classes. Flip `AI_CHECK_ENABLED` to `true` in
`js/teacher.js` to turn it back on; see `CLAUDE.md` for what that
restores and its one caveat (it still expects a per-criterion rubric,
which assignments no longer have now that grading is a single score).

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
- `js/firebase-config.js` (`ADMIN_EMAIL`)

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

### 2c. Enable email-link sign-in (in-app browser fallback)

Google Sign-In can't work inside Messenger/Facebook/Instagram/TikTok's
built-in browsers — Google itself blocks it (`disallowed_useragent`), and
iOS has no "Open in Chrome" escape. For those cases the login page offers
a passwordless **email sign-in link** instead (not OAuth, so not blocked;
the emailed link opens the phone's real browser to finish signing in).
Turn it on once:

1. Firebase Console → **Authentication** → **Sign-in method** → **Add new
   provider** → **Email/Password** → enable it, and also toggle on **Email
   link (passwordless sign-in)** → Save.
2. That's the only step — it reuses the same Authorized domains as Google
   sign-in (2b), needs no key in the app, and works on the free Spark plan.

Note: the link email comes from `noreply@<your-project>.firebaseapp.com`
and can land in **Spam/Promotions** — tell students to check there. This
is only a fallback; students in a normal browser still get Google's
one-tap.

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

### 5. (Optional) Add your Gemini key — only if you turn AI check on
Only needed if you flip `AI_CHECK_ENABLED` to `true` (see above) — the
Settings box that holds this key is hidden entirely otherwise.
1. Get a free key at https://aistudio.google.com/apikey.
2. Open `teacher.html` on your live site, sign in, paste the key into the
   **Settings** box at the top, click **Save key**. It stays in that
   browser only.

### 6. Test before onboarding students
- Sign in with your own Gmail on `teacher.html` — confirms Google Sign-In +
  teacher role detection works.
- Add a test subject → section → assignment, setting its total points.
- Sign in with a *different* Gmail (e.g. a personal test account) on
  `student.html`, join with the section's join code, submit a link for
  each type you plan to use (a public Google Doc, a GitHub Gist, a YouTube
  link).
- Back on `teacher.html`, open the submission, enter a score out of the
  assignment's total points, add feedback if you want, **Publish**, then
  confirm the student account now sees the result.
- Confirm archiving a subject hides it from the default teacher view and
  from anything student-facing, without deleting its data.

## Day-to-day use
- New subject/section/assignment: all done from `teacher.html`, no code
  changes needed.
- Each section has its own join code (shown in the teacher UI) — give it to
  that class only.
- Students always submit a **link** (or in-app photo capture for
  "image"/"document" assignments), sharing permissions must be "anyone
  with the link can view" for non-YouTube links or you can't open it.
- Grading is one score out of the assignment's total points, plus
  optional feedback — enter it in the Review panel and **Publish**.

## Beta capacity — what to watch (free Spark plan)

Sized against an ~8-teacher / ~200-student beta. Google Sign-In and the
number of teachers/admins/students do **not** touch any Google Cloud /
OAuth setting — the authorized-origins list is per *domain*, not per
user, so onboarding more people needs no console changes. What can bite
at scale is Firestore's free daily quota:

| Firestore quota (Spark, per day) | Limit | Headroom at beta scale |
|---|---|---|
| Document **reads** | 50,000 | Tightest — see below |
| Document **writes** | 20,000 | Comfortable |
| Document **deletes** | 20,000 | Comfortable |
| **Stored data** | 1 GiB total | Watch if photo submissions are heavy |

- **Reads are the pinch point on busy days.** A teacher's Records grid
  reads *every* submission in the section at once; several teachers
  reloading it on a deadline day (when all 200 students have just
  submitted) is what can approach 50k. The app has **no real-time
  listeners** (deliberate — see `CLAUDE.md`), which is exactly what keeps
  read counts from exploding otherwise. If a busy day does hit the cap,
  the fix is app-side (cache/paginate the Records grid), **not** a plan
  upgrade.
- **Storage creeps with photos.** Link submissions are tiny; in-app
  **photo** submissions are stored base64 inside Firestore docs (up to
  ~1 MiB each). Across 200 students × many photo assignments this can
  march toward the 1 GiB cap over a full beta — for photo-heavy
  activities, steer students to the Drive-link path instead.
- **Writes/deletes** (submissions, grades, enrollments) stay far under
  their caps at this scale.
- **Monitor it:** Firebase Console → Firestore → **Usage** tab shows
  daily reads/writes and stored bytes. That's the early-warning signal —
  check it during the first busy days of the beta.
