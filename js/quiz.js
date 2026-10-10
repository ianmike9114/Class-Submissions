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
export const QUIZ_TYPES = { mc: "Multiple choice", tf: "True / False", id: "Identification" };
// Extra seconds allowed past the official time limit before the teacher's
// review flags a submission as "over time" (slow networks, auto-submit lag).
export const QUIZ_GRACE_SECONDS = 60;

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
  if (items.length > QUIZ_MAX_ITEMS) return `A quiz can have at most ${QUIZ_MAX_ITEMS} items.`;
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
