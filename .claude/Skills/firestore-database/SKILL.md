---
name: firestore-database
description: Firestore data modeling, security rules, and multi-tenant isolation patterns for the DepEd Student LMS — the project's only database (no SQL). Use for firestore.rules changes, new Firestore fields/collections, or schema-design questions from either the web app or the future React Native mobile app.
---

# Firestore database conventions

Covers **how** to safely extend the schema and rules — the schema
itself is documented once, canonically, in
`.claude/Skills/student-lms/SKILL.md`'s Data model section. Read that
first for what already exists; this file is about not breaking it when
adding to it.

## Firestore is the only database

No SQL, no ORM. Free Spark plan — no Storage, no Cloud Functions, ever
(hard constraint, see `CLAUDE.md`). Any schema decision needs to work
within plain Firestore documents/collections/queries and client-side
security rules — no server-side triggers or scheduled functions to lean
on.

## Rules are the real access control

`firestore.rules`, not app code, decides who can read/write what. Any
who-can-do-what change goes there — a UI that merely hides a button
isn't access control. After editing `firestore.rules`, deploy
separately: `firebase deploy --only firestore:rules` — a local edit
does nothing in production until that runs, unlike every other change
in this repo, which ships via `git push` alone. Easy to forget; say so
explicitly when handing off a rules change.

## Multi-tenant isolation pattern — reuse it, don't reinvent it

Every top-level collection (`subjects`, `sections`, `assignments`,
`submissions`, `enrollments`) carries an `ownerEmail` field (the
creating teacher's email; for student-created `submissions`/
`enrollments`, copied from the parent assignment/section, not the
student). This is what makes each teacher's dashboard isolated from
every other teacher's.

Docs created before multi-teacher support have **no** `ownerEmail`
field at all, treated as the super admin's via `firestore.rules`'s
`isLegacyUnowned()` and the web app's matching `ownedByViewAs()`. Any
new collection following this pattern should decide up front whether
it can have pre-existing legacy rows to handle the same way, or whether
it's new enough to skip that complexity and require `ownerEmail`
unconditionally.

Client-side list queries should go through a shared owner-scoped helper
(web's pattern: `ownerScopedQuery()`/`ownedByViewAs()` in
`js/teacher.js`) rather than filtering by `ownerEmail` inline per query
— a plain `where("ownerEmail","==",...)` filter silently excludes
legacy unowned docs, which is wrong for the super admin's view. A
mobile client adding equivalent queries should build (or share, if
code is ever extracted to a common package) the same kind of helper
rather than filtering ad hoc per screen.

## Known, deliberate read-access gap

`subjects`/`sections`/`assignments` stay readable by any signed-in user
— not owner-locked on read — since they hold no grades or student PII
(only `submissions`/`enrollments` do, and those *are* fully owner-scoped
on read). This is accepted, not accidental: a fully locked-down version
would need splitting join-code lookup into a separate world-readable
`joinCodes` collection. Don't tighten this without flagging it first —
see `CLAUDE.md`'s Known v1 limitations.

## Document size budget

Firestore caps a single document at 1MiB. Already hit once:
`submissions.photoPages` (in-app photo capture) is capped at
`MAX_PHOTOS` (10) pages, each compressed to `PER_PHOTO_MAX_LEN`
(100,000 chars), specifically so the array stays under the cap
alongside the rest of the submission's fields. Any new feature storing
an array or blob-like field on a doc needs this same budget math done
up front — work out the per-item cap and the max item count together,
don't discover the 1MiB ceiling via a failed production write.

## Cascade-delete pattern

Parent → child collection chains (subject → sections → assignments →
submissions, plus enrollments per section) delete together, built on a
shared `deleteWhere(collection, field, value)` helper in `js/teacher.js`
rather than bespoke per-entity delete logic. Any new hierarchical
collection added to the schema should extend this same helper instead
of writing a new cascade path from scratch. No `firestore.rules` change
needed purely to support a cascade — delete is already teacher/owner-only
on all four collections.

## Schema changes checklist

When adding a new field or collection:

1. Does it need `ownerEmail`? (Almost always yes, for anything
   per-teacher — see isolation pattern above.)
2. Does it need a `firestore.rules` block, or does it fit inside an
   existing collection's rules? Deploy rules separately after.
3. Any array/blob field — work out the 1MiB budget before shipping.
4. Update `.claude/Skills/student-lms/SKILL.md`'s Data model section —
   that's the single canonical schema doc; don't let a second copy
   drift in this file or elsewhere.
