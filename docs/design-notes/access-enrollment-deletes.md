# Access, enrollment and deletes

Deliberate design decisions and known limits. Moved out of `CLAUDE.md` so they load only
when needed. Read before editing this area; add new notes for this area here.

- **Multi-teacher isolation is write-side and submissions/enrollments-read
  enforced, not fully read-locked on `subjects`/`sections`/`assignments`.**
  Those three collections stay readable by any signed-in user (unchanged
  from single-teacher version) — technically sophisticated other teacher
  could hand-craft raw query to list subject/section names across
  teachers. No grades or student PII in those collections (that's
  `submissions`/`enrollments`, which *are* fully owner-scoped on read);
  accepted rather than splitting join-code lookup into separate
  world-readable `joinCodes` collection, which true list-level lock-down
  would require. Flag if this ever needs to change.
- **Deleting subject, section, or assignment cascades** —
  `js/teacher.js`'s `cascadeDeleteSubject()`/`cascadeDeleteSection()`/
  `cascadeDeleteAssignment()` (built on shared `deleteWhere(collection,
  field, value)` helper) walk down same parent-child chain rest of app
  queries by and delete everything under thing deleted: subject → its
  sections → their assignments → their submissions, plus enrollments per
  section. Used to be non-cascading by design (documented as deliberate)
  until deleted subject kept showing up on student's dashboard — real
  confusion, not hypothetical, so changed to true cascade. No
  `firestore.rules` change needed (delete on all four collections
  already `isTeacher()`-only).
- **Deleting subject/section/assignment requires typing its exact name.**
  `js/teacher.js`'s `confirmByTyping()` replaced plain `confirm()` on
  those three cascade deletes only (not lower-stakes "remove one
  enrollment" or "remove teacher's access", which stay single `confirm()`
  — those don't wipe whole tree of records). Teacher asked for stronger
  protection against misclicks; mistaken click can't accidentally retype
  name, unlike clearing OK/Cancel dialog.
- Removing single enrollment ("Remove" button in Enrolled Students,
  `js/teacher.js`) still only deletes that one `enrollments` doc —
  narrower, still-deliberate case, not same as subject/section/
  assignment cascade above (removing one enrollment shouldn't touch
  student's actual submitted work). Any submissions student already made
  under that enrollment untouched and still exist, just no longer tied
  to live enrollment; if they rejoin (even picking different roster
  name), those old submissions won't reappear under new enrollment. Flag
  if this ever needs to change.
- **Teacher can decline a leave request without removing the student.**
  On a flagged `leaveRequested` row in Enrolled Students, `js/teacher.js`'s
  `openEnrolled()` renders a **"Keep in class"** button
  (`data-decline-leave`) beside the ✕ Remove; its handler writes
  `leaveRequested: false` on that enrollment (owner write already allowed by
  `firestore.rules`'s `canActAsOwner`, so **no rules change**). The student
  keeps their enrollment and all submitted work, and can request to leave
  again. (Previously the only responses were Remove or ignore; added by
  request.) The student's own "Cancel leave request" toggle
  (`js/student.js`) still exists too.
- **Teacher can delete any single submission directly**, via `Delete`
  button in `js/teacher.js`'s `loadSubmissions()` row, gated by existing
  `confirmByTyping()` (type student's name to confirm, same pattern as
  section/assignment cascade deletes). No `firestore.rules` change
  needed — delete rule on `submissions` already lets `canActAsOwner`
  delete regardless of `status`.

- **Enrollment create is rule-checked (2026-11).** `enrollments/{id}` create requires id
  `sectionId_uid`, `ownerEmail` equal to the section's real owner (`get(sections/..)`, legacy
  sections with no `ownerEmail` default to the super admin, as the client does), and
  `status` `"pending"` unless `exists(invites/{sectionId}_{lowercased email})` — only then
  `"approved"`. So invites are now written with id `sectionId_email` (`inviteDocId()` in
  `js/shared.js`; `js/teacher.js` invite form + `inviteStudentsToSection()`), and
  `applyPendingInvites()` enrolls **before** deleting the invite. An old random-id invite
  cannot prove itself, so it is enrolled as `"pending"` (teacher approves). Pages from before
  2026-09-09 that write no `status` are rejected on purpose (a missing status counts as
  approved everywhere). No `keys().hasOnly()` on enrollment create, so older field sets still
  work. Student self-update also type/size-checks `studentName` and `doneMaterials`.
- **Submission create is rule-checked (2026-11).** `ownerEmail` must equal the assignment's real
  owner, the key set is limited to what the file and quiz create paths write (plus legacy
  `photoData`), `link` < 2000 chars, `photoPages` a list of at most 15; the student update
  rule has the same size checks. **TEMPORARY:** the id may be any id while no doc exists at
  `assignmentId_uid` (so pages from before #94, which still `addDoc`, can submit); remove that
  `|| !exists(...)` clause from the `submissions` create rule once stale pages are gone (about
  2–3 weeks after deploy). `js/student.js` `createSubmission()` retries a refused create as the
  allowed in-place update when a pending/returned doc already exists.
