# Quizzes

Deliberate design decisions and known limits. Moved out of `CLAUDE.md` so they load only
when needed. Read before editing this area; add new notes for this area here.

- **Quiz assignments: anti-cheat is deterrence, not a lock.** Quizzes have
  their own home: teacher sidebar **📝 Quizzes** tab (`openQuizzes()`, every
  quiz across classes + a class picker that jumps to the section's Create card
  with Quiz picked), a third **Quiz** button in the Create card
  (`setCreateType("quiz")` locks link type to quiz; the dropdown's quiz option
  is `hidden`), and their own "📝 Quizzes" group at the top of a section's list.
  Students get an **Assignments | 📝 Quizzes** tab bar (`setStudentTab()`,
  remembered in localStorage); quiz cards render in `#quizzes-list` and are
  excluded from the course outline / Up next / resubmission callout. Still the
  same `assignments` docs (`allowedFileTypes: "quiz"`), so no data change. The
  builder (`js/teacher.js` `mountQuizBuilder()`): Gemini drafts 5-20 multiple choice / true-false /
  identification items from a topic (`js/gemini.js` `generateQuiz()`, teacher's
  own key), teacher edits every item. Students (`js/student.js` `runQuiz()`) get
  a full-screen one-item-at-a-time runner: no Back, per-item timer + overall
  deadline anchored to server `quizAttempts.startedAt` (one start per student),
  item + choice order shuffled per student (seeded, stable on refresh), no
  select/copy/right-click/paste, print hidden, question blurs when focus leaves,
  name/email watermark, and leaving the screen / PrintScreen / paste attempts
  are counted into `quizLog` and shown to the teacher as flags. **No web page can
  block a screenshot or a second phone's camera** — don't promise that. A
  tech-savvy student could also read the questions from the assignment doc
  before pressing Start (assignments are world-readable); answers are safe in
  owner-only `quizKeys`. Auto-score is computed on the teacher's side
  (`quizResultHtml()`, `js/quiz.js` `scoreQuiz()`), pre-fills the score box;
  teacher can "Accept" near-miss identification answers, then Publish as usual
  (no Return-for-revision for quizzes — "Allow retake" deletes the submission +
  attempt instead). **`firestore.rules` adds `quizKeys` + `quizAttempts`
  blocks — must `firebase deploy --only firestore:rules`**, else creating a
  quiz fails (the app removes the half-made assignment and says so).
  **AI provider: Groq first, Gemini fallback.** `js/gemini.js`'s `draftText()`
  backs `generateQuiz()`/`generateCodeExample()`: tries Groq
  (model auto-picked: `openai/gpt-oss-120b` first, falls back via `/models` on model_not_found — llama-3.3-70b was retired Aug 2026; OpenAI-compatible, free key from console.groq.com,
  stored as `groqApiKey` in localStorage like the Gemini key) and falls back to
  Gemini (`gemini-flash-latest` alias) if Groq has no key or fails. Rubric-check stays Gemini-only (images).
  **Question bank + moving watermark** (screenshot deterrence — iPhone
  screenshots are undetectable): optional `assignment.quiz.drawCount`; when <
  item count, each student gets a stable random subset via `js/quiz.js`'s
  `servedQuestions(questions, drawCount, studentUID + assignmentId)` (bank up to
  `QUIZ_MAX_BANK` 60, per-student max still 20, `totalPoints = drawCount`). The
  submission records `quizServed` (ids shown); teacher scoring (`servedFor()`)
  uses it, or rebuilds from the seed for older submissions. AI drafting can
  append to the bank (passes existing prompts as `avoid`). `runQuiz` also shows
  a drifting `.quiz-mover` badge (name · email · live clock).
  **Balanced choice lengths** (students guess the longest choice): `js/quiz.js`'s
  `choiceLengthWarning()` flags an MC item whose correct choice is strictly
  longest by ≥25% and ≥8 chars; the builder shows it live per item and asks to
  confirm on save (warning, not a block). `generateQuiz()`'s prompt tells the AI
  to keep all 4 choices similar in length with the answer never the longest.
  **Answer positions spread A–D** (AI drafts put the answer at A): students
  already see choices in a per-student shuffled order, but the saved bank is now
  balanced too - `js/quiz.js`'s `balanceAnswerPositions()` runs on every AI draft
  (new items only) and on the builder's "Spread answers A–D" button;
  `answerPatternWarning()` shows live and offers to spread on save. **Locked once
  any student has started** (edit builder counts `quizAttempts`): saved student
  answers are original choice indexes, so moving choices would mis-score them.
  **Full-screen breach mode** (developer feedback, decoded via the
  `pangasinan-feedback-triage` skill): `runQuiz` shows a "Continue in full
  screen" gate (fresh tap = user gesture) where `document.fullscreenEnabled`;
  exiting full screen, leaving the page, or the PrintScreen key is a breach
  (`recordBreach()`, 1.5s dedupe) → red blink + "Breach N of 3"; the 3rd
  (`QUIZ_BREACH_LIMIT`) auto-submits (`quizLog.breachSubmitted`, teacher sees
  🚨). iPhone Safari has no element full screen and no screenshot event — gate
  never shows there, only app-switching counts. Blocking screenshots needs a
  native Android wrapper (`FLAG_SECURE`) — built, see app bridge below.
  **Split screen / pop-up window pause**: on touch devices `runQuiz` covers
  the quiz (`.quiz-split-gate`) while `js/quiz.js`'s `isSplitWindow()` says the
  window is clearly smaller than the screen (width < 85%, or height < 60% when
  no input is focused — the keyboard), counting `quizLog.splitScreen` (teacher
  flag). Not a breach, so a false positive can't auto-submit. The Android app
  also sets `resizeableActivity="false"` (`prepare-android.sh`), so phones
  refuse split screen for it outright. **Second monitor**: `hasSecondScreen()`
  (`screen.isExtended`, Chrome/Edge only) sets `quizLog.secondScreen` + a
  student warning and the teacher flag "Second screen connected" — a flag, not
  a breach (docked laptops/projectors also trigger it).
  **Android app bridge** (`js/app-bridge.js`, inert in browsers): the
  optional Capacitor wrapper in `android-app/` loads the live site;
  `isLmsApp()` detects it. Inside the app `js/student.js`'s
  `syncScreenshotBlock()` turns `setScreenshotBlock()` (PrivacyScreen plugin →
  Android `FLAG_SECURE`, screenshots/recordings black) on while a **module**
  (open `.card[data-material]`, or any card with `data-protected` = `protectFile`) or a **quiz** is on screen, off otherwise —
  not the whole app, by request: students must still screenshot errors for
  the teacher. Called from `openAssignment()`, list re-render, tab switch and
  quiz cleanup. The flag outlives page loads, so `index.html` and
  `teacher.js` turn it off. `runQuiz` skips the full-screen gate in the app;
  `index.html` replaces Google's web button (blocked in WebViews) with the
  native picker → `signInWithGoogleIdToken()`. Teacher option
  `quiz.requireApp` ("Android students must use the app") makes Android
  browsers show a Download-the-app gate (`APP_APK_URL`, GitHub Releases)
  instead of Start — client-side deterrence, spoofable like the rest.
  **APK from the browser:** on Android browsers the header/login "Install
  app" button becomes "⬇ Get the Android app" (`js/pwa-install.js`
  `initInstallButton(id, { apkUrl, stepsHtml })` → `startApkDownload()`, used by
  `index.html` + `student.html`; teacher.html keeps the PWA install), and
  student.html shows a dismissible `#get-app-banner` (`initGetAppBanner()`,
  `lms.getAppDismissed`). Install steps are one shared
  `APK_INSTALL_STEPS_HTML` in `js/app-bridge.js`. Hidden inside the app;
  iPhone/desktop keep the PWA path.
  `gemini.js`/`quiz.js` imports carry their own `?v=` (bump when changed —
  `scripts/bump-version.mjs` doesn't cover sub-modules).
- **Quiz from a lesson file (PDF / .pptx).** The quiz builder's AI section takes
  a lesson file; `js/lesson-text.js`'s `extractLessonText()` reads its text in
  the teacher's browser (pdf.js lazy-loaded from jsdelivr; .pptx via the shared
  JSZip loader, slide + speaker-notes XML), trims it evenly to
  `LESSON_TEXT_MAX_CHARS` (15k, Groq free-tier size), and `generateQuiz({
  sourceText })` drafts every item from it (topic optional then). The file is
  never uploaded or saved; old `.ppt` and scanned (image-only) PDFs get a
  friendly error. Teacher still reviews every item. No rules change.
