---
name: compact-mode
description: The collapse-and-reveal / density playbook for this LMS — how to make teacher and student screens open tidy and scannable by defaulting heavy content collapsed and revealing it on demand, using the app's real vocabulary (native <details>/<summary>, and the classList.toggle("hidden", cond) dropdown pattern) with no new libraries. Covers collapsed-by-default rules, one-open-at-a-time peer dropdowns, a reusable expand-all/collapse-all control, remembering open/closed state per viewer with localStorage, and the cache-buster + design-system gates. Use whenever a screen "feels cluttered / too long / overwhelming", when asked to "auto-hide everything and show it on demand" or add a dropdown/accordion/collapse/toggle, or before adding any panel that could bury the primary flow. Pair with [[responsive-design]] for viewport-clamped dropdowns, [[clean-ui-craft]] for how the collapsed state should LOOK, and [[ui-ux-playbook]]/[[lms-organization]] for WHAT to collapse.
---

# compact-mode — collapse-and-reveal density for this LMS

Goal: every screen opens **tidy and scannable**. Secondary content is present but
folded away; the user expands only what they want. Zero-cost, no libraries, no
build step — reuse what the app already does.

Before touching CSS read `DESIGN_SYSTEM.md`. For which file/function to edit, the
task map is `[[student-lms]]`. For the smallest-diff craft rules, `[[frontend-editing]]`.

## The two primitives (use these, don't invent)

1. **Native `<details>`/`<summary>`** — the default for a self-contained collapsible
   block (a card, a help note, a settings group). Free open/close, keyboard- and
   screen-reader-accessible, no JS. This app uses it everywhere and deliberately
   does **not** build custom `aria-expanded` accordions.
   - Collapsed by default: `<details class="card">…`
   - Open by default (rare — only the primary content of the screen): add `open`.
   - Existing examples: `student.html`'s `<details class="student-guide card">`;
     teacher.js QR/invite/records blocks (`teacher.js` ~535, 546, 564, 582, 2239,
     2453, 2545, 2962, 2992).

2. **`classList.toggle("hidden", cond)` dropdown** — for a menu/panel anchored to a
   button (notifications, search results, photos menu) where you need JS control
   (close on outside click, close peers, position). The `.hidden` class is the
   app-wide "display:none" switch.
   - Existing examples: teacher.js notifications (~977-981), global-search
     (~1364, 1561-1564), photos dropdown (~3088-3101).

Rule of thumb: **`<details>` unless you need JS behavior** (outside-click close,
mutual exclusion, dynamic positioning) — then the `.hidden` toggle.

## Collapsed-by-default rules

- **Primary flow stays open; everything else folds.** On a screen, exactly the one
  thing the user came for is expanded. On the teacher dashboard that's the
  subjects → sections → assignments → submissions spine; term-filter/preview,
  QR/invite, photo tools, records extras all open **collapsed**. On the student
  page it's the current assignment / class list; the "How this page works" note and
  long past-work groups fold.
- **Peer dropdowns are mutually exclusive** — opening one closes the others. Keep a
  single "which dropdown is open" reference and close it before opening another;
  close on outside click and on `Escape`.
- **Never fold an error, a required action, or a New/Returned badge out of sight.**
  Callouts like `#needs-resubmission` and "please revise and resubmit" stay
  surfaced, not inside a closed `<details>`.
- **Empty sections don't render a collapsible at all** — no empty accordion rows.

## Reusable expand-all / collapse-all

For an area with many sibling `<details>` (e.g. the student's per-subject groups),
give one control that flips them together. Minimal recipe:

```js
// container holds sibling <details>; btn is the toggle
function wireExpandAll(container, btn) {
  const sync = () => {
    const groups = [...container.querySelectorAll(":scope > details")];
    const anyClosed = groups.some((d) => !d.open);
    btn.textContent = anyClosed ? "Expand all" : "Collapse all";
    btn.onclick = () => groups.forEach((d) => (d.open = anyClosed));
  };
  container.addEventListener("toggle", sync, true); // capture: child <details> bubble
  sync();
}
```

Keep the label honest (mixed state → "Expand all"). No animation library.

## Remembering open/closed per viewer (optional, best-effort)

If a collapse choice should survive reloads for that one person, persist it in
`localStorage` — never Firestore (per-viewer convenience, not shared data). Wrap
every read/write in try/catch; a blocked/private-mode store must degrade to the
default collapsed state, never throw. Key by a stable id, e.g.
`compact:<screen>:<sectionId>`.

## Responsiveness & looks (defer, don't duplicate)

- A dropdown that can overflow the viewport must be clamped per `[[responsive-design]]`
  (one 640px breakpoint; wide content scrolls in its own box; JS-clamp menus). Don't
  re-solve positioning here.
- Summary rows are tap targets — comfortable height, clear affordance (a caret/chev
  or "Show/Hide" text). Judge the collapsed look against `[[clean-ui-craft]]`.

## Ship checklist

- Reused `<details>` or the `.hidden` toggle — no new library, smallest diff.
- Primary content open; secondary collapsed; nothing urgent hidden.
- Peers mutually exclusive; outside-click + Escape close JS dropdowns.
- Verified at desktop **and** 375px (`[[responsive-audit]]`): no horizontal scroll,
  dropdowns on-screen, summaries tappable.
- Bumped `?v=N` on every changed `js/*.js` / `css/style.css` in **each** HTML that
  references it (`student.html` / `teacher.html` / `index.html`) — GitHub Pages
  caches for 10 min without this.
