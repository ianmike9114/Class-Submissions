---
name: inset-talk-materials
description: Generate INSET / teacher-training talk materials for this project — an engaging PowerPoint deck (.pptx), a Taglish (English-dominant) speaker script (.docx), and a hands-on workshop facilitator guide (.docx) — in the user's sample-slide style (colored category cards + chevron flow ribbon + footer takeaways, emoji icons). Use whenever the user asks to build or redo a presentation, talk, deck, slides, script, or workshop for an INSET, LAC follow-up, demo, or teacher orientation. The bundled reference build is a talk about the user's own Class Submissions LMS. Pairs with the [[deped-teacher]] and [[student-lms]] skills.
---

# INSET talk materials

Produces four deliverables for a teacher-audience talk:

1. **Slide deck** (`.pptx`) — engaging, in the user's sample-slide style.
2. **Speaker script** (`.docx`) — **Taglish, English-dominant**, per-slide.
3. **Workshop facilitator guide** (`.docx`) — Taglish, step-by-step run-of-show
   for the *presenter*.
4. **Participant handout** (`.docx`) — the one-page, print-ready sheet the
   *participant teachers* follow on their phones during the workshop. Big
   numbered steps, a fill-in box for the join code + a dashed frame to tape the
   section QR, and a short "if you get stuck" table. Distinct from the
   facilitator guide (that one is for whoever runs the session). Language mode
   is per the ask-first rule; the reference `gen-handout.js` ships in **plain
   English** (the user's chosen default for this sheet).

Default output folder: **`D:\Desktop\INSET-Talk\`** (outside the app repo, so
nothing touches the live Vercel site). Confirm/adjust with the user.

## Language mode — ask first

**Ask the user which language mode to use before writing any deliverable** —
plain **English** or **Taglish (English-dominant)**. There is no automatic
default (the user changed this from an earlier "always Taglish" rule; see the
`taglish-guides-register` memory). Different docs can differ — e.g. the user
wanted the talk script + facilitator guide in Taglish but the **participant
handout in pure English**. Confirm per build.

**Taglish (English-dominant) spec — apply only when they choose it:**

- English carries the sentence; Filipino as connectors / warmth / emphasis
  (*kaya, diba, yung, para, ganito, tapos, sige, wag mag-alala*), never the
  reverse.
  - ✅ "Good morning po! I want to show you something na ginawa ko myself."
  - ❌ "Magandang umaga po! Gusto kong ipakita sa inyo ang ginawa ko." (Tagalog-dominant)
- **All technical terms, UI labels, and step verbs stay English**
  ("Tap **Sign in with Google**", "click **Add assignment**").
- Slide text, headings, and labels: **English** either way. In Taglish mode only
  the spoken script and facilitator notes carry the Filipino flavor.
- Tone: teacher-to-teacher, encouraging, not academic.
- Normal chat with the user always stays **plain English** — the mode question
  is about the produced document only.

## Ask first (scope questions)

Before building, confirm: **what the talk is centered on** (the user's own
system? a pedagogy/framework? both — and which is the star?), **duration**
(sizes slide count + script length), **workshop task** (what teachers actually
do), **access mode** (phones-on live vs demo-only vs screenshots), whether to
use the **real live app**, the **language mode** of each deliverable (English vs
Taglish — see above), and the user's **identity** (system name, presenter name,
school, role) so the title/close aren't placeholders. The user has
pivoted the framing before — get the "star" of the talk explicit up front.
Sizing: a live demo eats ~15 min with few slides; for a mixed audience prefer
~1 slide per 1.5–2 min plus section dividers.

## Engaging slide visual style (mirror the sample slides) — KEEP THIS

The user's reference deck uses a specific, repeatable visual language they like.
Match it regardless of topic:

- **Colored category cards**: rounded white card, solid colored header band, an
  emoji in a tinted circle, a bold colored sub-line, a short description.
- **Chevron process ribbon** (`ribbon()`): overlapping `homePlate` (first) +
  `chevron` segments cycling the palette; `showStep=false` for a plain-label
  hierarchy row. Optional detail cards underneath.
- **Footer takeaway bar** (`takeaway()`): rounded (not full-bleed) colored bar
  with a 💡 and one bold sentence — the slide's one-line "why."
- **Section dividers** (`divider()`): dark navy, big "PART N" kicker in gold,
  serif title, a large emoji-in-circle on the right.
- **2×2 / 3-col feature cards** (`quad()`, `trio()`) for benefit and feature
  slides.
- **Icons = emoji** (`fontFace: "Segoe UI Emoji"`), NOT react-icons — they
  render in full color in the user's PowerPoint and skip a fragile pipeline.
- **Palette** (hex, no `#`): navy `14304A`, teal `2A9D8F`, blue `2F6DB5`,
  brown `9B6A43`, green `4C956C`, gold `E1A140`, coral `E4694E`, violet
  `6C6CBF`, page `F1F5FA`, ink `20303F`, mute `6B7A88`. **Fonts**: Cambria
  (headings) + Calibri (body) — both QA-safe.

## Demo slides + real-screenshot swap

Demo slides are built with `demoSlide(kicker, title, accent, steps, mockFn)`:
step list on the left, a **drawn UI mockup** (window via `frame()`, phone via
rounded rects) on the right. The mockup is a fallback — if a real screenshot
exists it is embedded instead:

- A module-level counter (`demoNum`, starts at 22) numbers the demo slides
  `slide23 … slide29` **by call order, independent of deck position** — so the
  screenshot filenames stay stable even if surrounding slides change. Keep the
  demo calls in a consistent order.
- Drop `slide23.png … slide29.png` (`.jpg` ok) in `D:\Desktop\INSET-Talk\screenshots\`.
  `findShot()` picks them up; `placeShot()` embeds each centered + framed inside
  a fixed box, preserving aspect ratio (uses the `image-size` npm package to
  read dimensions — `npm install image-size` if the require fails).
- Any missing screenshot keeps its mockup, so partial delivery works. Real
  teacher/student dashboards need Google auth, so **the user must supply the
  screenshots** — Claude can't sign in as them; give them a shot list.

## Talk structure (adapt the arc to the star of the talk)

Generic arc: **Open** (title, hook, roadmap) → **Part 1** (the why + what) →
**Part 2** (how it works — demo-driven) → **Part 3** (workshop intro + FAQ) →
**Close** (CTA). The bundled reference build is a **product talk about the
user's Class Submissions LMS**: Part 1 = the teacher pain → meet the LMS → the
core loop (submit→review→grade→publish) → links-not-uploads → free & private →
how it stays free; Part 2 = roles → structure → the 7 demo slides → a **feature
tour** (notification bell, records grid, photo ZIPs, accomplishment report,
roster/invites, multi-teacher + PWA, low-tech friendliness); Part 3 = hands-on
workshop. If the talk's star is a pedagogy/framework instead, keep the same
format and swap the content.

## Workshop facilitator guide template

Goal → **pre-session checklist** → **60-min timeline table** → the **student-vs-
teacher-view reality** (participants who sign in with Gmail land on the STUDENT
side; the teacher view is gated to the super admin + granted emails, so the
mainline = everyone joins as a student and submits; grant 1–2 volunteers via
Settings to show the teacher dashboard) → **run-of-show** with `Sabihin:` cues →
**troubleshooting table** → post-workshop wrap. See `reference/gen-workshop.js`.

## LMS demo facts (keep an LMS talk accurate)

Source of truth: repo `CLAUDE.md` + the [[student-lms]] skill. Key flow:
Google Sign-In only; teacher creates **Subject → Section (auto join code + QR) →
Assignment** (link or photo, `totalPoints`, optional instructions/rubric link);
student **joins by code/QR or email invite → picks name from roster → submits a
link or in-app photo** (retractable while `pending`); teacher **reviews/previews
in place → single score + feedback → Publish**; student sees the grade. Extras:
notification bell (pending / leave / new joins), records grid, photo ZIPs,
accomplishment report, roster/name-picker, multi-teacher isolation, installable
PWA + offline shell. Honor in messaging: **free Spark tier, no Storage/Functions,
links-only, phone-first, per-teacher isolation.** Sign-in fails inside
Messenger/FB/IG in-app browsers (`disallowed_useragent`) → open in Chrome/Safari;
`?debug=1` shows an on-screen error banner.

## Tooling (this is a Windows machine)

- Deck: **pptxgenjs** (`p.layout = "LAYOUT_WIDE"`). Colors never use `#`.
- Docs: **docx** (docx-js). US Letter = `size:{width:12240,height:15840}`; tables
  need `columnWidths` + per-cell DXA `width`; `ShadingType.CLEAR` for fills.
- Install in a scratch build dir if a require fails (`npm install pptxgenjs docx image-size`).
- **QA render (no LibreOffice/poppler here):**
  - Deck → images via PowerPoint COM: `Presentations.Open(path,$true,$false,$false)`
    then `.Export(dir,"PNG",1600,900)`. (A locked file = the user has it open;
    close it before overwriting/deleting.)
  - Docs → PDF via Word COM: `Documents.Open(path)` then
    `.ExportAsFixedFormat(pdf,17)`; rasterize the PDF with **PyMuPDF (`fitz`)**
    (`pip install pymupdf`) since poppler/pdftoppm aren't installed. Then Read the PNGs.
  - Validate the deck in UTF-8 mode: `PYTHONUTF8=1 python <pptx-skill>/scripts/office/validate.py deck.pptx`
    (a bare run false-alarms on em-dashes/curly quotes via cp1252).
- Do not add the generated `.pptx`/`.docx` deliverables to the app repo — they'd
  deploy to the live site. Keep them under `D:\Desktop\INSET-Talk\`.

## Reference generators (adapt, don't start from scratch)

`reference/gen-deck.js`, `reference/gen-script.js`, `reference/gen-workshop.js`,
and `reference/gen-handout.js` are the exact generators for the current
LMS-centered build (with the screenshot-swap wired in). To make a new talk:
copy them, edit the content arrays (`SL` in the script, the slide bodies +
`subject/feature` arrays in the deck, timeline/steps in the workshop, the
`step()` calls + join box in the handout), keep the helpers and style,
regenerate, and re-run the QA render. `gen-handout.js` targets **one printed
page** — keep it to a single page in QA (Word COM → PDF → PyMuPDF), it's meant
to be photocopied. Related: [[deped-teacher]], [[student-lms]], [[lms-domain]],
[[deped-accomplishment-report]], [[lac-session-docs]].
