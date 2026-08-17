---
name: react-native-mobile
description: React Native companion app for the DepEd Student LMS — same Firebase project (Auth + Firestore) as the web app, native @react-native-firebase SDK, own build tooling. Use for any change under /mobile, or any Expo/React Native/@react-native-firebase work.
---

# React Native mobile app

**`/mobile` doesn't exist in this repo yet.** This skill documents the
intended architecture so the first scaffolding and every session after
follow one plan instead of improvising per-session. Once real code
lands under `/mobile`, keep this file's task-map section growing the
same way `.claude/Skills/student-lms/SKILL.md` does for the web app.

## Same zero-cost constraint as the web app

`CLAUDE.md`'s hard gate applies here too: Firebase **Auth + Firestore
only**, no Storage, no Cloud Functions, ever (free Spark plan). This
isn't a web-only rule — it's a project-wide rule the mobile app must
also honor. If a mobile feature seems to need Storage or Functions,
stop and flag it rather than adding it silently.

`/mobile`'s own build tooling (npm, Metro, EAS) does **not** violate
the web app's separate "no build step" rule — that rule is scoped to
the static GitHub Pages site (`index.html`/`teacher.html`/`student.html`
+ `css/`/`js/`), which stays exactly as-is. Two build models coexist in
one repo on purpose.

## SDK: `@react-native-firebase`, not the web JS SDK

Chosen over the Firebase JS SDK for native module performance and
offline support. Consequence: needs a native build via EAS or bare
workflow — **not** Expo Go, which can't load native modules. Packages:
`@react-native-firebase/app`, `@react-native-firebase/auth`,
`@react-native-firebase/firestore`.

## Auth pattern: native Google Sign-In, mirrors the web app's own workaround

Web app (`js/auth.js`'s `initGoogleSignIn()`) deliberately skips
Firebase's own `signInWithPopup`/`signInWithRedirect` — those silently
break under third-party storage partitioning (reproduced on Edge and
Brave, zero console error) — and instead gets an ID token straight from
Google's widget, then calls `signInWithCredential`. Mobile hits the
equivalent problem differently (no cross-domain hop, but still no
reason to route through a WebView-based OAuth redirect), so follow the
same "get the token directly, hand it to Firebase" shape:

`@react-native-google-signin/google-signin` → ID token →
`@react-native-firebase/auth`'s `GoogleAuthProvider.credential(idToken)`
→ `signInWithCredential`.

Needs the **iOS and Android** OAuth client IDs for the same
`GOOGLE_CLIENT_ID` project registered in Google Cloud Console —
separate from the **Web** client ID `js/firebase-config.js` already
uses. Don't reuse the web client ID on mobile; each platform type is
registered separately even under one Firebase project.

## Data model: reuse the web schema, don't redefine it

Mobile reads/writes the exact same collections as web —
`subjects`/`sections`/`assignments`/`submissions`/`enrollments`/
`teachers`/`invites`. Canonical schema lives in
`.claude/Skills/student-lms/SKILL.md`'s Data model section — read that
before adding any mobile query or write, don't re-derive field names
from scratch.

`firestore.rules` already governs both clients identically — a
Firestore security rule has no concept of "which app sent this
request," only who the authenticated user is and what they're trying
to read/write. No mobile-specific rules block needed unless mobile
introduces a genuinely new write pattern the web app never had; see
`.claude/Skills/firestore-database/SKILL.md` for how to extend rules
safely if that happens.

## No file uploads on mobile either

Web has no Storage-backed file upload — non-YouTube links must be
"anyone with link can view," and the one exception (in-app photo
capture for "image"/"document" assignments) compresses each photo to
base64 and stores it directly on the Firestore doc
(`submissions.photoPages`, capped at `MAX_PHOTOS` × `PER_PHOTO_MAX_LEN`
so the array stays under Firestore's 1MiB doc limit — see
`js/student.js`'s `compressImage()`). If mobile adds a camera-capture
feature, it needs the same shape: compress client-side, cap total size,
write to the doc — never a Storage bucket.

## Domain logic: read `lms-domain` before building screens

Assignment/submission/grading/enrollment business rules (single-score
grading, submission lifecycle, leave-request flow, multi-teacher
isolation) are documented platform-agnostically in
`.claude/Skills/lms-domain/SKILL.md`. Mobile screens should match that
behavior exactly, not reinterpret it — read it before designing a
screen's logic, not just its layout.

## Task map — fills in as `/mobile` gets built

Starts sparse (unlike `student-lms`'s, which was written against a
finished app) — add a row every time a screen/feature lands.

| Change | Edit |
|---|---|
| Firebase init (mobile) | `/mobile` — `@react-native-firebase/app` config, platform-specific (`google-services.json` Android / `GoogleService-Info.plist` iOS), pulled from the same Firebase project as `js/firebase-config.js` |
| Google Sign-In (mobile) | `/mobile` — see Auth pattern above |
| Role routing (teacher vs student screens) | mirrors `js/auth.js`'s `isTeacherEmail()` (checks `ADMIN_EMAIL` then `teachers` collection) — same async check, same collections |
