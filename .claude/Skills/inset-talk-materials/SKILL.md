---
name: inset-talk-materials
description: Generate INSET / teacher-training talk materials for this project — an engaging PowerPoint deck (.pptx), a Taglish (English-dominant) speaker script (.docx), and a hands-on workshop facilitator guide (.docx) — in the visual style of the user's sample slides (colored category cards + chevron "learning flow" ribbon + footer takeaways). Use whenever the user asks to build/redo a presentation, talk, deck, slides, script, or workshop for an INSET, LAC follow-up, demo, or teacher orientation — especially about contextualized learning and/or the Class Submissions LMS. Pairs with the [[deped-teacher]] and [[student-lms]] skills.
---

# INSET talk materials

Produces three deliverables for a teacher-audience talk:

1. **Slide deck** (`.pptx`) — engaging, in the user's sample-slide style.
2. **Speaker script** (`.docx`) — **Taglish, English-dominant**, per-slide.
3. **Workshop facilitator guide** (`.docx`) — Taglish, step-by-step run-of-show.

Default output folder: **`D:\Desktop\INSET-Talk\`** (outside the app repo, so
nothing touches the live Vercel site). Confirm/adjust with the user.

## The standing register rule — Taglish, English-dominant

Every **guide / script / tutorial / step-by-step with descriptions** is written
in Taglish, English-dominant (see the `taglish-guides-register` memory):

- English-dominant sentences; Filipino as connectors / warmth / emphasis
  (*kaya, diba, yung, para, ganito, tapos, sige, wag mag-alala*).
- **All technical terms, UI labels, and step verbs stay English**
  ("Tap **Sign in with Google**", "click **Add assignment**").
- Slide text, headings, and labels: **English**. Only the spoken script and
  facilitator notes carry the Taglish flavor.
- Tone: teacher-to-teacher, encouraging, not academic.
- Normal chat with the user stays **plain English** — the Taglish is for the
  produced documents only.

## Ask first (scope questions)

Before building, confirm: **talk focus** (framework? the LMS? both?),
**duration** (sizes slide count + script length), **workshop task** (what
teachers actually do), **access mode** (phones-on live vs demo-only vs
screenshots), and whether to use the **real live app**
(`deped-class-submissions.vercel.app`). Sizing: a live demo eats ~15 min with
few slides; for a mixed-subject audience prefer ~1 slide/1.5–2 min plus section
dividers and one worked example per subject.

## Engaging slide visual style (mirror the sample slides)

The user's reference deck uses a specific, repeatable visual language — match it:

- **Colored category cards**: a rounded white card with a solid colored header
  band, an emoji in a tinted circle, a bold colored sub-question, and a short
  description. Four categories map to four colors (teal / blue / brown / green).
- **Chevron "learning flow" ribbon**: overlapping `homePlate` (first) + `chevron`
  segments, each "STEP N + label", cycling the palette; optional detail cards
  underneath.
- **Footer takeaway bar**: a rounded (not full-bleed) colored bar with a 💡 and
  one bold sentence — the slide's one-line "why it works."
- **Section dividers**: dark navy, big "PART N" kicker in gold, serif title, a
  large emoji-in-circle on the right.
- **Icons = emoji** (`fontFace: "Segoe UI Emoji"`), NOT react-icons — they render
  in full color in the user's PowerPoint and skip a fragile pipeline.
- **Palette** (hex, no `#`): navy `14304A`, teal `2A9D8F`, blue `2F6DB5`,
  brown `9B6A43`, green `4C956C`, gold `E1A140`, coral `E4694E`, page `F1F5FA`,
  ink `20303F`, mute `6B7A88`. **Fonts**: Cambria (headings) + Calibri (body) —
  both QA-safe.
- Demo slides: draw clean **UI mockups** (window/phone frames via helpers), and
  add a small note that the user can swap in a real screenshot. Leave name/school
  and QR/join-code as fill-in blanks.

See `reference/gen-deck.js` for the full helper set (`card`, `iconCircle`,
`ribbon`, `frame`, `btn`, `field`, `takeaway`, `divider`) and every slide.

## Talk structure template (~1 hr example)

Opening (title, ice-breaker, roadmap) → **Part 1 Why** (problem, definition,
why-it-works) → **Part 2 Framework** (4-part model, learning-flow ribbon, one
worked example, one example per subject, "notice the pattern" bridge) → **Part 3
The Tool** (the gap, meet the LMS, how-it-fits flow, zero-cost/privacy) → **Part
4 Live Demo** (teacher: subject→section→QR→assignment; student: sign-in→join→
submit; teacher: review→grade→publish; student: sees grade; bonus features) →
**Part 5 Workshop intro** (instructions + big QR, FAQ) → **Close** (CTA). The
bridge (framework → tool) is the question *"saan pupunta ang student output?"*

## Workshop facilitator guide template

Goal → **pre-session checklist** → **60-min timeline table** → the **student-vs-
teacher-view reality** (participants who sign in with Gmail land on the STUDENT
side; teacher view is gated to the super admin + granted emails, so the mainline
= everyone joins as a student and submits; grant 1–2 volunteers via Settings to
show the teacher dashboard) → **run-of-show** with `Sabihin:` cues → **troubleshooting
table** → post-workshop wrap. See `reference/gen-workshop.js`.

## LMS demo facts (keep the script accurate)

Source of truth: repo `CLAUDE.md` + the [[student-lms]] skill. Key flow:
Google Sign-In only; teacher creates **Subject → Section (auto join code + QR) →
Assignment** (link or photo, `totalPoints`, optional instructions/rubric link);
student **joins by code/QR or email invite → picks name from roster → submits a
link or in-app photo** (retractable while `pending`); teacher **reviews/previews
in place → single score + feedback → Publish**; student sees the grade. Extras:
notification bell (pending / leave / new joins), records grid, photo ZIPs,
accomplishment report. Constraints to honor in messaging: **free Spark tier, no
Storage/Functions, links-only, phone-first, per-teacher isolation.** Sign-in
fails inside Messenger/FB/IG in-app browsers (`disallowed_useragent`) → open in
Chrome/Safari; `?debug=1` shows an on-screen error banner.

## Tooling (this is a Windows machine)

- Deck: **pptxgenjs** (`p.layout = "LAYOUT_WIDE"`). Colors never use `#`.
- Docs: **docx** (docx-js). US Letter = `size:{width:12240,height:15840}`; tables
  need `columnWidths` + per-cell DXA `width`; `ShadingType.CLEAR` for fills.
- Install both in a scratch build dir if `require` fails (`npm install pptxgenjs docx`).
- **QA render (no LibreOffice/poppler here):**
  - Deck → images via PowerPoint COM: `Presentations.Open(path,$true,$false,$false)`
    then `.Export(dir,"PNG",1600,900)`.
  - Docs → PDF via Word COM: `Documents.Open(path)` then
    `.ExportAsFixedFormat(pdf,17)`; rasterize the PDF with **PyMuPDF (`fitz`)**
    (`pip install pymupdf`) since poppler/pdftoppm aren't installed. Then Read the PNGs.
  - Validate the deck in UTF-8 mode: `PYTHONUTF8=1 python <pptx-skill>/scripts/office/validate.py deck.pptx`
    (a bare run false-alarms on em-dashes/curly quotes via cp1252).
- Do not add these deliverables to the app repo — they'd deploy to the live site.

## Reference generators (adapt, don't start from scratch)

`reference/gen-deck.js`, `reference/gen-script.js`, `reference/gen-workshop.js`
are the exact generators for the first build. To make a new talk: copy them, edit
the content arrays (`SL` in the script, `subjExamples`/slide bodies in the deck,
timeline/steps in the workshop), keep the helpers and style, regenerate, and
re-run the QA render. Related: [[deped-teacher]], [[student-lms]], [[lms-domain]],
[[deped-accomplishment-report]], [[lac-session-docs]].
