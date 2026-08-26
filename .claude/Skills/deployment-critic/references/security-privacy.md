# Security + student privacy

Real access control is `firestore.rules`, **not** frontend JS. A locked-down UI
over open rules is not secure — always judge against the rules file. At 600
students this holds actual minors' names and work, so PII exposure is
BLOCKER-class.

## Checklist

1. **Rules are the source of truth.** Read `firestore.rules`. For every
   collection confirm read/write/delete are gated by `isTeacher()` /
   `canActAsOwner()` / owner-email match, not left open. UI-only restrictions
   that the rules don't enforce = **BLOCKER** (any signed-in user can hand-craft
   a query and bypass the UI).

2. **Owner-scoped reads on PII collections.** `submissions` and `enrollments`
   carry grades + student names → must be fully owner-read-locked (teacher owns,
   or the student themselves). Verify. Any path letting one teacher read
   another's submissions/enrollments = **BLOCKER**.

3. **Documented world-readable gap.** `subjects`, `sections`, `assignments` are
   readable by *any* signed-in user (needed for join-code lookup). Documented +
   accepted for v1 because they hold no grades/PII — only class/subject names.
   **Re-judge at 600-student scale:** a sophisticated user in one school could
   list every teacher's subject/section names across the whole deployment.
   Report as **MED** (info leak, no PII) unless section/assignment names
   themselves encode something sensitive in this deployment — then **HIGH**.
   The lock-down would require splitting join-code lookup into a separate
   world-readable `joinCodes` collection; note that as the fix, don't hand-wave.

4. **`invites` rules.** create = teacher/owner only; read/delete = owning
   teacher **or** the invited student (email match on auth token). Confirm the
   email match is on the *token* (`request.auth.token.email`), not on a
   client-supplied field — otherwise a student could consume others' invites.

5. **Admin-email drift.** `ADMIN_EMAIL` (super admin) is duplicated **on
   purpose** in two places: `firestore.rules` and `js/firebase-config.js`. If
   they disagree, rules and UI enforce different admins → **HIGH**. Grep both;
   confirm identical.

6. **No PII in URLs / QR / logs.** Join links (`student.html?code=...`) carry a
   join code, not PII — good. Confirm nothing pushes student email/name/UID into
   query strings, and QR is generated **client-side** (`renderSectionQR()` via
   `qrcodejs`), never sent to a third-party QR image API (that would leak join
   codes off-site). Any `console.log` of full student records shipped to prod is
   MED (visible in shared-device browser consoles).

7. **Sign-in provider assumptions.** Rules key off `email` / `email_verified` /
   `uid` only, never `sign_in_provider` — so Google and email-link both work.
   Confirm no rule silently trusts an unverified email.

## Severity guidance

- Any cross-teacher read of grades/PII, or UI-only "security": **BLOCKER**.
- Admin-email drift, invite-consumption hole: **HIGH**.
- The known subjects/sections/assignments name leak: **MED** (default) —
  document, don't panic; note it's a deliberate v1 tradeoff.
