---
name: frontend-editing
description: How to make HTML/CSS/JS edits to this static LMS site cleanly, cheaply, and correctly — the craft layer (smallest diff, reuse existing helpers, design-system fidelity, cache-buster protocol) on top of student-lms (which says WHICH file/function). Use for any hands-on edit to index/student/teacher.html, css/style.css, or js/*.js — writing markup, styling, or client-side logic.
---

# Frontend editing (this static site)

Plain HTML/CSS/JS, no build step, no framework, Firebase Auth + Firestore
only. This skill is the **how-to-edit** layer. It does not re-document the
app — it routes to the docs that do, then names the discipline that keeps
edits small, correct, and low-token.

## Route first (don't re-derive)

| Need | Go to |
|---|---|
| Which file/function does change X live in? | `student-lms` skill (full task map) |
| CSS / markup pattern (cards, buttons, tables, details, status, embeds, tokens) | `DESIGN_SYSTEM.md` — **read this, not `css/style.css`** |
| Firestore fields / rules / multi-tenant isolation | `firestore-database` skill |
| Token/session workflow (Plan Mode, agents) | `session-efficiency` skill |
| Architecture, constraints, v1 limitations | `CLAUDE.md` |

If a routed doc answers it, you're done — don't open the source file to
re-confirm what the doc already states.

## Hard constraints (breaking one breaks the project)

- **No build step, no npm, no bundler.** Must stay deployable as-is to
  static hosting. New dependency → CDN ESM import only (see
  `js/firebase-config.js` for the pattern), never a package.json.
- **No Firebase Storage, no Cloud Functions.** Both force the paid Blaze
  plan. If a change seems to need either, stop and flag it — don't add
  silently.
- **`firestore.rules` is the real access control**, not JS. Any
  who-can-do-what change goes there; adding a plain field to an existing
  collection usually does not.
- **Cache-buster bump is part of shipping, not a follow-up.** Static
  hosting serves `?v=N` assets with `max-age=600`. On **every** change to
  `css/style.css` / `js/student.js` / `js/teacher.js`, bump `?v=` in
  **every HTML file that references it** (`index.html`, `student.html`,
  `teacher.html`). The shared stylesheet is referenced by all three — bump
  all three so versions stay in sync. Sub-modules imported by an entry
  file (e.g. `./embed.js`) aren't versioned; they re-fetch with their
  importer.

## Editing discipline (correct + cheap)

- **Read narrow.** Grep for the symbol, Read only that span. Don't read a
  whole 2000-line file to change five lines.
- **Reuse before you write.** These already exist — call them, don't
  reinvent: `el(id)`, `show(viewId)` (teacher view switching — and add any
  new `#view-*` id to its array), `toEmbedUrl()` / `embedBlockFor()` /
  `extractFirstEmbeddableUrl()` / `openInChromeButton()` (`js/embed.js`),
  status/`pendingBadge()` helpers, `confirmByTyping()` for destructive
  actions, `ownerScopedQuery()` / `ownedByViewAs()` for every teacher-side
  query and write.
- **Smallest diff that works.** Match surrounding naming, comment density,
  and idiom. This codebase comments the *why*; keep that.
- **Design-system fidelity.** Reuse `.card`, `.muted`, `status-*`,
  primary/secondary/danger buttons, `<details class="card">`. Don't invent
  a new button color, don't add per-component `<style>` blocks or
  per-field form classes, don't use inline `style.display` — toggle the
  `hidden` class. One breakpoint exists: `@media (max-width: 640px)` —
  extend it, don't add a second.
- **Escape teacher/student text** interpolated into `innerHTML` (there's an
  `esc()` in `js/student.js`); never build a Drive/Docs/YouTube embed URL
  by hand — `toEmbedUrl()` owns that.

## Verify before claiming done

- Syntax: `node --check js/<file>.js` catches parse/import errors fast.
- Serve: `python -m http.server 8420` from repo root, open the changed
  view. Sign-in-gated pages redirect to `index.html`; to check a
  component in isolation without auth, a throwaway harness that links the
  real `css/style.css` and measures/screenshots layout works well —
  delete it after.
- State plainly what you ran and what it showed. Don't assert "it works"
  without having exercised the path.
