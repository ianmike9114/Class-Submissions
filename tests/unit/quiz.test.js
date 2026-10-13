// Unit tests for js/quiz.js (pure quiz helpers).
import { describe, it, expect } from "vitest";
import {
  hashSeed, seededShuffle, normalizeAnswer, splitAccepted, isCorrect, scoreQuiz,
  quizDeadlineMs, splitQuiz, joinQuiz, validateQuizItems, parseGeneratedQuiz, formatDuration,
  servedQuestions, QUIZ_MAX_BANK, choiceLengthWarning, countChoiceLengthWarnings, QUIZ_BREACH_LIMIT,
  balanceAnswerPositions, answerPatternWarning, isSplitWindow,
} from "../../js/quiz.js";

describe("isSplitWindow", () => {
  const phone = { touch: true, typing: false, screenWidth: 400, screenHeight: 860 };
  it("full-screen phone is not split", () => {
    expect(isSplitWindow({ ...phone, innerWidth: 400, innerHeight: 780 })).toBe(false);
  });
  it("side-by-side split (narrow) is split", () => {
    expect(isSplitWindow({ ...phone, innerWidth: 190, innerHeight: 780 })).toBe(true);
  });
  it("top/bottom split (short) is split", () => {
    expect(isSplitWindow({ ...phone, innerWidth: 400, innerHeight: 400 })).toBe(true);
  });
  it("keyboard while typing is not split", () => {
    expect(isSplitWindow({ ...phone, typing: true, innerWidth: 400, innerHeight: 400 })).toBe(false);
  });
  it("narrow is split even while typing", () => {
    expect(isSplitWindow({ ...phone, typing: true, innerWidth: 190, innerHeight: 400 })).toBe(true);
  });
  it("desktop (no touch) is never flagged", () => {
    expect(isSplitWindow({ ...phone, touch: false, innerWidth: 190, innerHeight: 300 })).toBe(false);
  });
  it("missing screen size is never flagged", () => {
    expect(isSplitWindow({ touch: true, typing: false, innerWidth: 100, innerHeight: 100, screenWidth: 0, screenHeight: 0 })).toBe(false);
  });
});

describe("seededShuffle", () => {
  const arr = Array.from({ length: 20 }, (_, i) => i);
  it("is stable for the same seed", () => {
    expect(seededShuffle(arr, "uid1a1")).toEqual(seededShuffle(arr, "uid1a1"));
  });
  it("differs between students", () => {
    expect(seededShuffle(arr, "uid1a1")).not.toEqual(seededShuffle(arr, "uid2a1"));
  });
  it("is a permutation and leaves input untouched", () => {
    const out = seededShuffle(arr, hashSeed("x"));
    expect([...out].sort((a, b) => a - b)).toEqual(arr);
    expect(arr[0]).toBe(0);
  });
});

describe("normalizeAnswer / isCorrect", () => {
  it("ignores case, spaces, punctuation, accents", () => {
    expect(normalizeAnswer("Photo-synthesis ")).toBe("photosynthesis");
    expect(normalizeAnswer("photo synthesis")).toBe("photosynthesis");
    expect(normalizeAnswer("Piñatubo")).toBe("pinatubo");
  });
  it("matches identification against any accepted answer", () => {
    expect(isCorrect("id", ["CPU", "central processing unit"], "Central Processing Unit")).toBe(true);
    expect(isCorrect("id", ["CPU"], "GPU")).toBe(false);
    expect(isCorrect("id", ["CPU"], "  ")).toBe(false);
  });
  it("mc compares original index, tf compares boolean", () => {
    expect(isCorrect("mc", 2, 2)).toBe(true);
    expect(isCorrect("mc", 2, 1)).toBe(false);
    expect(isCorrect("mc", 0, undefined)).toBe(false);
    expect(isCorrect("tf", false, false)).toBe(true);
    expect(isCorrect("tf", true, false)).toBe(false);
  });
  it("splitAccepted splits on semicolons", () => {
    expect(splitAccepted(" CPU ; central processing unit;; ")).toEqual(["CPU", "central processing unit"]);
  });
});

describe("scoreQuiz", () => {
  const questions = [
    { id: "a", type: "mc" }, { id: "b", type: "tf" }, { id: "c", type: "id" },
  ];
  const key = { a: 1, b: true, c: ["RAM"] };
  it("scores mixed types", () => {
    const r = scoreQuiz(questions, key, { a: 1, b: false, c: "ram" });
    expect(r).toEqual({ score: 2, total: 3, perItem: { a: true, b: false, c: true } });
  });
  it("applies teacher overrides", () => {
    expect(scoreQuiz(questions, key, { c: "rma" }, { c: true }).score).toBe(1);
  });
  it("handles missing answers", () => {
    expect(scoreQuiz(questions, key, undefined).score).toBe(0);
  });
});

describe("deadline + duration", () => {
  it("adds items x seconds", () => {
    expect(quizDeadlineMs(1000, 10, 60)).toBe(1000 + 600000);
  });
  it("formats durations", () => {
    expect(formatDuration(425000)).toBe("7m 05s");
    expect(formatDuration(9000)).toBe("9s");
  });
});

describe("split/join/validate", () => {
  const items = [
    { id: "1", type: "mc", prompt: " Q1 ", choices: ["a", "b", "c", "d"], answer: 3 },
    { id: "2", type: "tf", prompt: "Q2", answer: false },
    { id: "3", type: "id", prompt: "Q3", answer: [" x ", ""] },
    { id: "4", type: "tf", prompt: "Q4", answer: true },
    { id: "5", type: "tf", prompt: "Q5", answer: true },
  ];
  it("split keeps answers out of questions", () => {
    const { questions, answers } = splitQuiz(items);
    expect(JSON.stringify(questions)).not.toContain("answer");
    expect(questions[0]).toEqual({ id: "1", type: "mc", prompt: "Q1", choices: ["a", "b", "c", "d"] });
    expect(answers).toEqual({ 1: 3, 2: false, 3: ["x"], 4: true, 5: true });
  });
  it("join round-trips", () => {
    const { questions, answers } = splitQuiz(items);
    const back = joinQuiz(questions, answers);
    expect(back[0].answer).toBe(3);
    expect(back[2].answer).toEqual(["x"]);
  });
  it("validates counts and completeness", () => {
    expect(validateQuizItems(items)).toBeNull();
    expect(validateQuizItems(items.slice(0, 4))).toMatch(/at least 5/);
    const bad = items.map((it) => ({ ...it }));
    bad[0].choices = ["a", "", "c", "d"];
    expect(validateQuizItems(bad)).toMatch(/Item 1/);
  });
});

describe("parseGeneratedQuiz", () => {
  it("keeps valid items and drops malformed ones", () => {
    const out = parseGeneratedQuiz({
      items: [
        { type: "mc", prompt: "Q", choices: ["a", "b", "c", "d"], answer: 2 },
        { type: "mc", prompt: "bad", choices: ["a", "b"], answer: 0 },
        { type: "tf", prompt: "T", answer: "false" },
        { type: "id", prompt: "I", answer: "CPU" },
        { type: "essay", prompt: "nope" },
      ],
    });
    expect(out.map((i) => i.type)).toEqual(["mc", "tf", "id"]);
    expect(out[1].answer).toBe(false);
    expect(out[2].answer).toEqual(["CPU"]);
    expect(out[0].id).toMatch(/^q/);
  });
});

describe("servedQuestions", () => {
  const qs = Array.from({ length: 30 }, (_, i) => ({ id: "q" + i }));
  it("returns every question (old order) when there is no bank", () => {
    expect(servedQuestions(qs, undefined, "uA1")).toEqual(seededShuffle(qs, "uA1"));
    expect(servedQuestions(qs, 30, "uA1")).toHaveLength(30);
    expect(servedQuestions(qs, 99, "uA1")).toHaveLength(30);
  });
  it("draws a stable subset per seed", () => {
    const a = servedQuestions(qs, 10, "uA1");
    expect(a).toHaveLength(10);
    expect(servedQuestions(qs, 10, "uA1")).toEqual(a);
  });
  it("gives different students different subsets", () => {
    const a = servedQuestions(qs, 10, "uA1").map((q) => q.id).sort().join();
    const b = servedQuestions(qs, 10, "uB1").map((q) => q.id).sort().join();
    expect(a).not.toBe(b);
  });
  it("lets the bank exceed the per-student max", () => {
    const items = Array.from({ length: QUIZ_MAX_BANK }, (_, i) => ({ id: "q" + i, type: "tf", prompt: "p" + i, answer: true }));
    expect(validateQuizItems(items)).toBeNull();
    expect(validateQuizItems([...items, items[0]])).toMatch(/at most/);
  });
});

describe("choiceLengthWarning", () => {
  it("passes balanced choices", () => {
    expect(choiceLengthWarning(["Phishing email", "Strong password", "Firewall rule", "Antivirus scan"], 1)).toBeNull();
  });
  it("flags a correct answer that is clearly the longest", () => {
    expect(choiceLengthWarning(["CPU", "RAM", "A program that copies itself to other computers", "ROM"], 2)).toMatch(/longest/);
  });
  it("ignores it when a wrong choice is the longest", () => {
    expect(choiceLengthWarning(["CPU", "RAM", "A program that copies itself to other computers", "ROM"], 0)).toBeNull();
  });
  it("ignores tiny differences", () => {
    expect(choiceLengthWarning(["Router", "Switch", "Modem", "Hub of hubs"], 3)).toBeNull();
  });
  it("ignores unfinished items", () => {
    expect(choiceLengthWarning(["A very long correct answer here", "", "", ""], 0)).toBeNull();
  });
  it("counts flagged MC items only", () => {
    const items = [
      { type: "mc", choices: ["a", "b", "c", "A program that copies itself"], answer: 3 },
      { type: "mc", choices: ["a", "b", "c", "d"], answer: 0 },
      { type: "tf", answer: true },
    ];
    expect(countChoiceLengthWarnings(items)).toBe(1);
  });
});

describe("QUIZ_BREACH_LIMIT", () => {
  it("auto-submits on the 3rd breach", () => {
    expect(QUIZ_BREACH_LIMIT).toBe(3);
  });
});

describe("balanceAnswerPositions", () => {
  const seeded = (n) => { let x = n; return () => ((x = (x * 9301 + 49297) % 233280) / 233280); };
  const allA = Array.from({ length: 10 }, (_, i) => ({
    id: "q" + i, type: "mc", prompt: "P" + i, choices: [`right${i}`, `w1-${i}`, `w2-${i}`, `w3-${i}`], answer: 0,
  }));
  it("spreads correct answers evenly over A-D and keeps the right text", () => {
    const out = balanceAnswerPositions(allA, seeded(7));
    const counts = [0, 0, 0, 0];
    out.forEach((it, i) => {
      counts[it.answer]++;
      expect(it.choices[it.answer]).toBe(`right${i}`);
      expect([...it.choices].sort()).toEqual([...allA[i].choices].sort());
      expect(it.id).toBe(allA[i].id);
    });
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    expect(allA[0].answer).toBe(0); // input not mutated
  });
  it("is deterministic with a seeded rand and leaves other item types alone", () => {
    const mixed = [...allA.slice(0, 3), { id: "t", type: "tf", prompt: "S", answer: true }, { id: "i", type: "id", prompt: "N", answer: ["x"] }];
    expect(balanceAnswerPositions(mixed, seeded(3))).toEqual(balanceAnswerPositions(mixed, seeded(3)));
    const out = balanceAnswerPositions(mixed, seeded(3));
    expect(out[3]).toBe(mixed[3]);
    expect(out[4]).toBe(mixed[4]);
  });
  it("skips malformed MC items", () => {
    const bad = { id: "b", type: "mc", prompt: "x", choices: ["a", "b"], answer: 0 };
    expect(balanceAnswerPositions([bad])[0]).toBe(bad);
  });
});

describe("answerPatternWarning", () => {
  const mc = (answer) => ({ type: "mc", choices: ["a", "b", "c", "d"], answer });
  const tf = (answer) => ({ type: "tf", answer });
  it("flags one letter holding most MC answers", () => {
    expect(answerPatternWarning([mc(0), mc(0), mc(0), mc(1)])).toMatch(/3 of 4 .* A/);
    expect(answerPatternWarning([mc(0), mc(0), mc(1), mc(2)])).toBeNull();
    expect(answerPatternWarning([mc(0), mc(0), mc(0)])).toBeNull(); // too few to matter
  });
  it("flags True/False items that are almost all the same", () => {
    expect(answerPatternWarning([tf(true), tf(true), tf(true), tf(true), tf(false)])).toMatch(/True/);
    expect(answerPatternWarning([tf(true), tf(true), tf(false), tf(false)])).toBeNull();
  });
});
