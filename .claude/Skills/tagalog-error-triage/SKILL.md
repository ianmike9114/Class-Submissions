---
name: tagalog-error-triage
description: Interpret a Tagalog or Taglish error report, bug complaint, or a screenshot of an app/browser error for this LMS — translate it to English, work out the real technical problem, point at the affected file, and route to the fix. Use whenever the user (or a student/teacher they quote) describes a problem in Tagalog/Taglish, or shares a screenshot of an error with Tagalog captions or UI.
---

# Tagalog error triage

The people using this LMS are Filipino students and teachers. When
something breaks, the report Claude gets is usually a mix of **real
app/browser error text** (Firebase errors, browser messages, console
logs) and **screenshots**, wrapped in **Tagalog/Taglish** — quoted from a
student, a co-teacher, or the user's own shorthand.

This skill's job is narrow: **translate and locate, then hand off.**
Turn the Tagalog report into a clear English diagnosis pointed at the
right file, then let `student-lms` + `systematic-debugging` do the actual
fix. This skill does **not** itself edit app code, and it does **not**
change the app's on-screen language.

## 1. First step — capture before you translate

- **Text report:** copy the exact Tagalog/Taglish wording, plus any
  English error code embedded in it, verbatim.
- **Screenshot:** read **both** the on-screen error text (usually
  English — Firebase/browser codes) **and** any Tagalog caption or UI
  around it. Transcribe both word-for-word first. **Never diagnose from
  the caption alone** — the English error code in the screenshot is the
  real signal; the Tagalog tells you what the person was trying to do.
- If the report is vague ("ayaw gumana", "may error"), say what's missing
  and ask for the exact on-screen text or a screenshot rather than
  guessing.

## 2. Taglish complaint glossary

Common bug-report phrases → English meaning → the technical signal they
usually carry in *this* app. (Route targets are confirmed against
`student-lms` in section 4 — don't treat these as final without it.)

| Tagalog / Taglish | English | Likely area |
|---|---|---|
| "hindi ako maka-sign in", "hindi mag-open yung Google", "blank yung sign in" | can't sign in / Google won't open | `js/auth.js` sign-in; or in-app-browser block — `index.html`'s `isInAppBrowser()` (Messenger/FB/IG/TikTok in-app browsers genuinely can't sign in) |
| "hindi ako maka-submit", "walang nangyari pag pindot ko yung button", "ayaw mag-submit" | can't submit / button does nothing | submission path → `js/student.js` |
| "mali yung code", "invalid daw yung join code", "hindi tanggap yung code" | join code rejected / invalid | enrollment → `js/student.js` `enroll()`, join-code lookup |
| "nawawala yung subject/section/grade", "hindi lumalabas", "wala akong nakikita" | subject/section/grade missing / not showing | read/isolation, publish state, or cascade delete (see `CLAUDE.md`) |
| "luma pa rin", "hindi ko makita yung update", "di nag-a-update" | still showing old version / update not visible | GitHub Pages / Vercel cache → `?v=N` cache-buster (see `CLAUDE.md` conventions) |
| "hindi ma-open yung link/file", "error sa pag-open ng document" | can't open the shared link/file | link not shared "anyone with link", or Android handler app → `js/embed.js` "Open in Chrome" |
| "hindi na-upload yung litrato", "putol/madilim yung picture" | photo won't upload / photo degraded | photo capture/compression → `js/student.js` `compressImage()`, `MAX_PHOTOS` cap |
| "na-log out ako bigla", "paulit-ulit mag-log out" | got logged out / keeps logging out | auth/session → `js/auth.js` |

Single words that change meaning: `hindi` / `'di` (not, can't) · `ayaw`
(won't) · `nawawala` / `wala` (missing, none) · `luma` (old, stale) ·
`bago` (new) · `laging` (always — reproducible) · `minsan` (sometimes —
intermittent) · `bigla` (suddenly) · `mabagal` (slow) · `nag-eerror`
(throwing an error) · `pindot` / `pinindot` (tap/click) · `litrato` /
`larawan` (photo) · `guro` (teacher) · `mag-aaral` (student).

## 3. Firebase / browser error codes

These stay in English even when the complaint is Tagalog — they are the
strongest signal. Common ones this app produces:

| Code / message | Means here | Likely cause |
|---|---|---|
| `permission-denied` (Firestore) | Firestore rules blocked the read/write | ownership/isolation rule, or acting as wrong role → `firestore.rules` (+ remind to `firebase deploy --only firestore:rules`) |
| `auth/...` (e.g. `auth/popup-blocked`, `auth/network-request-failed`) | Google sign-in failed | `js/auth.js` sign-in flow, or network/origin |
| `disallowed_useragent` | Google refused the OAuth request | opened inside an in-app browser (FB/Messenger/IG/TikTok) — unfixable in-app; `index.html`'s escape-hatch banner is the answer |
| `idpiframe_...` / origin errors | this origin isn't authorized | Google Cloud "Authorized JavaScript origins" / Firebase "Authorized domains" missing the current domain (see `vercel-migration` skill) |
| quota / `resource-exhausted` | Firestore free-tier limit hit | usage spike; not a code bug |

## 4. Route to the fix — reuse, don't restate

Once translated, find the exact file/function using the existing map —
do **not** duplicate it here:

- **`.claude/Skills/student-lms/SKILL.md`** — full task map (change →
  exact file/function) and Firestore data model. This is the source of
  truth for *where* to edit.
- **`CLAUDE.md`** — "Known v1 limitations." Check this **before** calling
  something a bug: many reported "problems" are deliberate documented
  behavior (lists aren't real-time so they don't auto-refresh; deleting a
  subject/section/assignment cascades; removed enrollment doesn't restore
  old submissions; deploys can sit in cache up to 10 min without the
  `?v=` bump; sign-in truly can't work in in-app browsers).

## 5. Output format

Reply with this short template, then hand off:

```
Original (Tagalog): <verbatim quote / transcription>
English: <plain-English translation>
What likely broke: <one-line technical interpretation>
Where: <file / area, e.g. js/student.js enroll()>
Deliberate behavior? <yes + which CLAUDE.md note / no>
Next step: <fix, ask for more info, or "no bug — expected">
```

Then invoke **`student-lms`** (to make the change) and, if it's a real
defect whose cause isn't obvious, **`systematic-debugging`** — rather
than editing straight from a guess.
