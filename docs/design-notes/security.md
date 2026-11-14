# Security

Deliberate design decisions and known limits. Moved out of `CLAUDE.md` so they load only
when needed. Read before editing this area; add new notes for this area here.

## What `firestore.rules` enforces (the real access control)

- **Owner isolation:** every teacher sees only their own subjects/sections/assignments/
  submissions/enrollments; the super admins see all. LIST rules keep the direct
  `resource.data.ownerEmail == request.auth.token.email` form (the query analyzer needs it).
- **Submission create:** `ownerEmail` must be the assignment's real owner (legacy assignments
  without one default to the super admin); only the field list the two client create paths write;
  `link` < 2000 chars; `photoPages` a list of at most 15; no grading fields; status `pending`.
  One doc per student per assignment (id `assignmentId_uid`) — with a TEMPORARY exception for
  stale pages (see `access-enrollment-deletes.md`).
- **Enrollment create:** id `sectionId_uid`, real section owner, status `pending` unless the
  teacher invited that exact email (`invites/{sectionId}_{email}` exists). Students cannot
  self-approve and cannot stamp another teacher's email.
- **Student updates** are field-limited (`hasOnly`) with simple type/size checks.
- Lookups per request stay small (`get`/`exists` well under the 10-per-request cap).

## Known residual (not fixed)

Any signed-in Google account can still read `assignments` and single `sections` docs (including
roster names) if it has the ids. Closing that needs moving the roster into an owner-only doc —
a separate task.

## Headers (`vercel.json`)

`X-Content-Type-Options`, `Referrer-Policy`, `Strict-Transport-Security`, `X-Frame-Options:
SAMEORIGIN`, `Permissions-Policy`, and **`Content-Security-Policy-Report-Only`** built from the
hosts the HTML/JS actually reference (gstatic/Firebase, Google sign-in, jsDelivr, cdnjs, SheetJS,
Fonts, Wandbox, Groq/Gemini, EmailJS, Drive/Docs/YouTube/CodePen embeds). It is **report-only**
on purpose: watch the browser console on real pages, add any missing host, and only then switch
the key to `Content-Security-Policy`. Do not enforce before that. `version.json` is `no-store`.

## Console checklist (also applies to the graduate tracer)

- **Firebase App Check** (reCAPTCHA v3, free on Spark): register the web app, monitor, and
  enforce only after stale pages are gone.
- **Google Cloud Console → Credentials:** restrict the Web API key to the site's HTTP referrers
  and to the APIs the app needs.
- **Firebase Auth:** authorized domains = real domains only (and the OAuth client's authorized
  JavaScript origins likewise).
- **Rules:** deny by default, validate owner and field lists on every create, never trust
  client-side role checks, keep the rules tests green (`npm run test:rules`).
- **Backups:** Spark has no scheduled backup — run a manual Firestore export monthly.
- **Secrets:** none in the repo; the Gemini/Groq key stays in the teacher's browser only.

## Deploy order

Push the client first, **then** `firebase deploy --only firestore:rules`. A rules change is not
live until deployed.
