---
name: ui-ux-playbook
description: The standing UI/UX bar for this LMS — the real teacher, student, and super-admin use-case flows, plus the usability heuristics and review checklist every UI change is judged against, so new work is obvious to low-tech DepEd teachers and students on phones. Use before designing or reviewing any UI change, when a critique says the flow "isn't clear / not graspable" or asks for "best UI/UX", or when adding a screen/form/flow and you want it to fit the system.
---

# UI/UX playbook

The users are **DepEd teachers and students**, often low-tech, frequently on
**phones**. The bar: a first-time user should understand what to do without
being told. This skill holds the app's **use-case flows** + the
**heuristics** and **checklist** to judge any change against. Craft/tokens
live in `DESIGN_SYSTEM.md`; responsiveness in `[[responsive-design]]`; this
is the *behavior/flow* layer on top.

## 1. The real use-case flows (design to these, don't break them)

- **Teacher:** sign in → (sidebar) Home → create Subject → Section → post
  Assignment/Material → share join code / QR → grade submission → Publish.
- **Student:** sign in / scan QR → join by code → open assignment from the
  Course outline → read material inline → submit link or photos → see grade
  + feedback → (if needed) Request to redo.
- **Super admin:** Overview → read per-teacher counts → Open a teacher, or
  search the student directory → View-as-student (read-only).

Every new screen must say **where it sits** in one of these flows. If it
doesn't fit a flow, question whether it belongs.

## 2. Heuristics (the bar)

1. **One primary action per screen.** Make it the blue button; everything
   else is `secondary`. Don't present ten equal buttons (the old header
   problem the sidebar fixed).
2. **Progressive disclosure.** Long/optional forms go in `<details class=
   "card">`; ask type/intent *first*, then show only the fields that type
   needs (see `[[classroom-material-flow]]`).
3. **Name things by what the user recognizes** — "Add student", "Publish",
   "Join a class" — not by how the data is stored.
4. **State is visible.** Use `status-pending/returned/published` pills and
   count badges so "what needs attention" reads at a glance.
5. **Every list has a real empty state** — a `.muted` line that says what to
   do next, never a blank area that reads as broken.
6. **Confirm destructive actions**, type-to-confirm for cascades
   (`confirmByTyping()`); never a bare button that wipes a tree.
7. **Errors explain + recover** — plain language, the fix, no code dumps
   (see `showConnectionError()` and `[[tagalog-error-triage]]`).
8. **Phone-first**: reachable tap targets, no horizontal page scroll, wide
   content scrolls in its own box. Verify with `[[responsive-audit]]`.
9. **No dead ends.** Every view has a Back / Home path (sidebar always
   present).

## 3. Review checklist (run before shipping any UI change)

- [ ] Fits a named use-case flow; the primary action is obvious.
- [ ] Optional fields hidden until needed; not a wall of inputs.
- [ ] Labels/buttons in user language; button says exactly what happens.
- [ ] Empty, loading, and error states all present and helpful.
- [ ] Works at 375px (no h-scroll, tap targets OK) — `[[responsive-audit]]`.
- [ ] Reuses design-system pieces (`.card`, `status-*`, primary/secondary),
      no new colors/breakpoints (`DESIGN_SYSTEM.md`).
- [ ] Cache-buster `?v=` bumped on changed css/js in every HTML.

## 4. Build with

`[[frontend-editing]]` (craft), `[[student-lms]]` (where-to-edit),
`[[responsive-design]]` + `[[responsive-audit]]` (mobile),
`[[classroom-material-flow]]` (the create-flow redesign). Origin of the
"best UI/UX" ask: `[[pangasinan-feedback-triage]]`.
