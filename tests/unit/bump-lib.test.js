import { describe, it, expect } from "vitest";
import { planBump, resolveTarget } from "../../scripts/bump-lib.mjs";

const files = {
  "teacher.html": `<script type="module" src="js/teacher.js?v=117"></script>`,
  "js/teacher.js": `import { a } from "./quiz.js?v=7";\nimport { b } from "./teacher-reads.js?v=1";`,
  "js/student.js": `import { a } from "./quiz.js?v=6";\nconst m = await import("./js/quiz.js?v=7");`,
  "js/gemini.js": `import { x } from "./embed.js";`, // no ?v= -> untouched
  "js/cdn.js": `import "https://cdn.example.com/lib/quiz.js?v=99";`, // CDN ignored
};

describe("planBump", () => {
  it("bumps a nested js module everywhere to max+1 (drift reconverges)", () => {
    const p = planBump("js/quiz.js", files);
    expect(p).toMatchObject({ count: 3, max: 7, next: 8 });
    expect(p.changed["js/teacher.js"]).toContain('"./quiz.js?v=8"');
    expect(p.changed["js/student.js"]).toContain('"./quiz.js?v=8"');
    expect(p.changed["js/student.js"]).toContain('"./js/quiz.js?v=8"');
    expect(p.changed["js/cdn.js"]).toBeUndefined();
  });
  it("does not confuse teacher.js with teacher-reads.js", () => {
    const p = planBump("js/teacher.js", files);
    expect(p.count).toBe(1);
    expect(Object.keys(p.changed)).toEqual(["teacher.html"]);
    expect(planBump("js/teacher-reads.js", files).next).toBe(2);
  });
  it("reports nothing when there is no ?v= reference", () => {
    expect(planBump("js/embed.js", files).count).toBe(0);
  });
  it("handles css path", () => {
    const p = planBump("css/style.css", { "index.html": `href="css/style.css?v=56"` });
    expect(p.changed["index.html"]).toBe(`href="css/style.css?v=57"`);
  });
});

describe("resolveTarget", () => {
  const mods = ["quiz", "teacher"];
  it("accepts css, bare, .js and js/ names", () => {
    expect(resolveTarget("css", mods)).toBe("css/style.css");
    expect(resolveTarget("quiz", mods)).toBe("js/quiz.js");
    expect(resolveTarget("quiz.js", mods)).toBe("js/quiz.js");
    expect(resolveTarget("js/teacher.js", mods)).toBe("js/teacher.js");
    expect(resolveTarget("nope", mods)).toBeNull();
  });
});
