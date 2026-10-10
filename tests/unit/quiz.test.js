// Unit tests for js/quiz.js (pure quiz helpers).
import { describe, it, expect } from "vitest";
import {
  hashSeed, seededShuffle, normalizeAnswer, splitAccepted, isCorrect, scoreQuiz,
  quizDeadlineMs, splitQuiz, joinQuiz, validateQuizItems, parseGeneratedQuiz, formatDuration,
} from "../../js/quiz.js";

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
