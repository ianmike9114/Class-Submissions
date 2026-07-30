# Design System — read this before touching CSS/markup

One file, `css/style.css` (125 lines, no framework, no build step). Read
this doc instead of re-reading that file from scratch each session —
it's short enough to just paste patterns from below.

## Tokens (`:root` in `css/style.css`)

```
--blue:        #1a56db   (header bg, primary button, links/headers)
--green:       #0f9d58   (status-published)
--amber:       #b45309   (status-pending)
--gray-bg:     #f5f6f8   (page bg, table header cells)
--gray-border: #d9dde3   (all borders)
--text:        #1f2430
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
White bg, `1px solid var(--gray-border)`, `8px` radius, `1rem 1.25rem`
padding, `1rem` bottom margin. The default container for every list row
and form block in this app.

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
Colored (amber/blue/green) + bold, no background. Pattern used inline as
`` `<span class="status-${s.status}"> — ${s.status}</span>` ``.

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
- `.rubric-row` class exists in `css/style.css` but is currently unused
  dead CSS (rubric-criteria grading was replaced by single-score grading —
  see `CLAUDE.md`). Don't build against it; safe to delete next time
  `css/style.css` is touched for something else.
