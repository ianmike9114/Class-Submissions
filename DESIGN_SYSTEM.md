# Design System — read this before touching CSS/markup

One file, `css/style.css` (no framework, no build step). Read this doc
instead of re-reading that file from scratch each session.

## Look: shadcn/ui (adopted 2026-11-25)

The app uses the shadcn/ui look (ui.shadcn.com) in plain CSS: neutral
greys, near-black primary, Geist font, thin borders, rounded cards, and a
**light + dark mode**. The global skill `shadcn-ui-expert` has the full
rules; its `assets/shadcn-lite.css` is the reference for any new component.
The old "Academic Clarity" navy/serif design is retired; don't bring back
navy bars or Source Serif.

## Tokens (`:root` and `.dark` at the top of `css/style.css`)

Re-theme by editing ONLY those two blocks. Every rule reads tokens; never
write a hex colour in a component rule or an inline `style=""` (use
`var(--destructive)`, `var(--success-text)`, `var(--warning-text)`,
`var(--muted-foreground)` ...). Fixed colours allowed only where noted:
QR code box (must stay white to scan), `.code-output` terminal pane, and
the github-dark highlight.js colours.

```
--background / --foreground       page
--card / --popover (+ -foreground) surfaces
--primary / --primary-foreground   main buttons, links (near-black; near-white in dark)
--secondary, --muted, --accent     soft greys (hover = --accent)
--muted-foreground                 hints, .muted text
--destructive (+ -foreground, -soft)   delete, errors, missing
--success (+ -foreground, -text, -soft) published / done
--warning (+ -foreground, -text, -soft) pending / soon
--violet-text / --violet-soft      material chip
--border, --input, --ring          borders, inputs, focus
--sidebar, --sidebar-border        teacher sidebar
--radius (0.625rem), --radius-md (controls), --radius-xl (cards)
--shadow-xs (cards, inputs), --shadow-lg (dropdowns, drawer)
```
Legacy names still work and point at tokens: `--blue`→primary,
`--green`→success-text, `--amber`→warning-text, `--gray-bg`→muted,
`--gray-border`→border, `--text`→foreground. Prefer the new names.

## Dark mode

`.dark` on `<html>`. Each page's `<head>` has a tiny inline script that
applies the saved choice (`localStorage.theme`) or the device setting
before first paint, then `js/theme.js` wires every `[data-theme-toggle]`
button (teacher topbar, student header). Any new colour you add needs a
value in BOTH `:root` and `.dark`. Check new UI in both modes.

## Layout shell

- Teacher: fixed light `.sidebar` (230px, off-canvas drawer under 640px) +
  sticky `.topbar` (blurred background, bottom border).
- Student: sticky `body.student-page > header` in the same style.
- `main` — `max-width: 900px`, centered, `1.5rem auto` margin.
- Views are `<section id="view-*">` siblings inside `main`, toggled by
  `js/teacher.js`'s `show(viewId)` (adds/removes `.hidden` on a hardcoded
  array of view ids) / `js/student.js` has no view-switching, it's one
  scrolling page. **If you add a new `#view-*` section in `teacher.html`,
  you must also add its id to the array inside `show()`** — the #1 way
  a new view silently never appears.

## Card

```html
<div class="card">...</div>
```
`var(--card)` bg, `1px solid var(--border)`, `var(--radius-xl)` radius,
`1.25rem 1.5rem` padding, `--shadow-xs`, `1rem` bottom margin. The default
container for every list row and form block. Controls use the smaller
`--radius-md`. No hover shadow (shadcn cards are flat).

## QR code (per-section join)

```html
<details style="margin-top:0.5rem;">
  <summary class="muted" style="cursor:pointer;">Show QR</summary>
  <div style="margin-top:0.5rem;">
    <div id="qr-${sectionId}" class="qr-code"></div>
    <p class="muted">Scan to join, or share this link:<br>
      <a href="${joinLink}" target="_blank" rel="noopener">${joinLink}</a></p>
  </div>
</details>
```
Unclassed nested `<details>` inside an already-`.card` row (avoids a
double-bordered card-in-a-card look) — same pattern as "Or upload your
Class Record file instead" nested inside Section Settings. `.qr-code` is
just a white bordered padded box around the generated `<canvas>`/`<img>`
(rendered by the `qrcodejs` CDN library, see `CLAUDE.md`'s task map).

## Notification bell (header)

```html
<div style="position:relative; display:inline-block;">
  <button class="secondary" id="notif-bell">&#128276;<span id="notif-count" class="notif-badge hidden">0</span></button>
  <div id="notif-dropdown" class="notif-dropdown hidden"></div>
</div>
```
Red circular `.notif-badge` overlaps the button's top-right corner (only
shown when count > 0). `.notif-dropdown` is an absolute-positioned panel
below-right of the button — the first dropdown-style component in the
app, closes on an outside click or a second click on the bell. Rows are
plain `button.notif-item` elements grouped under `.notif-group-label`
headers; a group is omitted entirely when empty. See `CLAUDE.md`'s task
map for the data/navigation functions behind it.

## Collapsible card (forms that don't need to always be open)

```html
<details class="card">
  <summary><strong>Section title</strong></summary>
  <form style="margin-top:0.75rem;">...</form>
</details>
```
Used for Add Subject, Add Section's siblings (Section Settings), Add
assignment. `details.card summary { cursor:pointer }` and the marker is
tinted with --primary — no extra CSS needed, just use this exact structure.

## Buttons

```html
<button>Primary (solid near-black) — the one main action</button>
<button class="secondary">Secondary (outline) — Open/Back/Cancel-type actions</button>
<button class="danger">Danger (red text) — Delete only</button>
<button class="danger icon">x</button>   <!-- solid red circle, inline delete -->
```
`disabled` state is automatic (50% opacity, `not-allowed` cursor) — no
class needed. Plain primary buttons get the hover darken; classed buttons
(chips, choice cards, menu rows) set their own hover.

## Forms

```html
<label>Field label</label>
<input id="..." required placeholder="..." />
```
`label`/`input`/`select`/`textarea` are styled globally by tag — **don't
add classes to individual form fields**, they inherit full-width, border,
radius, spacing, focus ring automatically. `label` is medium weight,
0.875rem, and sits directly above its field with no wrapper needed.

## Status text

```html
<span class="status-pending">pending</span>
<span class="status-ai-drafted">ai-drafted</span>   <!-- legacy, AI check hidden -->
<span class="status-published">published</span>
```
shadcn Badges: pending = solid warning (yellow), published = solid
success (green), returned = red outline, ai-drafted = grey secondary.
Small (0.75rem, medium weight), `--radius-md` corners. Chips (`.chip-*`,
student side) follow the same mapping.
Pattern used inline as
`` `<span class="status-${s.status}"> — ${s.status}</span>` ``.

## Pending-count badge

```html
<span class="status-pending"> — 3 pending</span>
```
Just the existing `status-pending` style, reused as a small inline count
next to a subject/section/assignment title — the "who's submitting"
signal on the dashboard. Built by `js/teacher.js`'s `pendingBadge(count)`
+ `getPendingCounts()` (one shared aggregation, rolled up to all three
levels at once — see `CLAUDE.md`). Renders nothing (`""`) when the count
is zero, so it never shows "0 pending" clutter.

## Muted / secondary text

```html
<span class="muted">...</span>
<p class="muted">...</p>
```
Gray, smaller (0.85rem). Used for hints, join codes, "no data yet"
placeholders, timestamps.

## Data tables (Records grid, Enrolled Students, roster preview)

```html
<table class="records-grid">
  <thead><tr><th>Col</th></tr></thead>
  <tbody><tr><td>...</td></tr></tbody>
</table>
```
Card bg, bordered cells, sticky header row (muted bg). The Records grid
specifically has a **second header row** styled primary/primary-foreground/centered for
its Written Work / Performance Task group headers (`thead tr:first-child
th`) — only add a second header row if you actually need grouped columns
like that, it's a special case, not the default table header look.

The Records grid also groups its **body rows** by gender (MALE/FEMALE
blocks, matching a real Class Record) when the roster has gender data:
```html
<tr class="gender-group"><td colspan="6">Male</td></tr>
```
Gray bg, bold, centered, spans every column — one of these rows precedes
each gender's student rows. See `js/teacher.js`'s `loadRecords()`.

## Embedded previews (submission links, instructions files, rubric files)

```html
<iframe src="${embedUrl}" class="submission-preview"></iframe>
```
Fixed `400px` height, bordered. `embedUrl` always comes from
`js/embed.js`'s `toEmbedUrl(link)` — never hand-build a Drive/Docs/YouTube
embed URL inline, that function already handles all four supported link
shapes and returns `null` for anything that doesn't embed (fall back to a
plain `<a href>` in that case, see any existing call site for the pattern).

```html
<img src="${photoData}" class="photo-preview" />
```
For in-app camera captures — `max-width:100%`, bordered.

## Photo thumbnail row (multi-page camera submissions)

```html
<div class="photo-thumbs">
  <div class="photo-thumb">
    <img src="${dataUrl}" />
    <button type="button" data-remove-photo="${i}">x</button>
  </div>
</div>
```
100x100 cropped thumbnails in a wrapping flex row, small circular remove
button top-right — used on the student side while building a multi-page
submission (`js/student.js`'s `renderPhotoThumbs()`). On the teacher's
read-only submission-review side, wrap each thumb in `<a href="${dataUrl}"
target="_blank"><img></a>` instead of a remove button (`.photo-thumbs a
img` bumps them to 150x150, no remove control needed there) — see
`js/teacher.js`'s `loadSubmissions()`.

## Hiding an element

`class="hidden"` → `display: none !important`. This is the ONLY
show/hide mechanism in the app (no other visibility toggling pattern) —
toggle it with `classList.add/remove/toggle("hidden")`, never inline
`style.display`.

## What NOT to do

- Don't add a CSS framework, don't add per-component `<style>` blocks —
  everything is global tag/class selectors in the one file.
- Don't invent a new button color/class — reuse primary/secondary/danger.
- Don't give form fields individual width/padding/border styles — they're
  already global.