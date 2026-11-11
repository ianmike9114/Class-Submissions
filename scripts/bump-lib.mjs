// Dev-only pure logic for scripts/bump-version.mjs (kept separate so it is unit-testable).

// Escape a string for use inside a RegExp.
export function esc(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Regex matching every reference to `asset` ("css/style.css", "js/quiz.js")
// carrying a ?v=N, in any import style: "js/quiz.js?v=3" (HTML),
// "./quiz.js?v=3" (inside js/), "./js/quiz.js?v=3", "/js/quiz.js?v=3".
// Must follow a quote/backtick/paren so "teacher-reads.js" never matches
// "teacher.js" and CDN URLs are ignored.
export function refRegex(asset) {
  const base = asset.replace(/^js\//, "");
  const isJs = asset.startsWith("js/");
  const path = isJs
    ? `(?:\\.?\\/)?(?:js\\/)?${esc(base)}`
    : `${esc(asset)}`;
  return new RegExp(`((?<=["'\`(])${path}\\?v=)(\\d+)`, "g");
}

// files: { name: text }. Returns { max, count, next, files: {name: newText}|changed only }.
export function planBump(asset, files) {
  const re = refRegex(asset);
  let max = 0;
  let count = 0;
  for (const text of Object.values(files)) {
    for (const m of text.matchAll(re)) {
      count++;
      max = Math.max(max, Number(m[2]));
    }
  }
  if (!count) return { asset, count: 0, max: 0, next: 0, changed: {} };
  const next = max + 1;
  const changed = {};
  for (const [name, text] of Object.entries(files)) {
    const out = text.replace(re, `$1${next}`);
    if (out !== text) changed[name] = out;
  }
  return { asset, count, max, next, changed };
}

// Map a CLI name to an asset path: css / teacher / student / "quiz" / "quiz.js" / "js/quiz.js".
export function resolveTarget(name, jsModules) {
  if (name === "css") return "css/style.css";
  const n = name.replace(/^js\//, "").replace(/\.js$/, "");
  return jsModules.includes(n) ? `js/${n}.js` : null;
}
