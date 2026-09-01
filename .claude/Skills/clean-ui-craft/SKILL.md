---
name: clean-ui-craft
description: The visual-quality bar for this LMS — what makes a screen look clean and professionally designed, and how that differs on a roomy desktop versus a touch-driven phone. Grounded in WCAG target-size rules, Apple HIG, Material, and Nielsen heuristics, mapped onto the app's real tokens. Use when a critique says the UI "looks cheap / unpolished / not clean", asks for "best UI/UX" on look, wants it "clean on both desktop and mobile", or before shipping any visual change (spacing, hierarchy, type, density, tap targets, polish).
---

# Clean UI craft (both viewports)

The **looks-designed** layer. `[[ui-ux-playbook]]` decides *what* a screen
does and where it sits; this skill decides whether it looks clean once it's
there — and clean **on both** a desktop and a phone, which are different
jobs. Tokens live in `DESIGN_SYSTEM.md`; won't-overflow mechanics in
`[[responsive-design]]`. This skill is the *visual intent* on top: reuse
their tokens/rules, don't restate them.

Everything below maps onto the app's real vocabulary: `--radius-sm` 4px
(controls) / `--radius-lg` 8px (cards), `--shadow-hover` (the *only* shadow),
`main { max-width:900px }`, the single `@media (max-width:640px)` breakpoint,
`.card`, `status-*` pills, `.muted`. No new colors, shadows, or breakpoints.

## 1. The bar

A stranger should call **each** view clean without being told which device
it was designed for. The two failure modes to catch:

- **Desktop that's a stretched phone** — one narrow column of full-width
  inputs marooned in a sea of empty gray, everything the same size, no
  scanning rhythm. (Content already caps at `main` 900px — use that width,
  don't waste it.)
- **Mobile that's a shrunk desktop** — desktop spacing/columns crammed onto
  375px, tap targets too small and too close, text at a squint. Re-flow the
  content; don't scale it down.

Clean is mostly **whitespace + hierarchy + alignment**, not decoration. If a
screen looks busy, the fix is almost always *remove/space*, not *add*.

## 2. Spacing & rhythm

The app's spacing is rem multiples of ~8px (`0.5rem` 8 · `0.75rem` 12 ·
`1rem` 16 · `1.25rem` 20). Stay on that ladder — don't introduce `7px`,
`13px`, `1.1rem` one-offs; inconsistent gaps are the #1 "looks amateur" tell.

- **One rhythm.** Same gap between sibling cards (`1rem` bottom margin,
  already global), same padding inside them (`1rem 1.25rem`). Match the
  existing `.card`, don't hand-set per-block.
- **Whitespace is the clean lever.** Give a heading room above it; let a form
  breathe. Cramped beats cluttered only in a spreadsheet — everywhere else,
  more space reads as more considered.
- **Group by proximity** (Gestalt): things that belong together sit closer;
  a bigger gap separates groups. A label hugs its field (already global);
  sections get a clear gap between them.
- **Align to one edge.** Everything in the content column shares the left
  edge of `main`. Ragged left edges and random indents read as broken.

## 3. Typographic hierarchy

Two families only (per `DESIGN_SYSTEM`): **Source Serif 4** headlines
(`h1–h4`, `strong`, `summary`), **Atkinson Hyperlegible Next** body — chosen
for legibility, which matters for low-tech users and kids. Don't add faces.

- **One clear H-order per screen.** A screen has *one* h1/primary title, then
  h2 sections, then body. Don't jump sizes for emphasis — use the heading
  level that means it.
- **Size steps you can see.** Adjacent levels should differ enough to read as
  a hierarchy (~1.2–1.25× steps), not two near-identical sizes that look like
  a mistake.
- **Body: line-height ~1.5, measure ~60–75 characters.** `main` 900px already
  keeps prose from running too wide; don't stretch paragraph text edge to
  edge on desktop.
- **One accent weight.** Bold *or* color for emphasis, not both-plus-italic.
  `.muted` (gray, 0.85rem) is the whole "secondary text" vocabulary — use it
  for hints/timestamps/empty lines, don't invent a second muted style.

## 4. Density adapts; content doesn't shrink

Same content, re-flowed per viewport — never the same layout scaled down.

- **Desktop can be denser / multi-column.** The sidebar shell, the
  `.records-grid`, side-by-side outline + detail — desktop has room; use it
  so 900px doesn't feel empty.
- **Mobile is one column, roomier, thumb-first.** At `≤640px`: stack to a
  single column, *increase* vertical padding (fingers need slack), put the
  primary action full-width and within thumb reach, let wide things scroll in
  their own box (`[[responsive-design]]`). Bigger targets on mobile, not
  smaller.
- Decide the mobile view deliberately; don't just let the desktop layout
  reflow and hope. The **mechanics** of stacking/scrolling are
  `[[responsive-design]]`'s job — this skill is the call on *what density*
  each viewport should feel like.

## 5. Touch ergonomics (numbers, not vibes)

Interactive controls on a phone must be comfortably tappable. The standards:
WCAG 2.5.8 AA floor is **24×24 CSS px** (or enough spacing); WCAG AAA and
Apple HIG say **44px**; Material says **48dp**. This app is used by children
and low-tech adults on phones, so **hold the 44px bar**, not the 24px floor.

- **≥44px min height** for any button/link/row a user taps on mobile. A
  bare text link in a list often falls short — give it padding to reach it.
- **≥8px between adjacent targets** so a fat finger can't hit two.
- **Full-width primary button on mobile** (the app's inputs are already
  full-width — match it) so it's an easy, obvious thumb target.
- **No hover-only affordance.** Touch has no hover; anything that only
  appears/works on `:hover` is invisible on phones. `.card:hover`'s
  `--shadow-hover` is fine as a *bonus* on desktop, never the only signal.

## 6. Polish details (reuse, don't invent)

- **One radius language:** `--radius-lg` (8px) for cards/containers,
  `--radius-sm` (4px) for buttons/inputs. Don't mix in other radii.
- **One shadow language:** `--shadow-hover` on `.card:hover` only. Don't add
  drop shadows to signal depth — borders (`--gray-border`) do that here.
- **State is styled, never blank.** Every list has a `.muted` empty line
  saying what to do next; pending/returned/published use `status-*` pills;
  loading and error states are visible (see `[[ui-ux-playbook]]`). A blank
  region reads as broken, not clean.
- **Small tap feedback** — the pressed/disabled states are already global
  (`disabled` auto-grays). Don't leave a tapped control looking dead.
- Buttons say the exact outcome ("Publish", "Add material"), one primary
  (blue) per screen; everything else `secondary`.

## 7. The "is it clean?" pass — run at BOTH widths

Open the changed view at desktop **and** 375px (`resize_window`), then:

- [ ] Hierarchy reads top-down at a glance — one clear title, visible size steps.
- [ ] Consistent spacing on the rem ladder; nothing cramped, no dead empty desktop.
- [ ] Everything aligns to the content column's left edge.
- [ ] Exactly one primary (blue) action stands out; rest are secondary.
- [ ] Mobile: one column, roomier padding, primary full-width & thumb-reachable.
- [ ] Every tap target ≥44px and ≥8px apart on mobile; no hover-only control.
- [ ] Empty / loading / error states all styled (`.muted`, `status-*`), never blank.
- [ ] Reuses tokens only — no new color/shadow/radius/breakpoint (`DESIGN_SYSTEM.md`).
- [ ] `?v=` cache-buster bumped on changed css/js in every HTML (`[[frontend-editing]]`).

Then **measure**, don't eyeball: run `[[responsive-audit]]` for h-scroll /
clipping / target-size numbers at desktop + mobile.

## 8. Build / verify with (and the boundary)

- `[[ui-ux-playbook]]` — *flow/behavior* (what the screen does, where it sits).
- `[[responsive-design]]` — *mechanics* (breakpoint, overflow box, dropdown clamp).
- `[[frontend-editing]]` — *craft* (smallest diff, reuse helpers, cache-buster).
- `DESIGN_SYSTEM.md` — *tokens* (the actual colors/fonts/radii — the source of
  truth; this skill never restates their values).
- `[[responsive-audit]]` — *measure* the result.

**Don't duplicate:** if you're about to write a token value, a media-query
rule, or a where-to-edit note, it belongs in one of those, not here. This
skill only sets the *visual bar*.

## Sources (why these numbers are the standard, not preference)

- Touch targets — WCAG 2.5.8 / 2.5.5 (24px AA, 44px AAA): testparty.ai,
  LogRocket, TetraLogical. Apple HIG 44pt / Material 48dp: LukeW, AccessiTool.
- Mobile-first, fluid grids, spacing/hierarchy (2026): UXPin, Simpalm,
  Minimum-Code, uxpilot.
- Usability heuristics: Nielsen's 10 (empty/error/feedback states above).
