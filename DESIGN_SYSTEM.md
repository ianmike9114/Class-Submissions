# Design System — read this before touching CSS/markup

One file, `css/style.css` (125 lines, no framework, no build step). Read
this doc instead of re-reading that file from scratch each session —
it's short enough to just paste patterns from below.

## Tokens (`:root` in `css/style.css`)

"Academic Clarity" palette — deep navy primary, Source Serif 4 headlines,
Atkinson Hyperlegible Next body (loaded via Google Fonts `<link>` in each
HTML file's `<head>`, before the stylesheet link).

```
--blue:        #002045   (header bg, primary button, links/headers)
--green:       #146c2e   (status-published)
--amber:       #92400e   (status-pending)
--gray-bg:     #f7fafc   (page bg, table header cells)
--gray-border: #e2e8f0   (all borders)
--text:        #111c2c

--font-headline: 'Source Serif 4', Georgia, serif       (h1-h4, strong, summary)
--font-body:      'Atkinson Hyperlegible Next', system-ui, ...  (body text)

--radius-sm: 4px   (buttons, inputs, small elements)
--radius-lg: 8px   (cards/containers)
--shadow-hover: 0 4px 12px rgba(17,28,44,0.05)   (.card:hover only)
```

## Layout shell

- `header` — blue bar, flex space-between, white text.
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
White bg, `1px solid var(--gray-border)`, `var(--radius-lg)` (8px) radius,
`1rem 1.25rem` padding, `1rem` bottom margin. The default container for
every list row and form block in this app. Buttons/inputs/small elements
use the tighter `var(--radius-sm)` (4px) instead — containers get the
bigger radius, interactive controls get the smaller one. Cards get a
subtle `box-shadow` on `:hover` (`--shadow-hover`) to signal interactivity
without heavy drop shadows.

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

## Collapsible card (forms that don't need to always be open)

```html
<details class="card">
  <summary><strong>Section title</strong></summary>
  <form style="margin-top:0.75rem;">...</form>
</details>
```
Used for Add Subject, Add Section's siblings (Section Settings), Add
assignment. `details.card summary { cursor:pointer }` and the marker is
tinted blue — no extra CSS needed, just use this exact structure.

## Buttons

```html
<button>Primary (blue)</button>
<button class="secondary">Secondary (gray) — Open/Back/Cancel-type actions</button>
<button class="danger">Danger (red) — Delete only</button>
```
`disabled` state is automatic (gray, `not-allowed` cursor) — no class
needed, just set the `disabled` attribute/property.

## Forms

```html
<label>Field label</label>
<input id="..." required placeholder="..." />
```
`label`/`input`/`select`/`textarea` are styled globally by tag — **don't
add classes to individual form fields**, they inherit full-width, border,
radius, spacing automatically. `label` is bold + small (0.85rem) and
always sits directly above its field with no wrapper needed.

## Status text

```html
<span class="status-pending">pending</span>
<span class="status-ai-drafted">ai-drafted</span>   <!-- legacy, AI check hidden -->
<span class="status-published">published</span>
```
Colored (amber/blue/green) text + bold, full-round pill with a matching
light background tint (`display:inline-block`, `border-radius:9999px`).
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
White bg, bordered cells, sticky header row (gray bg). The Records grid
specifically has a **second header row** styled blue/white/centered for
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
