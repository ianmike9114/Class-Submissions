---
name: classroom-material-flow
description: Playbook for making instructional-material creation and the teacher's create-flow in this LMS work like Google Classroom — clear "pick a type first" flow, a real Material post type (not just a link field), managed reorderable Topics instead of typo-prone free text, and a reorderable stream — mapped onto this app's zero-cost, links-only, Firestore-only constraints. Use when improving how teachers post materials/assignments, when a critique says the user flow "isn't clear" or "should be like Google Classroom", or before redesigning the Add-assignment flow.
---

# Classroom-style material flow

A developer critiqued this LMS: the teacher's **user flow isn't
immediately graspable**, and **instructional-material creation should work
like Google Classroom**. This skill is the playbook for closing that gap —
what to build, grounded in the app's real code and its hard constraints. It
is the design target; when asked to actually build it, hand off to the
implementation skills in section 5.

## 1. What exists today (real code — verify before trusting line numbers)

- **One post type only.** A teacher creates an *assignment* via
  `#add-assignment-form` (`teacher.html`) → handler around
  `js/teacher.js:1764-1788`. The Firestore doc (approx `js/teacher.js:1769`)
  carries: `title, lesson, instructions, instructionsLink, uploadFolderLink,
  component ("written"|"performance"), dueDate, allowedFileTypes, totalPoints,
  rubricReferenceLink, createdAt, ownerEmail/sectionId/subjectId`.
- **"Material" is not an entity — it's link fields.** On the student card,
  `materialBlock()` (`js/student.js:697-723`) renders either the dedicated
  `instructionsLink` **or** the first embeddable URL scraped from the
  free-text `instructions`, via `embedBlockFor(url, { variant: "material" })`
  inside a `.material-viewer`. There is **no** `materials` collection and
  **no** `type` field.
- **Grouping = one free-text string.** The student course outline
  (`renderOutline()` `js/student.js:591-631`) groups by subject, then by the
  per-assignment free-text `lesson` field (`js/student.js:604-610`),
  defaulting to `"General"`. Typos make separate groups; there is no shared
  topic entity.
- **No ordering.** Both the teacher loader (`js/teacher.js:1716-1723`) and
  student loader (`js/student.js:364-376`) consume `snap.docs` in raw
  Firestore order. `createdAt` exists but drives only the "New" badge
  (`js/student.js` ~263/415), never a sort. A teacher **cannot reorder**.

## 2. The Google Classroom gap

| Classroom has | This app has | Consequence |
|---|---|---|
| First-class, reorderable **Topics** | one free-text `lesson` string | typo-split groups, no order |
| **Material / Assignment / Question** post types | one `assignments` collection | pure reading material must masquerade as a (points-bearing) assignment |
| Drag-**reorderable** stream | raw Firestore order | teacher can't sequence lessons |
| Multiple **attachments** per post | fixed single link slots | one material link per post |
| "**+ Create → pick type**" flow | one ~10-field form | the "user flow isn't graspable" complaint |

## 3. Target model — mapped onto THIS app (zero-cost, links-only)

Build these incrementally; each stands alone.

1. **"Pick a type first" create flow (highest value, lowest risk).**
   Replace the single crowded `#add-assignment-form` with a small chooser —
   **Material** vs **Assignment** — Classroom-style, then show only the
   fields that type needs. Directly answers "user flow not immediately
   graspable." Reuse the sidebar shell already shipped; keep it to
   `css/style.css` + `teacher.html` + `js/teacher.js`.
2. **Material post type.** Add `type: "material"` to the `assignments` doc
   (default existing docs to `"assignment"`). A material has title +
   attachment link(s) + topic, **no** `totalPoints`, **no** submission UI.
   Student side: render its `materialBlock()` but skip the submit form and
   the grade panel. Reuse `embedBlockFor(... variant:"material")` unchanged.
3. **Managed, ordered Topics.** Promote `lesson` from free text to a picked
   topic: keep a small ordered `topics` array on the **section** doc (or a
   `topicId` + tiny `topics` set) and give the teacher a topic dropdown +
   "add topic" instead of a text box. Grouping becomes reliable and
   orderable; migrate existing `lesson` strings into topics on first edit.
4. **Reorderable stream.** Add an integer `order`/`position` field; sort
   both loaders by it; add up/down (or drag) controls in the teacher list.
   Backfill existing docs from `createdAt` once.
5. **Multiple attachments (optional).** Allow an array of links per post
   instead of the single `instructionsLink`, rendered as stacked
   `.material-viewer` blocks.

## 4. Constraints that cannot be broken

- **No Firebase Storage, no Cloud Functions** — links (Drive/Docs/YouTube/
  Gist) + existing in-app photo capture only. A "material" is a link, never
  an uploaded file.
- **Firestore-only**, free Spark plan. Mind read-quota: don't add per-post
  fan-out queries; a `type`/`order`/`topicId` field on the existing
  `assignments` doc adds **zero** extra reads.
- **`firestore.rules` is the real gate.** A material post can reuse the
  `assignments` rules; if you add fields, keep create/update rules
  owner-scoped exactly as assignments are. Any new collection needs its own
  match block. See `[[firestore-database]]`.
- **One `css/style.css`, one `@media (max-width:640px)` breakpoint**, no
  framework; **bump the `?v=` cache-buster** on every changed
  css/`teacher.js`/`student.js` in every HTML that references it.
- **Don't** build DepEd WW/PT weighted-grade math or re-add removed features
  (see `CLAUDE.md`) as a side effect.

## 5. When asked to implement

Hand off, don't reinvent:
- `[[student-lms]]` — the where-to-edit task map + Firestore schema.
- `[[frontend-editing]]` — smallest-diff craft, helper reuse, cache-buster.
- `[[lms-domain]]` — assignment/submission/grading workflow rules a Material
  type must respect (material = no submission, no grade).
- `[[firestore-database]]` — new field/collection + rules changes.
- `[[responsive-design]]` — the new create flow must work at 640px.

Interpretation of the original (Pangasinan) critique that motivated this:
see `[[pangasinan-feedback-triage]]`.
