# UX + accessibility

Audience: DepEd teachers and Grade 7–12 students, mostly on **phones**, mixed
tech literacy, often on flaky mobile data, frequently arriving via
Facebook/Messenger share links. UX failures here don't crash the app — they
generate support load and silent drop-off (a student who can't sign in just
gives up). At 600 students, a 2% dead-end = a dozen stuck kids.

## Checklist

1. **Mobile layout coverage.** `css/style.css` has a **single**
   `@media (max-width:640px)` block (header stacking + `#records-table`
   horizontal scroll). It's a thin, one-breakpoint fix, not a full responsive
   pass. Spot-check the heaviest screens on a narrow viewport: teacher
   submissions/review, records grid, the invite/QR panels, student assignment
   view with embedded material. Anything overflowing the viewport width
   (sideways page scroll) or with tap targets too small = **MED**. Use the
   browser preview at 375px to confirm, don't guess.

2. **In-app-browser trap.** Google OAuth hard-rejects Facebook/Messenger/
   Instagram/Line/TikTok in-app WebViews (`disallowed_useragent`) — the app
   cannot bypass it. `isInAppBrowser()` (`index.html`) detects common ones and
   shows an escape banner (Copy link; Android `intent://` "Open in Chrome") plus
   the **email-link sign-in** fallback (the only thing that works on iOS
   WebViews). Verify: (a) the UA list is broad enough for the apps this school
   actually uses to share links, (b) the email-link path is enabled and wired,
   (c) iOS users aren't left on a dead Google button. A student stuck on a blank
   sign-in from a Messenger link = **HIGH** at scale (common arrival path).

3. **Onboarding friction.** Three enrollment paths — join-code, QR, email
   invite. Confirm each has a clear student-facing happy path and the failure
   messages are legible ("wrong code" vs a raw error). Too many competing paths
   with unclear instructions = **MED**. Check the join `?code=` carry-through
   survives the sign-in round-trip (a code lost during login means re-entry).

4. **Error messages for low-tech / Tagalog users.** Raw Firebase error strings
   (`permission-denied`, `resource-exhausted`) shown to a student are
   meaningless and scary. Check user-facing catches translate to plain,
   ideally Tagalog-friendly, guidance. Tie to the `tagalog-error-triage` skill
   for how these get reported. Quota-exceeded showing as a cryptic error mid-day
   compounds the scale blocker into a flood of confused reports = **HIGH**.

5. **Android file-link handoff.** `openInChromeButton()` (`js/embed.js`) forces
   Chrome for non-embeddable file links some Android phones otherwise hand to a
   broken "Document Viewer". Confirm it still renders where students/teachers
   open submitted/instruction links. iOS has no equivalent (Apple gives pages no
   handler control) — not a bug, note as platform limit.

6. **Teacher dashboard on mobile.** Many teachers will grade on phones. The
   dashboard is the densest screen; confirm the `@media` header fix + records
   scroll actually make it usable, not just non-broken. **MED**.

7. **Feedback on slow/failed actions.** On flaky data, does submit/grade show a
   pending/spinner state and a success/failure result, or can a user tap twice
   thinking nothing happened (→ the duplicate-write races in reliability.md)?
   Missing feedback = **MED**.

## Severity guidance

- Sign-in dead-ends from common arrival paths (in-app browser, iOS): **HIGH**.
- Cryptic errors to students at quota time: **HIGH** (couples with scale axis).
- Mobile layout overflow, onboarding confusion, missing action feedback: **MED**.
- iOS platform limits with no fix available: **LOW / note**, not a finding to
  "fix".
