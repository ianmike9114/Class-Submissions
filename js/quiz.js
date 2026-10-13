// Pure quiz helpers shared by teacher.js (builder + auto-scoring) and
// student.js (taking the quiz). No DOM, no Firestore - unit-tested in
// tests/unit/quiz.test.js.
//
// Item shapes:
//   builder item (teacher only, has the answer):
//     { id, type: "mc"|"tf"|"id", prompt, choices?: [4 strings], answer }
//       mc answer = index into choices (0-3)
//       tf answer = true|false
//       id answer = [accepted strings]
//   question (stored on the assignment doc, world-readable - NO answer):
//     { id, type, prompt, choices? }
//   key (stored in quizKeys/{assignmentId}, owner-only):
//     { [id]: answer }
//   student answers (on the submission): { [id]: number|boolean|string }
//     mc answers are the ORIGINAL choice index, even though choices are
//     shown shuffled, so the key never depends on display order.

export const QUIZ_MIN_ITEMS = 5;
export const QUIZ_MAX_ITEMS = 20;
// Question bank: the teacher may write more items than each student gets
// (quiz.drawCount); each student is served a stable random subset, so a
// shared screenshot only covers part of what classmates see.
export const QUIZ_MAX_BANK = 60;
export const QUIZ_TYPES = { mc: "Multiple choice", tf: "True / False", id: "Identification" };
// Extra seconds allowed past the official time limit before the teacher's
// review flags a submission as "over time" (slow networks, auto-submit lag).
export const QUIZ_GRACE_SECONDS = 60;
// Leaving full screen, switching apps, or the screenshot key = a "breach";
// this many auto-submits the quiz with the answers so far.
export const QUIZ_BREACH_LIMIT = 3;

// Split screen / pop-up window on a phone or tablet: the quiz window is
// clearly smaller than the screen. Width alone is safe (the keyboard never
// changes it); height only counts when no input is focused, because the
// keyboard shrinks it while typing an identification answer. Desktop windows
// (no touch) are never flagged.
export function isSplitWindow({ touch, typing, innerWidth, innerHeight, screenWidth, screenHeight }) {
  if (!touch || !screenWidth || !screenHeight) return false;
  return innerWidth < screenWidth * 0.85 || (!typing && innerHeight < screenHeight * 0.6);
}

// More than one display attached (Chrome/Edge `screen.isExtended`; undefined
// on Safari, Firefox and phones, so those never flag). It says a second
// screen exists, not that the student looked at it.
export function hasSecondScreen(scr) {
  return scr?.isExtended === true;
}

// FNV-1a 32-bit - turns "uid + assignmentId" into a stable shuffle seed, so a
// refresh shows the same order (no rerolling for an easier order).
export function hashSeed(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fisher-Yates with a seeded PRNG. Returns a new array; input untouched.
export function seededShuffle(arr, seed) {
  const out = arr.slice();
  const rand = mulberry32(typeof seed === "number" ? seed : hashSeed(String(seed)));
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// The questions one student actually gets: the whole quiz in a stable
// per-student order, or - when drawCount is a valid bank size - the first
// drawCount of that order. Same seed (studentUID + assignmentId) on both the
// student and teacher side, so the teacher can rebuild it for old
// submissions that predate submission.quizServed.
export function servedQuestions(questions, drawCount, seed) {
  const order = seededShuffle(questions || [], seed);
  const n = Number(drawCount);
  return Number.isInteger(n) && n > 0 && n < order.length ? order.slice(0, n) : order;
}

// Lenient Identification matching: case, accents, spaces and punctuation
// don't matter ("Photo-synthesis " == "photosynthesis").
export function normalizeAnswer(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// "a; b ;c" -> ["a","b","c"] (teacher's accepted-answers box).
export function splitAccepted(text) {
  return String(text ?? "").split(";").map((t) => t.trim()).filter(Boolean);
}

export function isCorrect(type, keyVal, ans) {
  if (ans === undefined || ans === null || ans === "") return false;
  if (type === "mc") return Number(ans) === Number(keyVal);
  if (type === "tf") return ans === keyVal;
  if (type === "id") {
    const got = normalizeAnswer(ans);
    if (!got) return false;
    const accepted = Array.isArray(keyVal) ? keyVal : [keyVal];
    return accepted.some((k) => normalizeAnswer(k) === got);
  }
  return false;
}

// overrides: { [id]: true } marks an item correct by the teacher's call
// (e.g. a misspelled Identification answer they decide to accept).
export function scoreQuiz(questions, key, answers, overrides = {}) {
  const perItem = {};
  let score = 0;
  for (const q of questions || []) {
    const ok = !!overrides[q.id] || isCorrect(q.type, key?.[q.id], answers?.[q.id]);
    perItem[q.id] = ok;
    if (ok) score++;
  }
  return { score, total: (questions || []).length, perItem };
}

export function quizTimeLimitSeconds(itemCount, secondsPerItem) {
  return Math.max(0, Number(itemCount) || 0) * Math.max(0, Number(secondsPerItem) || 0);
}

export function quizDeadlineMs(startedAtMs, itemCount, secondsPerItem) {
  return startedAtMs + quizTimeLimitSeconds(itemCount, secondsPerItem) * 1000;
}

// Builder items -> { questions (safe to publish), answers (key) }.
export function splitQuiz(items) {
  const questions = [];
  const answers = {};
  for (const it of items) {
    const q = { id: it.id, type: it.type, prompt: it.prompt.trim() };
    if (it.type === "mc") q.choices = it.choices.map((c) => c.trim());
    questions.push(q);
    answers[it.id] = it.type === "id" ? it.answer.map((a) => a.trim()).filter(Boolean) : it.answer;
  }
  return { questions, answers };
}

// Inverse of splitQuiz, for editing an existing quiz.
export function joinQuiz(questions, answers) {
  return (questions || []).map((q) => ({
    id: q.id,
    type: q.type,
    prompt: q.prompt || "",
    choices: q.type === "mc" ? [...(q.choices || []), "", "", "", ""].slice(0, 4) : undefined,
    answer: answers?.[q.id] ?? (q.type === "tf" ? true : q.type === "id" ? [] : 0),
  }));
}

// Returns an error string for the first problem, or null if the quiz is ready.
export function validateQuizItems(items) {
  if (!Array.isArray(items) || items.length < QUIZ_MIN_ITEMS) return `A quiz needs at least ${QUIZ_MIN_ITEMS} items.`;
  if (items.length > QUIZ_MAX_BANK) return `A quiz can have at most ${QUIZ_MAX_BANK} items.`;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const n = i + 1;
    if (!it.prompt || !it.prompt.trim()) return `Item ${n} has no question.`;
    if (it.type === "mc") {
      if (!Array.isArray(it.choices) || it.choices.length !== 4 || it.choices.some((c) => !c || !c.trim())) {
        return `Item ${n} needs all 4 choices filled in.`;
      }
      if (![0, 1, 2, 3].includes(Number(it.answer))) return `Item ${n}: pick the correct choice.`;
    } else if (it.type === "tf") {
      if (typeof it.answer !== "boolean") return `Item ${n}: pick True or False as the answer.`;
    } else if (it.type === "id") {
      if (!Array.isArray(it.answer) || it.answer.filter((a) => a && a.trim()).length === 0) {
        return `Item ${n} needs at least one accepted answer.`;
      }
    } else {
      return `Item ${n} has an unknown type.`;
    }
  }
  return null;
}

// Students learn that the longest choice is usually the right one. Flag an
// MC item when the correct choice is strictly the longest AND beats the
// next-longest by >= 25% and >= 8 characters (so "RAM" vs "ROM"-sized
// differences don't nag). Returns a warning string or null.
export function choiceLengthWarning(choices, answer) {
  if (!Array.isArray(choices) || choices.length !== 4) return null;
  const lens = choices.map((c) => String(c ?? "").trim().length);
  if (lens.some((n) => n === 0)) return null;
  const a = Number(answer);
  if (![0, 1, 2, 3].includes(a)) return null;
  const others = Math.max(...lens.filter((_, i) => i !== a));
  const mine = lens[a];
  if (mine <= others) return null;
  if (mine - others < 8 || mine < others * 1.25) return null;
  return "The correct answer is noticeably the longest choice - students may guess it. Lengthen the other choices or shorten this one.";
}

export function countChoiceLengthWarnings(items) {
  return (items || []).filter((it) => it.type === "mc" && choiceLengthWarning(it.choices, it.answer)).length;
}

// AI drafts (and many hand-typed quizzes) put the correct answer at A. Students
// already see choices in a per-student shuffled order (js/student.js
// renderItem), but the saved bank - what the teacher sees, prints or leaks -
// shouldn't have a pattern either. Moves each MC item's correct choice to a
// target slot from a shuffled round-robin over A-D (10 items -> 3/3/2/2, no
// long runs) and shuffles the wrong choices into the rest. Returns new items;
// non-MC items are returned unchanged. NEVER run on a quiz students have
// started: their saved answers are original choice indexes.
export function balanceAnswerPositions(items, rand = Math.random) {
  const shuffle = (arr) => {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  const mcCount = (items || []).filter(isBalanceableMc).length;
  const targets = [];
  while (targets.length < mcCount) targets.push(...shuffle([0, 1, 2, 3]));
  const slots = shuffle(targets.slice(0, mcCount));
  let k = 0;
  return (items || []).map((it) => {
    if (!isBalanceableMc(it)) return it;
    const correct = it.choices[Number(it.answer)];
    const wrong = shuffle(it.choices.filter((_, i) => i !== Number(it.answer)));
    const target = slots[k++];
    const choices = [...wrong.slice(0, target), correct, ...wrong.slice(target)];
    return { ...it, choices, answer: target };
  });
}

function isBalanceableMc(it) {
  return it && it.type === "mc" && Array.isArray(it.choices) && it.choices.length === 4
    && [0, 1, 2, 3].includes(Number(it.answer));
}

// Pattern a student could exploit across the whole quiz: one letter holding
// most MC answers, or True/False items that are almost all the same answer.
// Returns a warning string or null.
export function answerPatternWarning(items) {
  const mc = (items || []).filter(isBalanceableMc);
  if (mc.length >= 4) {
    const counts = [0, 0, 0, 0];
    mc.forEach((it) => counts[Number(it.answer)]++);
    const top = Math.max(...counts);
    if (top > mc.length / 2) {
      return `${top} of ${mc.length} multiple-choice answers are ${"ABCD"[counts.indexOf(top)]} - students may spot the pattern. Use "Spread answers A–D".`;
    }
  }
  const tf = (items || []).filter((it) => it && it.type === "tf" && typeof it.answer === "boolean");
  if (tf.length >= 4) {
    const trues = tf.filter((it) => it.answer === true).length;
    const top = Math.max(trues, tf.length - trues);
    if (top >= tf.length * 0.8) {
      return `${top} of ${tf.length} True/False answers are ${trues >= tf.length - trues ? "True" : "False"} - reword a few statements so the answers are mixed.`;
    }
  }
  return null;
}

export function newItemId() {
  return "q" + Math.random().toString(36).slice(2, 10);
}

// Sanitizes Gemini's JSON ({ items: [...] } or a bare array) into builder
// items. Anything malformed is dropped rather than trusted.
export function parseGeneratedQuiz(data) {
  const raw = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
  const out = [];
  for (const r of raw) {
    if (!r || typeof r.prompt !== "string" || !r.prompt.trim()) continue;
    const type = String(r.type || "").toLowerCase();
    if (type === "mc") {
      const choices = Array.isArray(r.choices) ? r.choices.map((c) => String(c ?? "").trim()) : [];
      const answer = Number(r.answer);
      if (choices.length !== 4 || choices.some((c) => !c) || ![0, 1, 2, 3].includes(answer)) continue;
      out.push({ id: newItemId(), type, prompt: r.prompt.trim(), choices, answer });
    } else if (type === "tf") {
      const answer = r.answer === true || String(r.answer).toLowerCase() === "true";
      out.push({ id: newItemId(), type, prompt: r.prompt.trim(), answer });
    } else if (type === "id") {
      const answer = (Array.isArray(r.answer) ? r.answer : [r.answer])
        .map((a) => String(a ?? "").trim()).filter(Boolean);
      if (answer.length === 0) continue;
      out.push({ id: newItemId(), type, prompt: r.prompt.trim(), answer });
    }
  }
  return out;
}

// "7m 05s" style duration for the teacher's review.
export function formatDuration(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
}
