---
name: responsive-design
description: How to keep this static LMS site responsive on desktop AND mobile when editing HTML/CSS/JS — the repo's actual responsiveness rules (one 640px breakpoint, fluid-by-default, wide content scrolls in its own box, dropdowns JS-clamped to the viewport) and the fixed-width traps that have broken layout before. Use when adding/changing any UI that must work on phones, when a page "isn't clean" / overflows / doesn't adjust on mobile, or before shipping a layout change. Pair with [[responsive-audit]] to verify.
---

# Responsive design (this static site)

The **build-it-right** layer for responsiveness. [[frontend-editing]] says how to
edit cleanly and [[responsive-audit]] finds breakage after the fact — this skill
is the rules that keep a new UI responsive in the first place. All layout lives in
one file, `css/style.css` (no framework). Read `DESIGN_SYSTEM.md` for the
component/token vocabulary before styling anything.

## The approach this codebase uses (follow it, don't fight it)

1. **Fluid by default, not breakpoint-by-breakpoint.** Form controls
   (`input/select/textarea`) are globally full-width; `.card`/`main` have no
   fixed width; headers use `display:flex; flex-wrap:wrap`. New UI should inherit
   this — lay it out with flex/grid + relative units and it degrades on its own.
2. **One breakpoint only: `@media (max-width: 640px)`.** It already exists in
   `css/style.css`. **Extend that block; do not add a second breakpoint.** If a
   thing needs per-width behavior, prefer a fluid rule (flex-wrap, `min()`/`clamp()`,
   `overflow-x:auto`) that needs no query at all. A second breakpoint is a smell
   here — the whole app is tuned to degrade continuously and stack once at 640.
3. **Wide content scrolls in its own box — the page never scrolls sideways.**
   Any element wider than a phone (tables, code, diagrams, a QR row) goes inside
   an `overflow-x:auto` wrapper. `.records-grid` is the reference:
   `display:block; overflow-x:auto` with `white-space:nowrap` cells. Never let
   wide content push `document.body` past the viewport (that's the #1 "not clean"
   symptom — see [[responsive-audit]]).
4. **Position floating panels from JS, clamped to the viewport.** Header
   dropdowns (`.notif-dropdown`: notifications, photo ZIPs, global search) are
   `position:fixed` and placed by `positionDropdown(anchorEl, dropdownEl)` in
   `js/teacher.js` on open — it reads the trigger's rect and clamps `left` into
   `[8px, innerWidth - width - 8px]`. Any new pop-over/menu in the header must use
   this, **not** `position:absolute; right:0` (that grew off-screen once the flex
   header wrapped — the original notification bug). Reuse `positionDropdown`;
   don't hand-roll anchoring.

## Fixed-width trap registry (these break narrow — handle each)

| Thing | Where | How it's kept safe |
|---|---|---|
| Wide tables (records, enrolled, master lists) | `.records-grid` etc. | `overflow-x:auto` scroll box + `white-space:nowrap` cells |
| Header (3 flex groups + search) | `header`, `.hdr-group`, `.hdr-search` | `flex-wrap:wrap`; stacks at 640; dropdowns JS-clamped |
| Header dropdowns | `.notif-dropdown` | `position:fixed` + `positionDropdown()` |
| Content column | `main { max-width: 900px }` | fluid below that; fine on phones |
| Course outline sidebar | `#course-outline { flex: 0 0 230px }` | collapses to a static full-width panel at 640 |
| Embeds | `.submission-preview` (fixed px) | switched to `vh` heights at 640 |
| Account avatar | `.hdr-avatar` (2rem circle) | fixed but tiny; `img` uses `object-fit:cover` |

When you add a new wide or interactive element, decide which row it resembles and
apply the same treatment **before** shipping.

## Recipe for a new responsive element

- Prefer flex/grid + `flex-wrap`, `max-width:100%`, and `min()`/`clamp()` widths.
- Images/iframes: `max-width:100%`; give iframes a `vh` height at 640 if fixed px.
- Anything that can exceed ~360px wide and can't wrap: wrap in `overflow-x:auto`.
- A header pop-over/menu: `position:fixed` + `positionDropdown()`.
- Only if truly unavoidable, add rules **inside** the existing `@media (max-width:640px)`
  block — never a new breakpoint.
- Bump the `?v=` cache-buster for every changed `css/style.css` / `js/*.js` in
  **all** referencing HTML files (see [[frontend-editing]]).

## Verify (don't assume)

- `python -m http.server 8420` from repo root; open the changed view.
- Browser MCP `resize_window` presets: `mobile` (375), `tablet`, `desktop`, and a
  **~900px wrap-zone** width (where the header wraps but the 640 rule is off — the
  dead zone the notification bug lived in). Reload after resizing.
- Auth-gated pages (`teacher.html`/`student.html`) need a signed-in session —
  use Claude-in-Chrome on the deployed site, or a throwaway harness that links the
  real `css/style.css` (delete it after). See [[frontend-editing]]'s verify section.
- Then run [[responsive-audit]] for a measured desktop+mobile sweep.
