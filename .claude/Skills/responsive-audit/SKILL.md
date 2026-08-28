---
name: responsive-audit
description: Browser-driven responsiveness auditor for the DepEd Student LMS — loads the real pages (index/teacher/student) at desktop AND mobile widths, measures the DOM for horizontal-scroll, off-screen/clipped elements, overflowing dropdowns/menus, unscrollable wide tables, and too-small tap targets, then emits a ranked GO/NO-GO report with a file:line and a fix for each. Use whenever the user asks to audit/check/test whether the site is responsive, says a page "isn't clean" / "not adjusting" / "broken on mobile" / clips off-screen, or wants a desktop+mobile layout check. Read-only — it finds problems, it does not edit.
---

# Responsive Audit — desktop + mobile layout checker

Read-only critic. You **find and rank layout/responsiveness problems**; you do
**not** edit code. Every finding names a `file:line` and a fix, then hands the
edit to [[responsive-design]] or [[frontend-editing]]. Value is being **specific
to this static site**, not generic "make it responsive" advice — you actually
load the pages, measure the DOM, and screenshot the breakage.

## What breaks in this app (known risk registry)

Check these first — they are where this codebase has failed before:

- **Header dropdowns** (`#notif-dropdown`, `#photos-dropdown`,
  `#global-search-results`, class `.notif-dropdown`) — historically grew
  off-screen once the flex header wrapped. Now JS-clamped by
  `positionDropdown()` in `js/teacher.js`; a regression here = a panel with
  `left < 0` or `right > innerWidth`.
- **Header wrap** (`header`, `.hdr-group`, `.hdr-search`) — three flex groups
  wrap; watch for the bell/avatar scattering to mid-viewport or the row
  overflowing.
- **Wide tables** (`.records-grid`, Enrolled Students, Master Lists) — cells are
  `white-space:nowrap`; they must live inside an `overflow-x:auto` scroll box,
  never make the whole page scroll sideways.
- **Fixed widths**: `main{max-width:900px}`, `#course-outline{flex:0 0 230px}`
  sidebar, avatar circle, embed iframes (`.submission-preview`).
- **Single breakpoint**: only `@media (max-width:640px)` exists — anything added
  above must degrade by fluid/flex/scroll, not a second breakpoint (see
  [[responsive-design]]).

## Auth constraint (read this before loading pages)

- `index.html` is public → the **in-app Browser** MCP (`mcp__Claude_Browser__*`)
  can load it directly (local `python -m http.server 8420`, or the live URL).
- `teacher.html` / `student.html` are **sign-in-gated** and redirect to
  `index.html` when not authed. The in-app Browser has no logged-in session, so
  use **Claude-in-Chrome** (`mcp__claude-in-chrome__*`, the user's real Chrome
  with their live Google session) to reach them on the deployed site. Confirm the
  user is signed in first.
- To audit a not-yet-deployed change on a gated page, ask the user to run it
  locally and sign in, or audit after deploy.

## Method

1. **Pick targets & widths.** Pages: index, teacher, student (as auth allows).
   Widths, each page:
   - **mobile 375×812** (`resize_window` preset `mobile`) — reload after
     resizing so load-time gates re-run.
   - **wrap-zone ~900×700** — the width where the header wraps but the 640px
     mobile rule is NOT active. This is where the notification bug lived; always
     test it.
   - **desktop 1366×850** (preset `desktop`).
2. **Measure, don't eyeball.** Paste the probe below via `javascript_tool` at
   each width; it returns structured findings. Then `screenshot` for the report.
   Also open each header dropdown / menu and re-run the probe (overflow only
   shows when the panel is visible).
3. **Confirm each finding in source.** Map every probe hit to a `file:line` in
   `css/style.css` / the relevant HTML/JS — re-`grep`, don't trust a cached
   line. A finding is real only if you located its cause.
4. **Rank and report** using the format below. Lead with GO / NO-GO.

## The probe (paste into `javascript_tool`)

```js
(() => {
  const vw = document.documentElement.clientWidth, vh = window.innerHeight, out = [];
  // 1. Page-level horizontal scroll (body wider than viewport)
  if (document.documentElement.scrollWidth > vw + 1)
    out.push({sev:"HIGH", kind:"page-h-scroll", detail:`scrollWidth ${document.documentElement.scrollWidth} > vw ${vw}`});
  // 2. Elements spilling past the viewport left/right (clipped/off-screen)
  document.querySelectorAll("body *").forEach(elm => {
    const s = getComputedStyle(elm);
    if (s.display === "none" || s.visibility === "hidden" || !elm.offsetParent && s.position !== "fixed") return;
    const r = elm.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    if (r.right < 0 || r.left > vw + 1) // fully off-screen
      out.push({sev:"HIGH", kind:"offscreen", tag:tagOf(elm), rect:[r.left|0,r.right|0]});
    else if ((r.left < -1 || r.right > vw + 1) && s.overflowX !== "auto" && s.overflowX !== "scroll")
      out.push({sev:"MED", kind:"overflow-x", tag:tagOf(elm), rect:[r.left|0,r.right|0], vw});
  });
  // 3. Tap targets under 40px (mobile only meaningfully)
  if (vw <= 640) document.querySelectorAll("button, a, select, input").forEach(elm => {
    const r = elm.getBoundingClientRect();
    if (r.width && r.height && (r.height < 32 || r.width < 24))
      out.push({sev:"LOW", kind:"small-tap-target", tag:tagOf(elm), size:[r.width|0,r.height|0]});
  });
  // 4. Images without a fluid cap
  document.querySelectorAll("img").forEach(img => {
    if (img.getBoundingClientRect().width > vw) out.push({sev:"MED", kind:"img-overflow", tag:tagOf(img)});
  });
  function tagOf(e){ return e.tagName.toLowerCase() + (e.id?`#${e.id}`:"") + (e.className && typeof e.className==="string"?`.${e.className.trim().split(/\s+/).join(".")}`:""); }
  return { vw, vh, count: out.length, findings: out.slice(0, 60) };
})();
```

`page-h-scroll` and `offscreen` are the ship-stoppers (that's what "not clean"
looked like). `overflow-x` on an element whose own `overflow-x` is NOT auto/scroll
means content is being clipped rather than scrolled — flag it; an element that IS
`overflow-x:auto` (like `.records-grid`) is the *correct* pattern, not a bug.

## Severity rubric

- **BLOCKER** — page scrolls sideways or a control/panel is off-screen and
  unreachable at a common width (e.g. the notification bug). Fix before ship.
- **HIGH** — content clipped/overlapping or a primary action hard to hit on
  mobile.
- **MED** — cramped/ugly wrap, minor overflow with a scrollbar, small tap target.
- **LOW** — polish, sub-optimal spacing.

## Report format

```
# Responsive Audit — <date>
Scope: index / teacher / student @ 375, 900, 1366px  [pages skipped: <why>]

VERDICT: NO-GO — <k> blocker(s)   |   GO WITH FIXES — <h> high   |   GO — clean

## Findings
| # | Sev | Page@width | Element / where (file:line) | Symptom | Fix |
|---|-----|-----------|-----------------------------|---------|-----|
| 1 | BLOCKER | teacher@900 | #notif-dropdown (css/style.css:187) | panel left=-160, off-screen | clamp via positionDropdown() |
```

Attach the screenshots. Close with a short fix order and route each to
[[responsive-design]] / [[frontend-editing]].

## Rules

- Confirm in source before claiming — probe hit + a real `file:line`.
- Don't edit from here. Propose; hand off.
- Don't flag an `overflow-x:auto` scroll box as a bug — that's the intended
  pattern for this app's wide tables.
- No praise padding. Every row is a problem or a confirmed-clear check.
