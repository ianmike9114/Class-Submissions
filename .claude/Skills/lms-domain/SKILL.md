---
name: lms-domain
description: Platform-agnostic LMS business rules — assignment/submission/grading/enrollment workflow, shared by the web app and future React Native mobile app. Use when reasoning about how the app's grading/submission/enrollment logic should behave, independent of which client implements it.
---

# LMS domain rules

Concepts only — not a file/function map. For exact web
file/function locations and the full Firestore schema, see
`.claude/Skills/student-lms/SKILL.md`'s task-map and Data model
sections; this file doesn't duplicate either. For the future mobile
app's own conventions, see `.claude/Skills/react-native-mobile/SKILL.md`.

## Roles

Two roles, no third: **teacher** (owns subjects → sections →
assignments, isolated from other teachers by `ownerEmail`; one
hardcoded super admin, `ADMIN_EMAIL`, can view/act as any teacher) and
**student** (self-enrolls into a section via join code, QR, or teacher
-sent invite; submits work per assignment). No admin role beyond the
single super admin, no TA/co-teacher role.

## Submission is always a link (or in-app photos), never a file upload

A submission is a **link** — Google Doc/PDF, CodePen or GitHub Gist,
Drive, or YouTube. For assignment types "image"/"document" specifically,
a student may instead capture photos in-app (camera or gallery),
compressed and stored inline — still not a generic file-upload feature.
Any client (web or mobile) implementing submission must offer one of
these two paths, never a raw upload to a server.

## Grading is one raw score, not a rubric

Deliberate simplification (see `CLAUDE.md`'s Known v1 limitations):
teacher grades a submission with a single number out of the
assignment's `totalPoints`. An optional Drive/Docs rubric-reference
link may sit alongside the score box for the teacher's own reference —
it's purely visual, never parsed or computed against. Don't build
weighted/per-criterion/transmuted grading into any client without being
explicitly asked — the teacher confirmed raw per-assignment totals are
enough and finalizes grades themselves in the real DepEd Class Record.

## Submission lifecycle

`pending` → `published`. Only the teacher publishes (grades +
reveals score to student). While `pending`, the student may delete
their own submission; once `published`, it's immutable from the
student's side — only the teacher can still delete it outright.

## Enrollment lifecycle

Join (code, QR, or teacher-sent email invite — all three converge on
the same `enroll()` outcome) → optional self-flagged leave request →
teacher either **Removes** (fulfills the leave request or acts
standalone) or leaves it alone (student can cancel their own leave
request). Removing an enrollment **never** cascades to that student's
already-submitted work — those submissions stay in Firestore, just
detached from a live enrollment. If the student rejoins later, old
submissions don't reappear under the new enrollment.

## Multi-teacher data isolation

Every record a teacher creates (or that's created on their behalf, like
a student's submission against their assignment) carries `ownerEmail`.
A teacher's dashboard only ever sees their own data; the super admin
sees all of it and can "view as" any specific teacher. Any new
mobile-side query must respect this same scoping — never query a
collection unfiltered and trust the UI to hide rows, since
`firestore.rules` is the actual enforcement boundary. See
`.claude/Skills/firestore-database/SKILL.md` for the exact mechanics
(`ownerEmail`, legacy-unowned handling, rules).

## Cascade deletes are real and intentional

Deleting a subject, section, or assignment cascades down the full
parent-child chain (subject → sections → assignments → submissions,
plus enrollments). This was a deliberate behavior change (used to be
non-cascading) after a deleted subject kept confusingly reappearing on
students' dashboards. Any client exposing a delete action for these
three entity types must warn accordingly — the web app requires typing
the exact name to confirm (`confirmByTyping()`), specifically because a
misclick can't accidentally retype a name.
