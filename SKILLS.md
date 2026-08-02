# SKILLS.md — quick reference (read before re-exploring)

Compact pointer index so a session doesn't need to re-grep the codebase
for things already documented elsewhere. Full detail lives in
`CLAUDE.md` (task map) and `DESIGN_SYSTEM.md` (CSS patterns/tokens) — this
file is a jump table, not a duplicate.

## Where things live

| Topic | Go to |
|---|---|
| Any "change X" task | `CLAUDE.md`'s task-map table — file/function named directly, skip exploring |
| CSS/markup pattern (card, button, table, status pill, collapsible) | `DESIGN_SYSTEM.md` — copy-pasteable HTML, exact class names |
| Repo-local Claude skill (routing rules, reminders) | `.claude/Skills/student-lms/SKILL.md` |
| Deploy/setup steps | `README.md` |
| Firestore access rules | `firestore.rules` |

## QR-code join (added 2026-08)

Per-section "Show QR" — students scan to join instead of typing the
6-char code. Fully client-side (no join link ever hits a third-party
server):
- `js/teacher.js`: `joinLinkFor(joinCode)`, `renderSectionQR(sectionId, joinCode)` — called from `loadSections()`
- `teacher.html`: `qrcodejs` CDN `<script>` (davidshimjs, jsDelivr) — plain global script, no bundler
- `js/student.js`: `applyPendingJoinCode()` — reads `?code=` from a scanned link, stashes it in `sessionStorage` before `guardPage()` can bounce a signed-out student through `index.html` for sign-in, then auto-fills + auto-submits `#join-form` once signed in
- No `firestore.rules` change — `sections` read was already `isSignedIn()`-only

## Academic Clarity restyle (added 2026-08)

Re-skin of the existing single `css/style.css` — deep navy primary,
Source Serif 4 headlines, Atkinson Hyperlegible Next body, 4px/8px radius
split, subtle card hover shadow, full-round status pills. No framework,
no markup rebuild. Exact token values: `DESIGN_SYSTEM.md`'s Tokens
section. Google Fonts loaded via `<link>` in each HTML file's `<head>`.

## Conventions this app never breaks

- No Firebase Storage, no Cloud Functions (Spark free plan only)
- No bundler/build step — plain ES modules, CDN scripts only
- Bump the `?v=N` cache-buster on every HTML file referencing a changed
  `css/js` file, every time — GitHub Pages caches 10 min+
