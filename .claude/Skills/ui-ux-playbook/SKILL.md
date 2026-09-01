---
name: ui-ux-playbook
description: The standing UI/UX flow bar for this LMS — the real teacher, student, and super-admin use-case flows, plus the usability heuristics (mapped to Nielsen's 10) every UI change is judged against, so new work is obvious to low-tech DepEd teachers and students on phones. Use before designing or reviewing any UI change, when a critique says the flow "isn't clear / not graspable / not obvious" or asks for "best UI/UX", or when adding a screen/form/flow and you want it to fit the system. For whether it LOOKS clean (spacing, hierarchy, polish, tap targets), pair with [[clean-ui-craft]].
---

# UI/UX playbook (flow & behavior)

The users are **DepEd teachers and students**, often low-tech, frequently on
**phones**. The bar: a first-time user should understand what to do without
being told. This skill is the **flow/behavior** layer — the app's use-case
flows plus the heuristics to judge *what a screen does* against. Two sibling
layers own the rest: `[[clean-ui-craft]]` judges whether it **looks** clean
(spacing, hierarchy, type, tap targets, polish) on desktop and phone;
`DESIGN_SYSTEM.md` holds the tokens; `[[responsive-design]]` the mechanics.

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

## 2. Heuristics (the bar — each maps to a named standard)

These aren't preference; they're the recognized usability rules applied to
this app. The tag after each is its origin (Nielsen = Nielsen Norman's 10
usability heuristics).

1. **One primary action per screen.** Make it the blue button; everything
   else is `secondary`. Don't present ten equal buttons (the old header
   problem the sidebar fixed). *(Visual hierarchy / Fitts's law — the main
   action should be the easiest thing to find and hit.)*
2. **Progressive disclosure.** Long/optional forms go in `<details class=
   "card">`; ask type/intent *first*, then show only the fields that type
   needs (see `[[classroom-material-flow]]`). *(Nielsen #8, aesthetic &
   minimalist — don't show a field before it's relevant.)*
3. **Name things by what the user recognizes** — "Add student", "Publish",
   "Join a class" — not by how the data is stored. *(Nielsen #2, match
   between system and the real world.)*
4. **State is visible.** Use `status-pending/returned/published` pills and
   count badges so "what needs attention" reads at a glance. *(Nielsen #1,
   visibility of system status.)*
5. **Every list has a real empty state** — a `.muted` line that says what to
   do next, never a blank area that reads as broken. *(Nielsen #1 + #10,
   help — the empty state is where a first-timer learns the next step.)*
6. **Confirm destructive actions**, type-to-confirm for cascades
   (`confirmByTyping()`); never a bare button that wipes a tree. *(Nielsen
   #5, error prevention.)*
7. **Errors explain + recover** — plain language, the fix, no code dumps
   (see `showConnectionError()` and `[[tagalog-error-triage]]`). *(Nielsen
   #9, help users recognize/recover from errors.)*
8. **Phone-first, comfortably tappable.** Reachable tap targets (**≥44px**,
   per WCAG 2.5.8 AAA / Apple HIG — this app serves children on phones, so
   the 44px bar, not the 24px AA floor), no horizontal page scroll, wide
   content scrolls in its own box. Build per `[[clean-ui-craft]]` §5, verify
   with `[[responsive-audit]]`. *(Accessibility standard, not taste.)*
9. **No dead ends.** Every view has a Back / Home path (sidebar always
   present). *(Nielsen #3, user control and freedom.)*

Coverage note: the app's flows are checked against **all 10 Nielsen
heuristics** — #4 (consistency) and #6 (recognition over recall) are held by
reusing one component vocabulary (`DESIGN_SYSTEM.md`) and the always-present
sidebar; #7 (flexibility) is the QR/join-code/invite alternatives to the
same enroll action.

## 3. Review checklist — flow (run before shipping any UI change)

- [ ] Fits a named use-case flow; the primary action is obvious.
- [ ] Optional fields hidden until needed; not a wall of inputs.
- [ ] Labels/buttons in user language; button says exactly what happens.
- [ ] Empty, loading, and error states all present and helpful.
- [ ] No dead end — a Back/Home path is always reachable.
- [ ] Then run the **visual** pass in `[[clean-ui-craft]]` §7 (clean +
      tap targets at desktop AND 375px) and `[[responsive-audit]]` to measure.
- [ ] Reuses design-system pieces (`.card`, `status-*`, primary/secondary),
      no new colors/breakpoints (`DESIGN_SYSTEM.md`).
- [ ] Cache-buster `?v=` bumped on changed css/js in every HTML.

## 4. Build with

`[[clean-ui-craft]]` (does it look clean on both viewports),
`[[frontend-editing]]` (craft/diff), `[[student-lms]]` (where-to-edit),
`[[responsive-design]]` + `[[responsive-audit]]` (mobile mechanics + verify),
`[[classroom-material-flow]]` (the create-flow redesign). Origin of the
"best UI/UX" ask: `[[pangasinan-feedback-triage]]`.
