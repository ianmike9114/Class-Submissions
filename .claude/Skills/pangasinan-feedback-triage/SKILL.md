---
name: pangasinan-feedback-triage
description: Pangasinan (Pangasinense) language expert for this LMS — interprets Pangasinan or Pangasinan-Taglish-English feedback (a bug report, a design/UX critique, or a feature idea from a developer, student or co-teacher), translates it to plain English, works out what the person actually means, confirms intent, then plans, fixes and ships it into the app (Plan Mode → edit → cache-buster bump → PR). Use whenever the user (or someone they quote, e.g. a Messenger reply) writes in Pangasinan/Taglish, shares a screenshot with Pangasinan captions, or asks to "interpret this and fix/integrate it".
---

# Pangasinan feedback triage

Some people around this LMS speak **Pangasinan** (the language of
Pangasinan province), not Tagalog. Feedback arrives as a mix of Pangasinan,
Tagalog, and **English technical terms** — from a student, a co-teacher, or
a developer critiquing the site. Pangasinan is a *different* language from
Tagalog (own vocabulary and grammar), so `tagalog-error-triage` will not
decode it; that is why this skill exists.

This skill's job: **interpret → confirm → plan → fix → ship.** Turn the
Pangasinan feedback into a clear English statement, decide whether it is a
**bug**, a **design/UX ask**, or a **feature idea**, confirm the intent with
the user when a choice matters (e.g. "what should happen on a breach?"), then
implement it end-to-end (section 7). It does **not** change the app's
on-screen language (UI stays English). It is the Pangasinan sibling of
`[[tagalog-error-triage]]`.

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
| satan / sa tan | for that / about that | "say strategy satan" = the strategy for that |
| ya | it is / the (linker) | "full screen mode ya tampol" = full screen mode right away |
| nanexit / na-exit | exited | `nan-`/`na-` + English verb = past tense of that verb |
| na-capture / capture to | captured / capture it | `to` = it / his / its |
| ira | they / them | |
| may | there is / there's | "may blink" = there's a blink |
| matic | automatically | slang from "automatic" (shared with Tagalog) |
| man | also / then / anyway | softener |
| la | already | "breach la" = it's already a breach |
| aliwan / aliwa | not / different from | "aliwan native app" = it's not a native app |
| maong | better / good | "maong nu…" = it'd be better if… |
| nu | if / when | |
| talag / talaga | really | |
| eh kasi | well, because | Tagalog filler, common in mixed messages |
| once na | once (that) | English + linker |

**Pattern rule:** Pangasinan verb prefixes stick onto English roots —
`nan-exit`, `na-capture`, `ma-submit`. Strip the prefix, read the English
verb, apply tense (`nan-`/`na-` = done/past, `ma-` = can/will).

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

## 4b. Worked example 2 — anti-cheat idea (shipped as full-screen breach mode)

**Original (Messenger thread):**
> "say strategy satan since mobile browser, full screen mode ya tampol, once
> na nanexit ira or capture to may blink ed screen matic man breach la"
> Chester Allan: "eh kasi aliwan native app maong nu made in android app talag"

**Decode:**
- *say strategy satan since mobile browser* → "the strategy for that, since
  it's a mobile browser:"
- *full screen mode ya tampol* → "put it in full-screen mode right away"
- *once na nanexit ira or capture to* → "once they exit it or capture it"
- *may blink ed screen matic man breach la* → "the screen blinks and it's
  automatically a breach"
- *eh kasi aliwan native app, maong nu made in android app talag* → "well,
  because it's not a native app — it'd be better if it were really made as
  an Android app."

**Classification:** feature idea (quiz anti-cheat). **Confirmed with user:**
breach = record + flag teacher + must return to full screen; 3rd breach
auto-submits. **Shipped:** `js/student.js` `runQuiz()` full-screen gate +
`recordBreach()`, `QUIZ_BREACH_LIMIT` in `js/quiz.js`, teacher flags in
`js/teacher.js` `quizResultHtml()`.

**Honest limits to tell the user (don't over-promise):**
- iPhone Safari has **no element full screen** and gives pages **no
  screenshot event** — there only app-switching counts as a breach.
- A website can never *block* screenshots. Only a native Android wrapper
  (WebView + `FLAG_SECURE`) can, and only on Android — Chester's point is
  right; it's a separate future project (`[[react-native-mobile]]`).

## 5. Output format

Reply with this short template, then hand off:

```
Original (Pangasinan): <verbatim quote / transcription>
English: <plain-English translation>
What they mean: <one-line intent>
Bug or design ask? <bug | design/UX — and why>
Where: <file/function for a bug, or UX area for a design ask>
Next step: <fix, ask for more info, or which skill takes it>
Fix plan: <files/functions to change, any decision the user must make>
Shipped in PR: <PR link once merged-ready>
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
- Never change the app's on-screen language (UI text stays English).

## 7. Fix and integrate (end-to-end)

1. **Plan Mode first** (user preference for every task in this repo): write
   the decoded message + intent into the plan's Context, ask the user any
   real choice with AskUserQuestion, then ExitPlanMode.
2. **Find where to edit** with `[[student-lms]]`; UI work reads
   `DESIGN_SYSTEM.md` first; rules changes go through `[[firestore-database]]`.
3. **Respect the hard constraints** in `CLAUDE.md`: no Firebase Storage, no
   Cloud Functions, no build step; keep changes backward-compatible (live
   production data).
4. **Verify** in the browser pane (`.claude/launch.json` static server) —
   stub Firestore/auth when the flow needs sign-in; add unit tests in
   `tests/unit/` for any pure helper.
5. **Ship**: bump every changed file's `?v=` (incl. sub-module imports like
   `quiz.js?v=`/`gemini.js?v=`), bump `sw.js` `CACHE_NAME`, update the
   relevant `CLAUDE.md` bullet, open a PR to `main`, wait for CI. Merge only
   when the user says so.
6. **Report back** in plain English: what it means, what changed, what was
   and wasn't tested, and any honest limit (e.g. iPhone).
