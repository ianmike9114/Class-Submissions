---
name: session-efficiency
description: Guidance for working efficiently with Claude Code in this repo — reducing token usage, structuring requests, and reusing established workflow patterns (Plan Mode, background agents, compressed docs, existing task-map). Use when the user asks how to optimize their Claude Code usage, session/token efficiency, or "how should I work with Claude on this project."
---

# Working efficiently with Claude Code in this repo

This repo already has two habits that keep sessions cheap. This skill
names them so they stay deliberate instead of accidental.

## 1. The always-loaded docs are compressed on purpose

`CLAUDE.md` and `.claude/Skills/student-lms/SKILL.md` load into every
session automatically, so their word count is a direct, permanent tax on
every conversation. Both were compressed 2026-08-06 (see
`CLAUDE.original.md` / `SKILL.original.md` for the pre-compression
versions) — same technical content, articles/filler/hedging stripped,
every code reference/path/URL preserved exactly.

**When either file grows back** (new features add new paragraphs over
time — this is normal), re-compress periodically rather than letting it
balloon indefinitely. Either invoke the `caveman-compress` skill
directly, or do it manually: trim connective prose, keep every
`` `inline code` ``/path/URL byte-for-byte, keep every heading, don't
touch fenced code blocks. Validate against a saved original before
overwriting — a lost technical reference is worse than a saved word.

## 2. `student-lms` SKILL.md's task-map is the fast path, not a suggestion

Before asking Claude to "find where X lives" or spawning an Explore
agent to search the codebase, check the task-map table in
`.claude/Skills/student-lms/SKILL.md` first — it's a change → exact
file/function lookup for nearly every feature area, and it's already
loaded once that skill triggers. Pointing directly at a named
file/function in a request ("fix the missing-count logic in
`loadRecords()`, `js/teacher.js:2356`") skips a full Explore round-trip
entirely.

## 3. Delegate broad research to a background Agent, not the main thread

Anything that means "search/read many files to answer one question" —
a performance audit, a mobile-responsiveness sweep, "where does X touch
Y across the app" — is cheaper as a background `Agent` (Explore
subagent) call than done inline. The full search transcript stays in the
subagent's own context; only its written summary comes back into the
main conversation. This is what the page-load and mobile audits behind
`LMS_REVIEW.md` used — two parallel background agents, ~700-word reports
each, instead of dozens of inline greps cluttering the main thread.

Rule of thumb: 1 agent for a scoped, known-location question; 2-3
parallel agents only when the question genuinely spans unrelated areas
(e.g. "performance" and "mobile layout" don't overlap much, so they ran
as separate agents rather than one broad one).

## 4. Plan Mode before implementation, every time — not just big changes

Established preference for this repo: enter Plan Mode before writing
code, even for small changes, not only large ones. It costs one
exploration pass but avoids redoing work when the approach was wrong.
Skip it only for genuinely trivial one-liners (typo fixes, a single
CSS value change with no ambiguity).

## 5. Claude has no live access to this app's actual data

No Firebase admin connection, no signed-in browser session by default.
Questions like "did this actually sync for my real students" or "what
does my Firestore data look like right now" can't be answered from a
Claude Code session — the honest answer is "check the code path" or
"verify in the live app," not a guess dressed up as a fact. Don't ask
Claude to confirm live production state; ask it to trace the code that
would produce that state, then verify yourself.

## 6. Ship discipline that's already a habit — keep it

- Bump every changed file's `?v=N` cache-buster in every HTML file that
  references it, as part of the same commit — GitHub Pages caches
  `max-age=600` with no content-hashed filenames, so this is the only
  thing that guarantees a shipped fix isn't invisible for up to 10
  minutes.
- After any `firestore.rules` edit, the change needs a separate
  `firebase deploy --only firestore:rules` — a local edit alone does
  nothing in production. Easy to forget since every other change here
  ships via `git push` alone.
- One plan file, reused across a continuous stretch of related work in
  the same session, rather than starting fresh each time — cheaper than
  re-deriving context every request when the work is clearly one
  ongoing thread.

## 7. Batch related asks instead of one-at-a-time when you already know them

Each new non-trivial request currently costs a fresh Plan Mode pass
(exploration + a plan file + approval). If you already know you want
three related changes, say all three up front rather than one per
message — the plan phase can account for all of them at once instead of
re-running per request.
