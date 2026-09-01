---
name: pangasinan-feedback-triage
description: Interpret Pangasinan or Pangasinan-Taglish feedback about this LMS — a bug report OR a design/UX critique (e.g. from a developer reviewing the site) — translate it to plain English, work out what the person actually means, decide whether it is a bug or a design ask, point at the affected file or UX area, and route to the fix. Use whenever the user (or someone they quote) writes feedback, a complaint, or a critique in Pangasinan/Taglish, or shares a screenshot with Pangasinan captions.
---

# Pangasinan feedback triage

Some people around this LMS speak **Pangasinan** (the language of
Pangasinan province), not Tagalog. Feedback arrives as a mix of Pangasinan,
Tagalog, and **English technical terms** — from a student, a co-teacher, or
a developer critiquing the site. Pangasinan is a *different* language from
Tagalog (own vocabulary and grammar), so `tagalog-error-triage` will not
decode it; that is why this skill exists.

This skill's job is narrow: **translate, classify, and route.** Turn the
Pangasinan feedback into a clear English statement, decide whether it is a
**bug** or a **design/UX ask**, then hand off. This skill does **not** edit
app code, and it does **not** change the app's on-screen language. It is the
Pangasinan sibling of `[[tagalog-error-triage]]`.

## 1. First step — capture before you translate

- Copy the **exact** Pangasinan/Taglish wording verbatim, including any
  English technical terms embedded in it.
- **Keep the English terms as the strongest signal.** Feedback like
  "user flow", "use case", "UI/UX", "Google Classroom", "instructional
  material", plus any Firebase/browser error code, tells you the real
  subject even when the sentence around it is Pangasinan.
- Screenshot: transcribe both the on-screen text (usually English) and the
  Pangasinan caption word-for-word before diagnosing.
- If it is vague, say what's missing and ask for the exact wording or a
  screenshot rather than guessing.

## 2. Recognise Pangasinan (so you don't mis-read it as Tagalog)

Distinctive Pangasinan markers — if you see these, it is Pangasinan, not
Tagalog, and the Tagalog glossary will mislead you:

`ed` (in / at / to — the giveaway preposition) · `so` / `say` (the; subject
marker) · `ag` / `agmo` / `aggmo` (not / you-don't) · `katon` / `kanian`
(that's why / so) · `walay` (there is / there should be) · `tan` (and) ·
`ka` (you) · `angala` / `ala` / `naala` (take / get / was able to get) ·
`amay` / `aman` (that / the) · `sigro` (maybe) · `dapat` (should — shared
with Tagalog) · `mo` (your / you).

## 3. Pangasinan → English glossary

Seeded from real feedback vocabulary (including the developer critique this
skill was built from). Spelling varies — Pangasinan has no single
orthography, so match loosely.

| Pangasinan / Taglish | English | Note |
|---|---|---|
| sigro / siguro | maybe, probably | hedge — the point is still a real concern |
| amay / aman / say | the, that | article / marker, often drop in translation |
| so | the / is (subject marker) | grammatical, not a content word |
| factor katon | "…is the factor, that's why…" | `katon`/`kanian` = that's why / therefore |
| ag / agmo / aggmo | not / you-don't | negation — flips the whole clause |
| msyadon / masyadon | too much / really | intensifier |
| naala / naalan | got / grasped / was able to get | `na-` = ability; `ala` = get |
| tampol | immediately / right away / agad | urgency / "at once" |
| user flow to | "its user flow" | `to` = his/its (possessive) |
| walay | there is / there should be | `wala` + `y`; often "dapat walay" = there should be |
| tan | and | conjunction |
| alway / always | always | English, kept |
| angala ka | you should take / adopt | `ala` = take/get, `ka` = you |
| na | of / the | linker/particle |
| ed | in / at / to | preposition — key Pangasinan marker |
| especially | especially | English, kept |
| onla / onLa | go / proceed | movement |
| onong / unong | according to / follow | |
| aliwa | wrong / not right | |
| duga / dukey | correct / right | |
| mairap / mairan | hard / difficult | |

Keep a running note: add new words here as more Pangasinan feedback comes
in — this glossary is meant to grow.

## 4. Worked example (the critique this skill was built from)

**Original (Pangasinan/Taglish):**
> "sigro amay ui so factor katon aggmo msyadon naalan tampol so user flow
> to, dapat walay use case flow tan prompt mo alway best UI/UX"
> "dapat angala ka na process na google classroom especially ed
> instructional material creation"

**Decode:**
- *sigro amay UI so factor katon* → "maybe the UI is the factor, that's why…"
- *aggmo msyadon naalan tampol so user flow to* → "you can't grasp its user
  flow right away."
- *dapat walay use case flow tan prompt mo alway best UI/UX* → "there should
  be a use-case flow, and (when prompting) always aim for the best UI/UX."
- *dapat angala ka na process na google classroom especially ed
  instructional material creation* → "you should adopt Google Classroom's
  process, especially for instructional-material creation."

**Plain English:** The UI's user flow isn't immediately obvious. Define a
clear use-case flow and aim for best-practice UI/UX — and specifically make
**instructional-material creation** work like **Google Classroom**.

**Classification:** design/UX ask (not a bug). **Route:**
`[[classroom-material-flow]]` for the material-creation model, plus
`[[frontend-editing]]` + `[[responsive-design]]` for the craft.

## 5. Output format

Reply with this short template, then hand off:

```
Original (Pangasinan): <verbatim quote / transcription>
English: <plain-English translation>
What they mean: <one-line intent>
Bug or design ask? <bug | design/UX — and why>
Where: <file/function for a bug, or UX area for a design ask>
Next step: <fix, ask for more info, or which skill takes it>
```

## 6. Route to the fix — reuse, don't restate

- **Bug** → `[[tagalog-error-triage]]` (shares the error-code table +
  output pattern) and `[[student-lms]]` (where-to-edit map). Check
  `CLAUDE.md` "Known v1 limitations" first — many "problems" are deliberate
  documented behavior.
- **Design / UX ask about material creation or teacher flow** →
  `[[classroom-material-flow]]` (the Classroom-style playbook this critique
  points at), then `[[frontend-editing]]` and `[[responsive-design]]` to
  build it.
- Never edit app code or change on-screen language from this skill — it
  interprets and routes only.
