# Spark read budget and caching

Deliberate design decisions and known limits. Moved out of `CLAUDE.md` so they load only
when needed. Read before editing this area; add new notes for this area here.

- **Never download whole `submissions` just to count or search.** Submission
  docs carry base64 photo pages (up to ~1 MB each), so an all-submissions read
  pulls megabytes. Home's "N missing" badge (`getMissingWorkCounts()`) counts
  submitters server-side with `getCountFromServer` (one owner-scoped count per
  past-due assignment); the header search (`searchGlobally()`) fetches its
  corpus once via `getSearchCorpus()` (cleared by `invalidateReadCache()`) and is
  debounced 250ms. Both replaced reads that made the teacher Home slow (and,
  for search, re-downloaded every submission site-wide on each keystroke for
  the super admin). Remaining full reads (photo-ZIP panel, Overview's
  not-responding list) genuinely need the docs or are off the Home path.
- **Student assignment cache + `assignmentsVersion` marker (Spark read
  budget).** `js/student.js`'s `loadEverything()` runs on every load and after
  every student action; it used to re-read every assignment and every
  submission ever (~174 reads/load, ~72 students/day on Spark). Now
  `js/assignment-cache.js` keeps each section's assignments in localStorage
  (`lms.asgCache.<uid>`, memory-only in "View as", cleared by
  `signOutUser()`) and refetches a section only when its
  `sections/{id}.assignmentsVersion` changed, it has no entry, or the entry is
  older than 6h. **Every assignment add/edit/delete path in `js/teacher.js` must
  call `touchSection(sectionId)`** (currently: add, failed-quiz cleanup, edit,
  delete, bulk due date, topic rename) - a missed path leaves students on the
  old list for up to 6h. Submissions are read only for the shown assignments
  (`assignmentId` 'in' chunks, falls back to the full query on any error), and
  the hidden-class lookup (`getHiddenSectionIds()`, now also returning the
  section docs it read so sections are read once) is reused in memory for 10
  min while the enrolled-section set is unchanged (the **Refresh button
  bypasses it** - `refreshFresh()` - else a new quiz stayed hidden up to 10
  min even after Refresh; **live updates**: `watchSections()` keeps an
  `onSnapshot` on the student's visible section docs - 1 read per class at
  start + 1 per change per open page - and when `assignmentsVersion` differs
  from what was rendered, `onNewWork()` refreshes the list by itself, or shows
  a "New work" notice if `studentIsBusy()` (quiz open, focused/typed field,
  picked file/photos) so nothing typed is wiped. Skipped in View-as. This is
  the one deliberate `onSnapshot` in the app). No rules change (section
  update is already owner-allowed), no new index. Estimate: `npm run budget`.
- **Teacher read cache: structure vs inbox (Spark read budget).** In
  `js/teacher.js`, `cachedOwnerDocs()` keys `subjects`/`sections`/`assignments`
  live 10 min (`js/teacher-reads.js` `ttlForKey()`); everything else (pending
  submissions, leave/join/seen/redo enrollments) stays 3 s and is re-pulled by
  each `refreshNotifications()` (`invalidateInbox()`). **Every write that adds,
  renames or deletes a subject/section/assignment or changes an enrollment's
  headcount must call `invalidateStructure()`** (assignment writes get it via
  `touchSection()`); `getNotifications()` self-heals once per 10 min if the
  inbox mentions an id the cached structure lacks. `getMissingWorkCounts()`
  counts only subjects the grid shows, gets headcounts via two `count()`s per
  section (falls back to the old enrollment scan) and is cached 15 min.
  `loadSubmissions()` memoizes its fetch (`subsMemo`): Publish/Return/filter
  re-render from memory with the saved submission patched in, and the bell
  updates locally (`resolvedLocally`) instead of re-reading the class + all
  notifications (~200 reads per score before). The Refresh button clears all.
- **Student own-submissions cache + `enrollment.subsVersion` marker.**
  `js/student.js` caches each section's own submissions (`lms.subCache.<uid>`,
  1h TTL, photo-heavy sections dropped by `fitToBudget()`) and refetches a
  section only when its enrollment's `subsVersion` changed or this page wrote
  to it. **Every teacher write that changes what a student sees on a
  submission must call `touchStudentSubs(studentUID, sectionId)`** (publish,
  return, allow redo, delete, quiz retake today); the student's own writes call
  `afterOwnSubmissionWrite()`, which stamps their own enrollment.
  `firestore.rules` adds `'subsVersion'` to the student self-update `hasOnly`
  list - **must `firebase deploy --only firestore:rules`** (until then the
  stamp is refused and other devices catch up within 1h). Subjects + term
  settings behind `getHiddenSectionIds()` are cached 30 min
  (`lms.termCache.<uid>`), so an archive/term switch reaches students within
  30 min. Sign-out clears all `lms.*Cache.*` stores.
- **Per-assignment delta (`sections/{id}.assignmentVersions`).** The section
  doc carries `{ assignmentId: timestamp }` plus `assignmentVersionsComplete`;
  `js/teacher.js` `touchSection(sectionId, { changed, deleted })` maintains it
  (**new assignment write paths must pass the ids**) and
  `backfillAssignmentVersions()` writes the full map once when a teacher opens
  the section. Students (`js/assignment-cache.js` `assignmentDelta()`) then
  re-read only changed/new ids via `where(documentId(), "in", ...)` and drop
  deleted ones; sections without a complete map keep the whole-class refetch on
  `assignmentsVersion` change. No rules change, no index.
- Real-time listeners (`onSnapshot`) only for the student's own class docs
  (new-work detection, see "Student assignment cache" below); everything else
  refreshes on load/action.
