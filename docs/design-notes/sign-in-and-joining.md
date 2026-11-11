# Sign-in and joining a class

Deliberate design decisions and known limits. Moved out of `CLAUDE.md` so they load only
when needed. Read before editing this area; add new notes for this area here.

- No roster CSV import — students get in by teacher bulk-invite (auto-join) or
  QR scan; there is no longer a **manual join-code entry box**. The "Join a
  class" card's code field is permanently hidden (`student.html`'s `#join-card`
  wraps it in a `hidden` div) because teachers use bulk email invites now and
  typing a code confused students; a QR/`?code=` deep link still fills and
  submits that hidden field programmatically (`js/student.js`'s
  `applyPendingJoinCode`), so scan-to-join and its roster name-picker/status
  message still work. Don't re-expose the code box without being asked.
- **QR join is same-origin deep link, generated entirely client-side.**
  `js/teacher.js`'s `renderSectionQR()` uses `qrcodejs` CDN library to
  draw QR in-browser — join link (`student.html?code=...`) never goes to
  third-party QR image API, matching zero-cost/no-Storage constraint and
  avoiding leaking join codes to external server.
- Sign-in genuinely cannot work inside Facebook/Messenger/Instagram/Line/
  TikTok's embedded in-app browsers — Google's OAuth rejects request
  itself (`disallowed_useragent`), app has zero ability to bypass it.
  `index.html`'s `isInAppBrowser()` detects common ones and shows
  escape-hatch banner (Copy link, and on Android `intent://` "Open in
  Chrome" button) instead of leaving user on dead sign-in screen. UA-sniff
  list best-effort, not exhaustive — add more app signatures if teacher
  reports same blank-screen symptom from different app's share link.
- **Email-link (passwordless) sign-in as in-app-browser fallback.** Since
  the escape hatch above is weak on iOS (no `intent://` equivalent), the
  login page also offers a Firebase **email sign-in link** — shown *only*
  inside the `isInAppBrowser()` block, never replacing Google's one-tap
  where it works. Not OAuth, so `disallowed_useragent` never fires:
  requesting the link works from inside the WebView, and tapping the
  emailed link opens the phone's real browser (which is what escapes the
  WebView) to complete sign-in. `js/auth.js`'s `sendEmailSignInLink()` /
  `isEmailSignInLink()` / `completeEmailLinkSignIn()` back it;
  `index.html` wires the send form (inside the in-app banner) and the
  completion handler (`finishEmailLinkSignIn()`), including a "confirm
  your email" re-prompt (`#email-confirm`) for the normal cross-browser
  case where the link opens in a *different* browser than it was
  requested from, so `localStorage` can't supply the email. **No
  `firestore.rules` change** — email-link populates
  `request.auth.token.email` + `email_verified` like Google, and rules
  key off email/uid only, never `sign_in_provider`. Role routing
  (`isTeacherEmail()`), join `?code=` carry-through, and auto-enroll all
  work unchanged. Requires **"Email link (passwordless sign-in)" enabled
  in Firebase Console** (Authentication → Sign-in method → Email/Password)
  — a one-time console step, not a code toggle; see README 2c. Free on
  Spark (Firebase Auth email link has no cost — only phone/SMS auth
  does), so it doesn't break the no-Blaze constraint.
  **Also the Android app's fallback** when the native Google picker fails
  (no Google Play Services, e.g. Huawei): `index.html`'s `initAppSignIn()`
  shows `#app-email-link`, where the student sends the link and **pastes** it
  back (`completeEmailLinkSignIn(email, href)` takes the pasted link) - tapping
  it would complete sign-in in the browser, not the app.
- **"Remember this device" + sign-in bounce breaker.** `js/auth.js` stores
  the signed-in email (`lms.rememberEmail`, email only — no token) when the
  login page's "Remember this device" box is ticked (default; opt-out per
  device in `lms.rememberOptOut` for shared lab PCs). When the Firebase session
  is gone (iOS 7-day storage purge, home-screen app's separate storage),
  `initGoogleSignIn(..., { autoEmail })` runs Google One Tap with
  `auto_select`/`login_hint`/`itp_support` so the user signs straight back in;
  the normal button stays as fallback (Brave has no FedCM). `signOutUser()`
  calls `forgetDevice()` so sign-out never auto-signs back in. Bounce breaker:
  `recordAuthHop()` timestamps each index → dashboard redirect in
  sessionStorage; 3 within 15s (dashboard keeps finding no session) stops the
  redirect and shows `#bounce-warning` instead of looping. `guardPage()`
  clears the hops on success and shows a Retry card if `isTeacherEmail()`
  fails. `auth.js` imports carry their own `?v=` (index.html, student.js,
  teacher.js). No rules change.
- **Invite student by Gmail, auto-join on sign-in — no email-click-to-
  accept step.** New `invites/{inviteId}` collection (`studentEmail`
  lowercased, `studentName`, `subjectId`/`subjectName`, `sectionId`/
  `sectionName`, `teacherName`, `ownerEmail`, `createdAt`). Teacher-side
  form lives in `js/teacher.js`'s `loadSections()` ("Invite by email"
  `<details>` next to "Show QR"), backed by `getPendingInvites()` for
  section's pending-invite list + Cancel button. Consumed on student side
  by `js/student.js`'s `applyPendingInvites()`, called right after
  sign-in (before `loadEverything()`) — queries `invites` by signed-in
  email, calls existing `enroll()` unchanged, then deletes invite doc
  whether or not it resulted in new enrollment (so stale/duplicate invite
  can't re-fire). Exists alongside join-code/QR flow, not replacement —
  added because some students don't reliably have Gmail access to click
  emailed accept link. `firestore.rules`'s new `invites` match block:
  create is teacher/owner-only, read/delete allow either owning teacher
  or invited student themselves (matching email on their auth token) —
  this lets student's own auto-join code consume (delete) its own invite.
