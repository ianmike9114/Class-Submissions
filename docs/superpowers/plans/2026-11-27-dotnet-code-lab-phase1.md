# .NET Code Lab (Phase 1, Term 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let G12 .NET learners write and run HTML/CSS/JS and C# from a phone inside the LMS, submit laptop projects (ASP.NET MVC) with repo + demo video + screenshots, and let the teacher post ready BOW activities in one click.

**Architecture:** Extend the existing "Code" assignment with a `codeLang` (`java` | `csharp` | `web`) and optional `starterCode`. C# runs through the same browser-direct Wandbox call as Java (`js/runner.js`). Web code renders in a sandboxed `srcdoc` iframe (`js/webpreview.js`). A new `project` assignment type adds one submission field, `demoLink`. The Activity Bank is a static JSON file that fills in the normal add-assignment form.

**Tech Stack:** Plain ES modules (no bundler), Firebase JS SDK v12 via CDN, Firestore rules, Wandbox public API, highlight.js via CDN. Dev-only: vitest, @firebase/rules-unit-testing, Playwright on the Auth + Firestore emulators.

**Spec:** `docs/superpowers/specs/2026-11-27-dotnet-java-code-lab-design.md`

## Global Constraints

- Firebase **Spark plan only**: no Storage, no Cloud Functions, no new paid services.
- No build step: CDN ESM imports only. No npm runtime deps.
- Backward compatible: an assignment with no `codeLang` behaves exactly like today (Java). Existing submissions are untouched.
- Every assignment add/edit path calls `touchSection(sectionId, { changed })`. Unchanged paths keep doing so.
- A `firestore.rules` change is live only after `firebase deploy --only firestore:rules` (ian runs it; never auto-deploy).
- C# compiler is **`mono-6.12.0.199`** (verified 2026-11-27: stdin + `System.IO` file I/O work; `dotnetcore-8.0.402` on Wandbox fails with "File size limit exceeded"). Mono does **not** accept C# 9 top-level statements, so starter code always uses `class Program { static void Main() { ... } }`.
- Learner web code runs in `<iframe sandbox="allow-scripts">` with **no** `allow-same-origin`. Never add it.
- Learner-facing text: plain English, short, DepEd-appropriate. Run the `humanizer` self-check on Activity Bank prose.
- Bump `?v=` for every changed CSS/JS file with `node scripts/bump-version.mjs <file>`. New modules get `?v=1` on their import line.
- Commit messages end with: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `js/code-langs.js` | Create | One table of per-language facts (label, highlight name, file accept, run vs preview, Wandbox compiler, placeholder) + `langOf(assignment)` |
| `js/runner.js` | Modify | `runCode(lang, source, stdin)`; `runJava` becomes a thin wrapper |
| `js/webpreview.js` | Create | `buildPreviewDoc(source)` (pure) + `mountPreview(container, source)` (DOM, console bridge) |
| `js/highlight.js` | Modify | Register csharp, xml, css, javascript grammars |
| `js/activity-bank.js` | Create | `loadBank(subject)`, `weeksOf(bank)`, `toAssignmentFields(entry)` |
| `data/activity-bank/dotnet.json` | Create | All .NET BOW competencies + suggested PTs as ready activities |
| `js/teacher.js` | Modify | Code language + starter code + Project type in create/edit forms; bank picker; lang-aware review card |
| `teacher.html` | Modify | New form fields, Project option, bank picker markup |
| `js/student.js` | Modify | Lang-aware submit form, program input box, Preview button, project demo link |
| `css/style.css` | Modify | Preview frame + console panel styles |
| `firestore.rules` | Modify | Allow `demoLink` on student create/update |
| `tests/unit/code-langs.test.js`, `tests/unit/runner.test.js`, `tests/unit/webpreview.test.js`, `tests/unit/activity-bank.test.js` | Create/Modify | Unit tests |
| `tests/rules/firestore.rules.test.js` | Modify | `demoLink` rules tests |
| `tests/e2e/flows.spec.js` | Modify | Teacher posts C#/web/project activity; student runs/previews/submits on a phone viewport |
| `docs/design-notes/code-lab.md`, `CLAUDE.md`, `.claude/Skills/student-lms/SKILL.md` | Create/Modify | Design notes + task map |

---

### Task 1: Language table + `runCode`

**Files:**
- Create: `js/code-langs.js`
- Modify: `js/runner.js` (whole file below)
- Test: `tests/unit/code-langs.test.js`, `tests/unit/runner.test.js`

**Interfaces:**
- Produces: `CODE_LANGS` (object keyed `java` | `csharp` | `web`, each `{ label, hl, accept, mode: "run"|"preview", compiler?, placeholder, hint }`), `langOf(assignment) -> "java"|"csharp"|"web"`, `runCode(lang, source, stdin="") -> Promise<{ok:boolean, output:string}>`, `runJava(source, stdin)` (unchanged contract).

- [ ] **Step 1: Write the failing tests** in `tests/unit/code-langs.test.js`:

```js
import { describe, it, expect } from "vitest";
import { CODE_LANGS, langOf } from "../../js/code-langs.js";

describe("langOf", () => {
  it("defaults old assignments (no codeLang) to java", () => {
    expect(langOf({ allowedFileTypes: "code" })).toBe("java");
    expect(langOf(null)).toBe("java");
  });
  it("returns a known codeLang", () => {
    expect(langOf({ codeLang: "csharp" })).toBe("csharp");
    expect(langOf({ codeLang: "web" })).toBe("web");
  });
  it("falls back to java for an unknown value", () => {
    expect(langOf({ codeLang: "cobol" })).toBe("java");
  });
});

describe("CODE_LANGS", () => {
  it("run languages have a Wandbox compiler, preview ones do not", () => {
    expect(CODE_LANGS.java.compiler).toBe("openjdk-jdk-21+35");
    expect(CODE_LANGS.csharp.compiler).toBe("mono-6.12.0.199");
    expect(CODE_LANGS.web.mode).toBe("preview");
    expect(CODE_LANGS.web.compiler).toBeUndefined();
  });
});
```

Append to `tests/unit/runner.test.js`:

```js
import { runCode } from "../../js/runner.js";

describe("runCode", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends C# to the mono compiler with stdin, source untouched", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ status: "0", program_output: "Hi Ana\n" }),
    });
    vi.stubGlobal("fetch", fetchSpy);
    const src = "public class Program { static void Main() {} }";
    const r = await runCode("csharp", src, "Ana\n");
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body).toEqual({ compiler: "mono-6.12.0.199", code: src, stdin: "Ana\n" });
    expect(r).toEqual({ ok: true, output: "Hi Ana" });
  });

  it("strips top-level public only for java", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: "0" }) });
    vi.stubGlobal("fetch", fetchSpy);
    await runCode("java", "public class Main {}");
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body).code).toBe("class Main {}");
  });

  it("refuses web (preview-only) without calling the network", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const r = await runCode("web", "<p>x</p>");
    expect(r.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("explains the top-level-statements error for C#", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ status: "1", compiler_error: "prog.cs(1,0): error CS1525: Unexpected symbol `System'\n" }),
    }));
    const r = await runCode("csharp", "System.Console.WriteLine(1);");
    expect(r.output).toMatch(/class Program/);
  });
});
```

- [ ] **Step 2: Run tests, expect failure**

Run: `npx vitest run tests/unit/code-langs.test.js tests/unit/runner.test.js`
Expected: FAIL, "Failed to resolve import ../../js/code-langs.js" and "runCode is not a function".

- [ ] **Step 3: Create `js/code-langs.js`**

```js
// One place for every per-language fact the Code assignment needs, so the
// student form, teacher review card and runner never disagree.
// `mode: "run"` = sent to Wandbox (js/runner.js); `"preview"` = rendered in a
// sandboxed iframe (js/webpreview.js), never sent anywhere.
export const CODE_LANGS = {
  java: {
    label: "Java",
    hl: "java",
    accept: ".java,.txt,text/plain",
    mode: "run",
    compiler: "openjdk-jdk-21+35",
    placeholder: "public class Main {\n  public static void main(String[] args) {\n    System.out.println(\"Hello\");\n  }\n}",
    hint: "Type/paste your code above, or pick a .java file. Keep your public class named Main so it runs.",
  },
  csharp: {
    label: "C#",
    hl: "csharp",
    accept: ".cs,.txt,text/plain",
    mode: "run",
    // dotnetcore-8 on Wandbox fails to build (checked 2026-11-27); mono works
    // with Console.ReadLine (stdin) and System.IO files.
    compiler: "mono-6.12.0.199",
    placeholder: "using System;\n\nclass Program {\n  static void Main() {\n    Console.WriteLine(\"Hello\");\n  }\n}",
    hint: "Type/paste your C# code above, or pick a .cs file. Put your code inside class Program { static void Main() { ... } }.",
  },
  web: {
    label: "Web page (HTML, CSS, JavaScript)",
    hl: "xml",
    accept: ".html,.htm,.txt,text/html,text/plain",
    mode: "preview",
    placeholder: "<!DOCTYPE html>\n<html>\n<head>\n  <style>\n    h1 { color: teal; }\n  </style>\n</head>\n<body>\n  <h1>Hello</h1>\n  <script>\n    console.log(\"Hi!\");\n  </script>\n</body>\n</html>",
    hint: "Put your HTML, CSS (inside <style>) and JavaScript (inside <script>) in one box, or pick an .html file. Tap Preview to see your page.",
  },
};

export function langOf(assignment) {
  const l = assignment && assignment.codeLang;
  return Object.prototype.hasOwnProperty.call(CODE_LANGS, l) ? l : "java";
}
```

- [ ] **Step 4: Replace `js/runner.js` body** (keep the header comment block; replace from `const WANDBOX_URL` to end of file):

```js
import { CODE_LANGS } from "./code-langs.js?v=1";

const WANDBOX_URL = "https://wandbox.org/api/compile.json";

// Wandbox saves Java source as prog.java ... (keep the existing comment)
export function stripTopLevelPublic(src) {
  return src.replace(/\bpublic\s+(class|interface|enum|record)\b/g, "$1");
}

// Mono predates C# 9 top-level statements; turn its cryptic first-line error
// into the fix learners need.
function csharpHint(compilerError) {
  return /prog\.cs\(1,\d+\): error CS1525/.test(compilerError || "")
    ? "\n\nTip: put your code inside\nclass Program {\n  static void Main() {\n    // your code here\n  }\n}"
    : "";
}

// Runs source on Wandbox and returns one combined, readable output string plus
// an `ok` flag. Never throws - a failed Run must never block submitting.
export async function runCode(lang, source, stdin = "") {
  const info = CODE_LANGS[lang];
  if (!info || info.mode !== "run") {
    return { ok: false, output: "This activity uses Preview, not Run." };
  }
  if (!source || !source.trim()) {
    return { ok: false, output: `Nothing to run - paste your ${info.label} code first.` };
  }
  let res;
  try {
    res = await fetch(WANDBOX_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        compiler: info.compiler,
        code: lang === "java" ? stripTopLevelPublic(source) : source,
        stdin,
      }),
    });
  } catch {
    return { ok: false, output: "Couldn't reach the code runner - check your internet and try again." };
  }
  if (res.status === 429) {
    return { ok: false, output: "The free code runner is busy right now - wait a few seconds and try again." };
  }
  if (!res.ok) {
    return { ok: false, output: `Couldn't run your code (server said ${res.status}). Try again in a moment.` };
  }
  let data;
  try {
    data = await res.json();
  } catch {
    return { ok: false, output: "The code runner sent back something unexpected. Try again." };
  }
  const parts = [];
  if (data.compiler_error) parts.push(data.compiler_error.trimEnd() + (lang === "csharp" ? csharpHint(data.compiler_error) : ""));
  if (data.program_output) parts.push(data.program_output.trimEnd());
  if (data.program_error) parts.push(data.program_error.trimEnd());
  const ok = String(data.status) === "0";
  const output = parts.join("\n").trim()
    || (ok ? "(program finished with no output)" : "Your code didn't run - check for errors.");
  return { ok, output };
}

// Kept for existing callers/tests.
export function runJava(source, stdin = "") {
  return runCode("java", source, stdin);
}
```

Note: the existing test "rejects empty source" expects `/paste your Java code/i`; the new message "paste your Java code first" still matches.

- [ ] **Step 5: Run tests, expect pass**

Run: `npx vitest run tests/unit/code-langs.test.js tests/unit/runner.test.js`
Expected: PASS (all old runner tests + new ones).

- [ ] **Step 6: Commit**

```bash
git add js/code-langs.js js/runner.js tests/unit/code-langs.test.js tests/unit/runner.test.js
git commit -m "feat(code): language table and runCode with C# (mono) on Wandbox"
```

---

### Task 2: Sandboxed web preview module

**Files:**
- Create: `js/webpreview.js`
- Modify: `css/style.css` (append), `js/highlight.js` (register grammars)
- Test: `tests/unit/webpreview.test.js`

**Interfaces:**
- Produces: `buildPreviewDoc(source: string) -> string` (full HTML for `srcdoc`), `mountPreview(container: HTMLElement, source: string) -> void` (renders a `.web-preview` iframe + `.web-console` list inside `container`, replacing previous content).

- [ ] **Step 1: Write the failing test** `tests/unit/webpreview.test.js`:

```js
import { describe, it, expect } from "vitest";
import { buildPreviewDoc, CONSOLE_BRIDGE } from "../../js/webpreview.js";

describe("buildPreviewDoc", () => {
  it("puts the console bridge before learner code in <head>", () => {
    const out = buildPreviewDoc("<html><head><title>x</title></head><body><p>hi</p></body></html>");
    expect(out.indexOf(CONSOLE_BRIDGE)).toBeGreaterThan(-1);
    expect(out.indexOf(CONSOLE_BRIDGE)).toBeLessThan(out.indexOf("<title>"));
    expect(out).toContain("<p>hi</p>");
  });
  it("wraps a fragment that has no <head>", () => {
    const out = buildPreviewDoc("<h1>Hello</h1>");
    expect(out.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(out).toContain(CONSOLE_BRIDGE);
    expect(out).toContain("<h1>Hello</h1>");
  });
  it("handles empty input", () => {
    expect(buildPreviewDoc("")).toContain(CONSOLE_BRIDGE);
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `npx vitest run tests/unit/webpreview.test.js` → cannot resolve `../../js/webpreview.js`.

- [ ] **Step 3: Create `js/webpreview.js`**

```js
// Live preview for learner HTML/CSS/JS. The page runs in an iframe with
// sandbox="allow-scripts" and NO allow-same-origin: it gets an opaque origin,
// so learner JS cannot read this site's cookies, storage or Firebase session,
// and cannot touch parent.document. console.log and errors come back via
// postMessage and are shown in a small console panel under the frame.

export const CONSOLE_BRIDGE = `<script>(function(){
function send(kind,args){try{parent.postMessage({__lmsPreview:1,kind:kind,text:Array.prototype.map.call(args,function(a){try{return typeof a==="object"?JSON.stringify(a):String(a)}catch(e){return String(a)}}).join(" ")},"*")}catch(e){}}
["log","info","warn","error"].forEach(function(k){var o=console[k];console[k]=function(){send(k,arguments);o&&o.apply(console,arguments)}});
window.addEventListener("error",function(e){send("error",[e.message+(e.lineno?" (line "+e.lineno+")":"")])});
})();<\/script>`;

export function buildPreviewDoc(source) {
  const src = String(source || "");
  const headOpen = src.match(/<head[^>]*>/i);
  if (headOpen) {
    const at = headOpen.index + headOpen[0].length;
    return src.slice(0, at) + CONSOLE_BRIDGE + src.slice(at);
  }
  return `<!DOCTYPE html><html><head><meta charset="utf-8">${CONSOLE_BRIDGE}</head><body>${src}</body></html>`;
}

export function mountPreview(container, source) {
  container.innerHTML = "";
  container.classList.remove("hidden");
  const frame = document.createElement("iframe");
  frame.className = "web-preview";
  frame.setAttribute("sandbox", "allow-scripts allow-modals");
  frame.setAttribute("title", "Preview of your web page");
  const log = document.createElement("ol");
  log.className = "web-console hidden";
  const onMsg = (e) => {
    if (e.source !== frame.contentWindow || !e.data || e.data.__lmsPreview !== 1) return;
    const li = document.createElement("li");
    li.className = `web-console-${e.data.kind}`;
    li.textContent = String(e.data.text).slice(0, 500);
    log.appendChild(li);
    log.classList.remove("hidden");
  };
  window.addEventListener("message", onMsg);
  // Drop the listener when this preview is replaced or removed.
  new MutationObserver((_, obs) => {
    if (!frame.isConnected) { window.removeEventListener("message", onMsg); obs.disconnect(); }
  }).observe(container, { childList: true });
  container.append(frame, log);
  frame.srcdoc = buildPreviewDoc(source);
}
```

(`allow-modals` lets `alert()`/`prompt()` work, which BOW JS activities use. It does not grant same-origin.)

- [ ] **Step 4: Append to `css/style.css`**

```css
/* Code Lab: live web preview (js/webpreview.js) */
.web-preview { width: 100%; height: 320px; border: 1px solid var(--border); border-radius: var(--radius); background: #fff; }
.web-console { margin: 0.4rem 0 0; padding: 0.4rem 0.6rem 0.4rem 1.8rem; font: 0.8rem/1.4 ui-monospace, monospace; background: var(--muted-bg, #f6f8fa); border-radius: var(--radius); max-height: 160px; overflow: auto; }
.web-console-error { color: #c62828; }
.web-console-warn { color: #a15c00; }
.code-stdin { font-family: ui-monospace, monospace; }
```

(Check `DESIGN_SYSTEM.md` for the real token names; replace `--border`, `--radius`, `--muted-bg` with the ones it lists.)

- [ ] **Step 5: Register grammars in `js/highlight.js` `ensureHljs()`** — replace the two java lines with:

```js
    const hljs = core.default;
    const langs = { java: "java", csharp: "csharp", xml: "xml", css: "css", javascript: "javascript" };
    await Promise.all(Object.entries(langs).map(async ([name, file]) => {
      const mod = await import(`${CDN}/es/languages/${file}.min.js`);
      hljs.registerLanguage(name, mod.default);
    }));
```

(hljs's `xml` grammar highlights embedded `<style>`/`<script>` only when `css`/`javascript` are registered, hence all five.)

- [ ] **Step 6: Run tests** — `npx vitest run tests/unit/webpreview.test.js` → PASS. Then `npm test` → all PASS.

- [ ] **Step 7: Commit**

```bash
git add js/webpreview.js js/highlight.js css/style.css tests/unit/webpreview.test.js
git commit -m "feat(code): sandboxed live web preview with console panel; highlight C#/HTML"
```

---

### Task 3: Firestore rules — `demoLink`

**Files:**
- Modify: `firestore.rules` (student create `hasOnly` ~line 169-173; student update `affectedKeys().hasOnly` ~line 212)
- Test: `tests/rules/firestore.rules.test.js`

**Interfaces:**
- Produces: submissions may carry `demoLink` (string, < 2000 chars) written by the student.

- [ ] **Step 1: Write failing tests** — add inside `describe("submissions: student edits are field-limited and status-gated", ...)`:

```js
  it("student can set a demoLink on create and edit (project submissions)", async () => {
    const db = ctxFor("student9", "s9@x.com");
    await assertSucceeds(setDoc(doc(db, "submissions", "a1_student9"), {
      assignmentId: "a1", studentUID: "student9", ownerEmail: TEACHER_A, status: "pending",
      link: "https://github.com/x/y", demoLink: "https://youtu.be/demo", submittedAt: 1,
    }));
    const db1 = ctxFor("student1", "s1@x.com");
    await assertSucceeds(updateDoc(doc(db1, "submissions", "subA_stud1"), {
      demoLink: "https://youtu.be/new", status: "pending", submittedAt: 2,
    }));
  });
  it("demoLink must be a short string", async () => {
    const db1 = ctxFor("student1", "s1@x.com");
    await assertFails(updateDoc(doc(db1, "submissions", "subA_stud1"), {
      demoLink: "x".repeat(2000), status: "pending", submittedAt: 2,
    }));
    await assertFails(updateDoc(doc(db1, "submissions", "subA_stud1"), {
      demoLink: 5, status: "pending", submittedAt: 2,
    }));
  });
```

(If `a1` needs an assignment doc for the ownerEmail check, mirror the setup used by the existing "allows a normal pending create" test in the same file.)

- [ ] **Step 2: Run, expect FAIL** — `npm run test:rules` → the two new tests fail.

- [ ] **Step 3: Edit `firestore.rules`**
  - Create `hasOnly([...])`: add `'demoLink'` after `'link'`.
  - Create: after the `link` size check add
    ```
                        && (!('demoLink' in request.resource.data)
                            || (request.resource.data.demoLink is string && request.resource.data.demoLink.size() < 2000))
    ```
  - Update `affectedKeys().hasOnly([...])`: add `'demoLink'`, and add the same `demoLink` size check next to the update's `link` check.
  - Update the comment above the create `hasOnly` to mention project submissions' demo link.

- [ ] **Step 4: Run** `npm run test:rules` → all PASS.

- [ ] **Step 5: Commit**

```bash
git add firestore.rules tests/rules/firestore.rules.test.js
git commit -m "feat(rules): allow demoLink on student project submissions"
```

---

### Task 4: Teacher forms — code language, starter code, Project type; lang-aware review card

**Files:**
- Modify: `teacher.html` (add form ~line 425-436, edit form ~line 502-512)
- Modify: `js/teacher.js` (imports ~line 19-21; `syncQuizBuilderVisibility` ~3566; add submit payload ~3676-3683; edit fill ~3861; edit payload ~3924-3931; review card ~4703-4760; attempt history ~5046)

**Interfaces:**
- Consumes: `CODE_LANGS`, `langOf` (Task 1); `runCode` (Task 1); `mountPreview` (Task 2).
- Produces: assignment docs with `allowedFileTypes: "code"` carry `codeLang` and `starterCode` (string, may be ""); `allowedFileTypes: "project"` is a new value. Element ids `assignment-codelang`, `assignment-starter`, `assignment-code-wrap` (and `edit-` prefixed) used by Task 7.

- [ ] **Step 1: Markup** — in both filetype `<select>`s add after the `code` option:

```html
              <option value="project">Project (laptop build: repo/Drive link + demo video + screenshots)</option>
```

and right after each `</select>` that closes the filetype select (inside the `*-filetype-wrap` div) add (use `edit-` prefix in the edit form):

```html
            <div id="assignment-code-wrap" class="hidden">
              <label>Code language</label>
              <select id="assignment-codelang">
                <option value="java">Java (Run)</option>
                <option value="csharp">C# (Run)</option>
                <option value="web">Web page: HTML, CSS, JavaScript (Preview)</option>
              </select>
              <label>Starter code (optional - learners see this in their code box)</label>
              <textarea id="assignment-starter" rows="8" spellcheck="false"></textarea>
            </div>
```

- [ ] **Step 2: Show/hide** — at the end of `syncQuizBuilderVisibility(prefix)` add:

```js
  const isCode = el(`${prefix}assignment-filetype`).value === "code";
  el(`${prefix}assignment-code-wrap`).classList.toggle("hidden", !(isCode && isAssignment));
```

- [ ] **Step 3: Save** — add a helper near `syncQuizBuilderVisibility`:

```js
// Code assignments carry their language + optional starter code; other types
// carry neither (so switching away from Code doesn't leave stale fields).
function codeFields(prefix, filetype) {
  if (filetype !== "code") return { codeLang: deleteField(), starterCode: deleteField() };
  return {
    codeLang: el(`${prefix}assignment-codelang`).value,
    starterCode: el(`${prefix}assignment-starter`).value.replace(/\s+$/, ""),
  };
}
```

  - Add payload (`addDoc`): `deleteField()` is not allowed in `addDoc`, so there spread only when code:
    ```js
    if (payload.allowedFileTypes === "code") Object.assign(payload, codeFields("", "code"));
    ```
    placed right after the `payload` object is built (before `quizData`).
  - Edit payload: after building `payload` for non-material: `if (!isMaterial) Object.assign(payload, codeFields("edit-", payload.allowedFileTypes));`
  - Make sure `deleteField` is in the existing `firebase-firestore` import list at the top of `js/teacher.js` (add it if missing).

- [ ] **Step 4: Edit-form fill** — after `el("edit-assignment-filetype").value = ...` add:

```js
  el("edit-assignment-codelang").value = langOf(data);
  el("edit-assignment-starter").value = data.starterCode || "";
```

  and make sure `syncQuizBuilderVisibility("edit-")` runs after these lines (it already runs later in that function; if not, call it).

- [ ] **Step 5: Imports** — replace `import { runJava } from "./runner.js";` with:

```js
import { runCode } from "./runner.js?v=1";
import { CODE_LANGS, langOf } from "./code-langs.js?v=1";
import { mountPreview } from "./webpreview.js?v=1";
```

and change `"./highlight.js"` to `"./highlight.js?v=1"`.

- [ ] **Step 6: Review card** (~line 4703). `a` is the assignment in scope there (check the name used in that function; it is the one whose `allowedFileTypes` is read at ~4662). Replace the `codeBlock` const with:

```js
    const lang = langOf(a);
    const info = CODE_LANGS[lang];
    const codeBlock = s.code
      ? codeBlockHtml(s.code, info.hl)
        + (s.codeOutput ? `<div class="muted">Student's saved output</div><pre class="code-output">${escAttr(s.codeOutput)}</pre>` : "")
        + `<div class="code-run"><button type="button" class="secondary" data-run-code="${d.id}" data-lang="${lang}">${info.mode === "preview" ? "&#128065; Preview" : "&#9654; Run this"}</button></div>`
        + `<pre class="code-output hidden" data-teacher-output="${d.id}"></pre><div class="hidden" data-teacher-preview="${d.id}"></div>`
      : "";
    const demoBlock = isHttpUrl(s.demoLink)
      ? `<div class="muted">Demo video</div>${embedBlockFor(String(s.demoLink).trim(), { label: "Open demo video" })}`
      : "";
```

  Render `${quiz ? "" : demoBlock}` right after `${quiz ? "" : linkBlock}`. (Confirm `embedBlockFor` is imported in teacher.js from `./embed.js`; if not, add it to that import.)

  Replace the Run handler body's `runJava(codeEl.textContent)` branch:

```js
      const runLang = b.dataset.lang || "java";
      if (CODE_LANGS[runLang].mode === "preview") {
        mountPreview(rowEl.querySelector(`[data-teacher-preview="${b.dataset.runCode}"]`), codeEl.textContent);
        return;
      }
```

  placed before `const original = b.textContent;`, and change the call to `await runCode(runLang, codeEl.textContent)`.

- [ ] **Step 7: Attempt history** (~5046): change `codeBlockHtml(att.code, "java")` to `codeBlockHtml(att.code, CODE_LANGS[langOf(assignment)].hl)` using whatever assignment variable is in scope there (if none, keep `"java"` default via `langOf(null)`).

- [ ] **Step 8: Manual check** — `python -m http.server 8420`, open `http://localhost:8420/teacher.html?emu=1` with `npm run emu` running (or use the e2e in Task 5). Create Assignment → Expected link type "Code" → language + starter fields appear; switch to "Document" → they hide. Save a C# code assignment, reopen edit → C# and starter code are filled in. `npm test` still PASS.

- [ ] **Step 9: Commit**

```bash
git add teacher.html js/teacher.js
git commit -m "feat(teacher): code language, starter code and Project type; lang-aware Run/Preview on review"
```

---

### Task 5: Student submit form — language-aware, program input, Preview, Project

**Files:**
- Modify: `js/student.js` (imports ~10-11; call sites ~871 and ~1033; `renderSubmittedWork` ~1582; `LINK_HINTS` ~1605; `renderSubmitForm` ~1637; `createSubmission` update ~1873; `wireSubmitForm` ~1889-1950; `wireRunButton` ~1993)
- Test: `tests/e2e/flows.spec.js`

**Interfaces:**
- Consumes: `CODE_LANGS`, `langOf`, `runCode`, `mountPreview`.
- Produces: `renderSubmitForm(assignmentId, assignment, prefill)` (signature change: second arg is now the assignment object). Submissions may carry `demoLink`. DOM: `.submission-stdin`, `.submission-demo`, `[data-preview="<id>"]`.

- [ ] **Step 1: Write the failing e2e** — append to `tests/e2e/flows.spec.js` (serial; reuses the subject/section/join from the first tests):

```js
test("code lab: C# run, web preview and project submit on a phone", async ({ page, browser }) => {
  const errors = trackPageErrors(page);
  await signIn(page, TEACHER, "Teacher One");
  await page.waitForURL(/teacher\.html/);
  await page.locator("#subjects-list [data-open]").first().click();
  await page.locator("#sections-list [data-open]").first().click();

  const addAssignment = async (title, filetype, lang, starter) => {
    await page.locator("#view-section summary", { hasText: "Create" }).click();
    await page.locator('[data-create-type="assignment"]').click();
    await page.fill("#assignment-title", title);
    await page.fill("#assignment-total-points", "10");
    await page.selectOption("#assignment-filetype", filetype);
    if (lang) {
      await page.selectOption("#assignment-codelang", lang);
      await page.fill("#assignment-starter", starter);
    }
    await page.locator("#create-submit-btn").click();
    await expect(page.locator("#assignments-list")).toContainText(title);
  };
  await addAssignment("E2E CSharp", "code", "csharp",
    'using System;\nclass Program { static void Main() { Console.WriteLine("Hi " + Console.ReadLine()); } }');
  await addAssignment("E2E Web", "code", "web", "<h1 id='t'>Hello</h1><script>console.log('ready')</script>");
  await addAssignment("E2E Project", "project");

  const phone = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const sp = await phone.newPage();
  await blockProduction(sp);
  // Wandbox is external: stub it so the test is offline and deterministic.
  await sp.route("https://wandbox.org/**", (r) => r.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ status: "0", program_output: "Hi Ana\n" }),
  }));
  await signIn(sp, STUDENT, "Juan Student");
  await sp.waitForURL(/student\.html/);

  const cs = sp.locator(".submit-form", { has: sp.locator(".submission-code") }).filter({ hasText: "C#" }).first();
  await expect(cs.locator(".submission-code")).toHaveValue(/class Program/);
  await cs.locator(".submission-stdin").fill("Ana");
  await cs.locator(".submission-run").click();
  await expect(cs.locator(".code-output")).toHaveText("Hi Ana");
  await cs.locator('button[type="submit"]').click();

  const web = sp.locator(".submit-form").filter({ hasText: "Web page" }).first();
  await web.locator(".submission-run").click();
  const frame = web.frameLocator("iframe.web-preview");
  await expect(frame.locator("#t")).toHaveText("Hello");
  await expect(web.locator(".web-console")).toContainText("ready");

  const proj = sp.locator(".submit-form").filter({ has: sp.locator(".submission-demo") }).first();
  await proj.locator(".submission-link").fill("https://github.com/juan/mvc-app");
  await proj.locator(".submission-demo").fill("https://youtu.be/dQw4w9WgXcQ");
  await proj.locator('button[type="submit"]').click();
  await expect(sp.locator("body")).toContainText("Submitted");
  await phone.close();
  expect(errors, errors.join(" | ")).toEqual([]);
});
```

(Adjust the `.filter({ hasText })` selectors to match each card's real text once the form renders; the language label is shown as "Your C# code" / "Your Web page (HTML, CSS, JavaScript) code" per Step 3.)

- [ ] **Step 2: Run, expect FAIL** — `npm run e2e:flows -- -g "code lab"` → fails at `#assignment-codelang` (if Task 4 not merged) or at `.submission-stdin`.

- [ ] **Step 3: `renderSubmitForm`** — change signature and code block:

```js
function renderSubmitForm(assignmentId, assignment, prefill = null) {
  const type = assignment?.allowedFileTypes;
  const lang = langOf(assignment);
  const info = CODE_LANGS[lang];
  // ...photoBlock unchanged, but also show it for "project" (screenshots):
  //   (type === "image" || type === "document" || type === "project")
  const codeValue = esc(prefill?.code || (prefill ? "" : assignment?.starterCode || ""));
  const codeBlock = (type === "code") ? `
      <label>Your ${esc(info.label)} code</label>
      <textarea class="submission-code" data-assignment="${assignmentId}" data-lang="${lang}" rows="12" spellcheck="false" placeholder="${esc(info.placeholder)}">${codeValue}</textarea>
      <input type="file" accept="${info.accept}" class="submission-code-file" data-assignment="${assignmentId}" />
      <p class="muted">${esc(info.hint)}</p>
      ${info.mode === "run" ? `
      <label>Program input (optional - what you would type when the program asks, one answer per line)</label>
      <textarea class="submission-stdin code-stdin" rows="2" spellcheck="false"></textarea>` : ""}
      <div class="code-run">
        <button type="button" class="secondary submission-run" data-assignment="${assignmentId}" data-lang="${lang}">${info.mode === "preview" ? "&#128065; Preview" : "&#9654; Run"}</button>
        <span class="muted run-note">${info.mode === "preview"
          ? "Your page shows below, only on this device."
          : "Runs on a free public code runner (wandbox.org) - your code is sent there to execute."}</span>
      </div>
      <pre class="code-output hidden" data-output="${assignmentId}"></pre>
      <div class="hidden" data-preview="${assignmentId}"></div>` : "";
  const demoValue = prefill?.demoLink ? ` value="${String(prefill.demoLink).replace(/"/g, "&quot;")}"` : "";
  const demoBlock = (type === "project") ? `
      <label>Demo video link (YouTube unlisted or Drive, "anyone with the link")</label>
      <input type="url" class="submission-demo" placeholder="https://youtu.be/..."${demoValue} />
      <p class="muted">Record your screen while you show your project working, 1-3 minutes.</p>` : "";
```

  In the returned form, put `${demoBlock}` right after the link `<p class="muted">` line, and change the link label to:

```js
      <label>${type === "code" ? "Or a submission link (optional)" : type === "project" ? "Project link (GitHub repo or shared Drive folder)" : "Submission link"}</label>
```

  `esc` is already imported from `shared.js`. Remove the old `codePlaceholder` const and the Piston comment (say Wandbox).

- [ ] **Step 4: `LINK_HINTS`** — add:

```js
  project: "GitHub repo or Drive folder shared as \"anyone with the link can view\". Add screenshots below if you like.",
```

- [ ] **Step 5: Call sites** — `renderSubmitForm(aDoc.id, a.allowedFileTypes)` → `renderSubmitForm(aDoc.id, a)` (~871). Edit path (~1033) → `renderSubmitForm(aDoc.id, a, { id: subDoc.id, link: s.link || "", photoPages: existingPhotos, code: s.code || "", demoLink: s.demoLink || "" })`.

- [ ] **Step 6: Submit payloads** — in `wireSubmitForm` after `const photoPages = ...`:

```js
    const demoEl = form.querySelector(".submission-demo");
    const demoLink = demoEl ? demoEl.value.trim() : "";
```

  Validation: change the empty check to `if (!link && !code && !demoLink && photoPages.length === 0)`. Add `demoLink` to the `updateDoc` object and the `createSubmission` payload **only when `demoEl` exists** (so non-project submissions keep their exact old field set):

```js
    const extra = demoEl ? { demoLink } : {};
```

  and spread `...extra` into both objects. In `createSubmission`'s fallback `updateDoc`, add `...(payload.demoLink !== undefined ? { demoLink: payload.demoLink } : {})`.

- [ ] **Step 7: `wireRunButton`** — replace the `try` block:

```js
    const lang = btn.dataset.lang || "java";
    if (CODE_LANGS[lang].mode === "preview") {
      mountPreview(form.querySelector(`[data-preview="${assignmentId}"]`), textarea.value);
      return;
    }
```

  insert before `const original = btn.textContent;`, then:

```js
      const stdin = form.querySelector(".submission-stdin")?.value || "";
      const { output } = await runCode(lang, textarea.value, stdin ? stdin.replace(/\s*$/, "\n") : "");
```

  (Web submissions keep `codeOutput` empty; that is intended.)

- [ ] **Step 8: `renderSubmittedWork(s)`** — it has no assignment; find its caller and pass the assignment as a 2nd arg, then use `codeBlockHtml(s.code, CODE_LANGS[langOf(a)].hl)`. Also add after the link part:

```js
  if (s.demoLink) parts.push(embedBlockFor(s.demoLink, { label: "Open your demo video" }));
```

- [ ] **Step 9: Imports** — replace lines 10-11:

```js
import { runCode } from "./runner.js?v=1";
import { codeBlockHtml, highlightWithin } from "./highlight.js?v=1";
import { CODE_LANGS, langOf } from "./code-langs.js?v=1";
import { mountPreview } from "./webpreview.js?v=1";
```

- [ ] **Step 10: Run** `npm run e2e:flows` → all PASS (old flows + new). `npm test` → PASS.

- [ ] **Step 11: Manual phone check** — preview server + Browser pane at 375px: C# starter shows, Run with input "Ana" prints `Hi Ana` (real Wandbox), Web preview renders, and in the preview run `<script>try{parent.document.body}catch(e){console.log("blocked")}</script>` → console shows `blocked`. An old Java assignment still shows "Your Java code" and runs.

- [ ] **Step 12: Commit**

```bash
git add js/student.js tests/e2e/flows.spec.js
git commit -m "feat(student): C#/web code with program input and preview; project submissions with demo video"
```

---

### Task 6: Activity Bank data + loader

**Files:**
- Create: `data/activity-bank/dotnet.json`, `js/activity-bank.js`
- Test: `tests/unit/activity-bank.test.js`

**Interfaces:**
- Produces: `loadBank(subject: "dotnet"|"java") -> Promise<Entry[]>`, `weeksOf(entries) -> number[]` (sorted unique), `toAssignmentFields(entry) -> { title, instructions, allowedFileTypes, codeLang?, starterCode?, totalPoints, component }`.
- Entry shape (every field required unless marked):
  `{ "id": "net-w1-01", "subject": "dotnet", "term": 1, "week": 1, "competency": "<verbatim BOW text>", "title": "...", "type": "code"|"project"|"document"|"image"|"video", "codeLang": "web"|"csharp"|"java" (only when type=code), "instructions": "...", "starterCode": "..." (only when type=code, may be ""), "points": 10, "component": "written"|"performance" }`

- [ ] **Step 1: Failing test** `tests/unit/activity-bank.test.js`:

```js
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { weeksOf, toAssignmentFields } from "../../js/activity-bank.js";

const bank = JSON.parse(readFileSync(new URL("../../data/activity-bank/dotnet.json", import.meta.url), "utf8"));

describe("dotnet activity bank data", () => {
  it("every entry is complete and valid", () => {
    const ids = new Set();
    for (const e of bank) {
      expect(ids.has(e.id), e.id).toBe(false); ids.add(e.id);
      expect(e.subject).toBe("dotnet");
      expect(e.term).toBe(1);
      expect(e.week).toBeGreaterThanOrEqual(1); expect(e.week).toBeLessThanOrEqual(10);
      for (const k of ["competency", "title", "instructions"]) expect(e[k]?.trim(), `${e.id}.${k}`).toBeTruthy();
      expect(["code", "project", "document", "image", "video"]).toContain(e.type);
      expect(["written", "performance"]).toContain(e.component);
      expect(e.points).toBeGreaterThan(0);
      if (e.type === "code") expect(["web", "csharp"]).toContain(e.codeLang);
      else expect(e.codeLang).toBeUndefined();
    }
  });
  it("C# starter code never uses top-level statements (mono)", () => {
    for (const e of bank.filter((x) => x.codeLang === "csharp" && x.starterCode)) {
      expect(e.starterCode, e.id).toMatch(/static void Main/);
    }
  });
  it("covers all 50 BOW competencies and 8 suggested PTs", () => {
    const comps = new Set(bank.filter((e) => !e.id.includes("-pt")).map((e) => e.competency));
    expect(comps.size).toBe(50);
    expect(bank.filter((e) => e.id.includes("-pt")).length).toBe(8);
  });
});

describe("helpers", () => {
  it("weeksOf returns sorted unique weeks", () => {
    expect(weeksOf([{ week: 3 }, { week: 1 }, { week: 3 }])).toEqual([1, 3]);
  });
  it("toAssignmentFields maps a code entry", () => {
    expect(toAssignmentFields({ title: "T", instructions: "I", type: "code", codeLang: "web", starterCode: "<p>", points: 10, component: "written" }))
      .toEqual({ title: "T", instructions: "I", allowedFileTypes: "code", codeLang: "web", starterCode: "<p>", totalPoints: 10, component: "written" });
  });
  it("toAssignmentFields omits code fields for a project", () => {
    expect(toAssignmentFields({ title: "P", instructions: "I", type: "project", points: 50, component: "performance" }))
      .toEqual({ title: "P", instructions: "I", allowedFileTypes: "project", totalPoints: 50, component: "performance" });
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `npx vitest run tests/unit/activity-bank.test.js` → missing files.

- [ ] **Step 3: Create `js/activity-bank.js`**

```js
// Ready activities per DepEd BOW week, stored as static JSON in
// data/activity-bank/ (no Firestore reads). Picking one only fills in the
// normal add-assignment form - the teacher reviews/edits and saves it through
// the usual path, so touchSection()/notifications behave as for any assignment.
const cache = new Map();

export async function loadBank(subject) {
  if (cache.has(subject)) return cache.get(subject);
  const res = await fetch(`data/activity-bank/${subject}.json?v=1`);
  if (!res.ok) throw new Error(`Couldn't load the activity bank (${res.status}).`);
  const list = await res.json();
  cache.set(subject, list);
  return list;
}

export function weeksOf(entries) {
  return [...new Set(entries.map((e) => e.week))].sort((a, b) => a - b);
}

export function toAssignmentFields(e) {
  const out = { title: e.title, instructions: e.instructions, allowedFileTypes: e.type };
  if (e.type === "code") { out.codeLang = e.codeLang; out.starterCode = e.starterCode || ""; }
  out.totalPoints = e.points;
  out.component = e.component;
  return out;
}
```

- [ ] **Step 4: Author `data/activity-bank/dotnet.json`** — one entry per row below (50 competency entries + 8 PTs = 58). `competency` is copied **verbatim** from the BOW. Pick one of the BOW's two suggested activities for each competency, write instructions as 3-6 short numbered steps a Grade 12 learner can follow on a phone, ending with "Tap Preview/Run, then Submit." `points`: 10 for practice (`written`), 50 for PTs (`performance`). Laptop-only items say so in the instructions ("Do this on a school laptop"). HTML "frames": teach with `<iframe>` (the `<frameset>` tag no longer works in modern browsers) and say so in one line. Run the humanizer self-check over all instructions.

  | id | wk | type / lang | competency (verbatim) | title |
  |---|---|---|---|---|
  | net-w1-01 | 1 | code/web | Discuss the HTML fundamentals | Code & Create: My First Web Page |
  | net-w1-02 | 1 | code/web | Use paragraph formatting elements | Paragraph Power: Text Styling |
  | net-w1-03 | 1 | code/web | Apply list attributes and values in web page designs | Smart Menu Maker |
  | net-w1-04 | 1 | code/web | Create HTML documents with multimedia elements | Media Magic: Bring Webpages to Life |
  | net-w1-05 | 1 | code/web | Use table elements, attributes, and values in designing web pages | Schedule Maker: Web Table Designer |
  | net-w1-06 | 1 | code/web | Create hyperlinks between web pages | Link Quest: Connect the Web |
  | net-w1-07 | 1 | code/web | Use frames in designing web pages | Split Screen Web Builder |
  | net-w2-01 | 2 | code/web | Create HTML form web pages and provide fields where user can enter data | Survey Creator Challenge |
  | net-w2-02 | 2 | document | Perform installation of Integrated Development Environment (IDE) application | Tech Ready: IDE Setup Report (laptop) |
  | net-w2-03 | 2 | code/web | Discuss Cascading Style Sheet (CSS) fundamentals | Style Surge: CSS Makeover |
  | net-w2-04 | 2 | code/web | Apply the different CSS Selectors | Selector Showdown: Class vs ID |
  | net-w2-05 | 2 | code/web | Apply CSS text, font, and color in designing web pages | Brand Page Builder |
  | net-w2-06 | 2 | code/web | Apply CSS gradient and opacity | Gradient Glow-Up |
  | net-w2-07 | 2 | code/web | Create layouts of web pages using the CSS box model | Boxed Up: The CSS Layout Challenge |
  | net-w3-01 | 3 | code/web | Use the CSS list and link properties and values in creating web pages | Link & List Designer |
  | net-w3-02 | 3 | code/web | Utilizes CSS Z-index, position, float properties and values in designing web pages | Layer It: Position and Z-index |
  | net-w3-03 | 3 | code/web | Create web pages with a CSS image gallery | Gallery Grid Genius |
  | net-w3-04 | 3 | code/web | Apply CSS pseudo class and elements | Hover Hero: Interactive Style |
  | net-w3-05 | 3 | code/web | Apply CSS flexbox layout and media queries in web designs | Responsive Web Hero |
  | net-w3-06 | 3 | code/web | Create responsive websites using CSS Responsive Web Development (RWD) Layouts | Responsive Grid Master |
  | net-w3-07 | 3 | code/web | Discuss the fundamentals of JavaScript | First Script Lab: Hello JavaScript |
  | net-w3-08 | 3 | image | Demonstrate the structures of statements, algorithm, flowchart, and pseudocode | Logic Builder: From Idea to Flow (photo of flowchart) |
  | net-w3-09 | 3 | code/web | Apply variables, data types, and functions in creating web applications | Function Builder Challenge |
  | net-w4-01 | 4 | code/web | Use JavaScript operators in problem solving | Operator Arena: JS Math Challenge |
  | net-w4-02 | 4 | code/web | Use event handlers and event listeners in creating web applications | Event Trigger Lab |
  | net-w4-03 | 4 | code/web | Use conditional and switch statements in creating web applications | Logic Path Explorer: If-Else Adventure |
  | net-w4-04 | 4 | code/web | Apply loops in creating a program using while, do while, and for loops | Loop Lab: Repeat & Render |
  | net-w5-01 | 5 | code/web | Use JavaScript arrays in creating a program | Smart List Builder: Array in Action |
  | net-w5-02 | 5 | code/web | Create objects to display the set of properties and values | Object Explorer: My Digital Profile |
  | net-w5-03 | 5 | code/web | Apply Document Object Model (DOM) nodes in creating a web document | DOM Master: Control the Web Page |
  | net-w5-04 | 5 | code/csharp | Discuss the C# fundamentals | Build Your First C# App |
  | net-w6-01 | 6 | code/csharp | Use C# data types, variables, strings, and constants in creating a web application | Data Detective: C# Variables |
  | net-w6-02 | 6 | code/csharp | Apply C# operators and decision making in problem solving | Decision Engine: C# Logic Builder |
  | net-w6-03 | 6 | code/csharp | Use the C# iteration statements in creating a web application | Iteration Challenge: Smart Counter |
  | net-w7-01 | 7 | code/csharp | Apply C# classes, methods and structure in creating a web application | Class Creator: My First C# Blueprint |
  | net-w7-02 | 7 | code/csharp | Create web application programs that contains C# arrays | Smart Array System |
  | net-w7-03 | 7 | code/csharp | Apply the C# Object-Oriented Programming (OOP) approach in creating a web application | OOP Builder: School System |
  | net-w7-04 | 7 | code/csharp | Utilize the C# file input/output in creating, deleting, and reading web applications | File Flow: Save & Retrieve |
  | net-w8-01 | 8 | image | Discuss the ASP.NET Model View Controller (MVC) fundamentals | MVC Explorer: Blueprint Diagram |
  | net-w8-02 | 8 | image | Discuss the ASP.NET MVC environment and life cycle | Life Cycle Simulator: Request to Response |
  | net-w8-03 | 8 | project | Perform configurations of the routing process in directing an http request in an ASP.NET MVC project using controllers and actions | Route Finder: Controllers and Actions |
  | net-w8-04 | 8 | project | Use filters, selectors, and views in creating projects | View Master: Filter & Display |
  | net-w9-01 | 9 | project | Apply the ASP.NET MVC - data model | Model Builder: Student Records |
  | net-w9-02 | 9 | project | Use ASP.NET MVC – helpers in creating realistic HTML controls | Smart Form Builder: Helper Toolkit |
  | net-w9-03 | 9 | project | Create bridges between the http request and the action methods (Model Binding) | Data Binder Lab |
  | net-w9-04 | 9 | project | Discuss the framework of ASP.NET MVC – database and adding validation to a model | Smart Records System: Database & Validation |
  | net-w10-01 | 10 | project | Execute security features in a web application | Secure Cache Builder |
  | net-w10-02 | 10 | project | Create ASP.NET MVC - web application program interface (API) | API Explorer: First RESTful Call |
  | net-w10-03 | 10 | project | Convert website to mobile version | Web-to-App Converter |
  | net-w10-04 | 10 | document | Compute the service costs for web development, web hosting | Cost Cruncher: Web Project Budget (Google Sheet link) |
  | net-pt1 / net-pt2 | 2 | project | Suggested Performance Tasks (HTML & CSS) | Web Developer Bootcamp (individual) / Mini Web Agency Challenge (group) |
  | net-pt3 / net-pt4 | 3 | project | Suggested Performance Tasks (CSS & JavaScript) | Full Stack Front-End Builder (individual) / Web Development Studio (group) |
  | net-pt5 / net-pt6 | 7 | project | Suggested Performance Tasks (JavaScript & C#) | Full-Stack Logic Builder (individual) / Web Dev Studio: Build, Code, and Store (group) |
  | net-pt7 / net-pt8 | 10 | project | Suggested Performance Tasks (ASP.NET MVC) | Full ASP.NET MVC Web Solutions (individual) / Web Dev Agency Simulation (group) |

  Two fully worked entries to copy the style from:

```json
[
  {
    "id": "net-w1-01",
    "subject": "dotnet",
    "term": 1,
    "week": 1,
    "competency": "Discuss the HTML fundamentals",
    "title": "Code & Create: My First Web Page",
    "type": "code",
    "codeLang": "web",
    "instructions": "Build a one-page personal web page.\n1. Keep the starter structure: html, head, title, body.\n2. Change the title to your full name.\n3. Add an <h1> with your name and a <p> about yourself in 2-3 sentences.\n4. Add one more <p> that explains, in your own words, what HTML is used for.\n5. Tap Preview to check your page, then Submit.",
    "starterCode": "<!DOCTYPE html>\n<html>\n<head>\n  <title>My Page</title>\n</head>\n<body>\n\n</body>\n</html>",
    "points": 10,
    "component": "written"
  },
  {
    "id": "net-w6-02",
    "subject": "dotnet",
    "term": 1,
    "week": 6,
    "competency": "Apply C# operators and decision making in problem solving",
    "title": "Decision Engine: C# Logic Builder",
    "type": "code",
    "codeLang": "csharp",
    "instructions": "Write a grade checker.\n1. Read a grade (0-100) with Console.ReadLine() and convert it with int.Parse.\n2. Use if / else if to print: 90-100 Outstanding, 85-89 Very Satisfactory, 80-84 Satisfactory, 75-79 Fairly Satisfactory, below 75 Did Not Meet Expectations.\n3. Print \"Invalid grade\" if it is below 0 or above 100 (use || ).\n4. Type a grade in Program input, tap Run, try at least 3 different grades, then Submit.",
    "starterCode": "using System;\n\nclass Program {\n  static void Main() {\n    Console.Write(\"Enter grade: \");\n    int grade = int.Parse(Console.ReadLine());\n    // your if / else if here\n  }\n}",
    "points": 10,
    "component": "written"
  }
]
```

- [ ] **Step 5: Run** `npx vitest run tests/unit/activity-bank.test.js` → PASS.

- [ ] **Step 6: Commit**

```bash
git add data/activity-bank/dotnet.json js/activity-bank.js tests/unit/activity-bank.test.js
git commit -m "feat(bank): .NET activity bank for all BOW weeks and PTs"
```

---

### Task 7: Teacher Activity Bank picker

**Files:**
- Modify: `teacher.html` (inside `#add-assignment-form`, right after the "Creating: ..." `<p>`), `js/teacher.js` (near `setCreateType`)
- Test: `tests/e2e/flows.spec.js`

**Interfaces:**
- Consumes: `loadBank`, `weeksOf`, `toAssignmentFields` (Task 6); ids from Task 4.

- [ ] **Step 1: Failing e2e** — append:

```js
test("activity bank fills the assignment form", async ({ page }) => {
  await signIn(page, TEACHER, "Teacher One");
  await page.waitForURL(/teacher\.html/);
  await page.locator("#subjects-list [data-open]").first().click();
  await page.locator("#sections-list [data-open]").first().click();
  await page.locator("#view-section summary", { hasText: "Create" }).click();
  await page.locator('[data-create-type="assignment"]').click();
  await page.selectOption("#bank-subject", "dotnet");
  await page.selectOption("#bank-week", "6");
  await page.selectOption("#bank-activity", "net-w6-02");
  await page.locator("#bank-use").click();
  await expect(page.locator("#assignment-title")).toHaveValue("Decision Engine: C# Logic Builder");
  await expect(page.locator("#assignment-filetype")).toHaveValue("code");
  await expect(page.locator("#assignment-codelang")).toHaveValue("csharp");
  await expect(page.locator("#assignment-starter")).toHaveValue(/static void Main/);
  await expect(page.locator("#assignment-total-points")).toHaveValue("10");
});
```

- [ ] **Step 2: Run, expect FAIL** — `npm run e2e:flows -- -g "activity bank"` → `#bank-subject` not found.

- [ ] **Step 3: Markup**

```html
          <details id="bank-picker" class="assignment-only not-quiz" style="margin:0.5rem 0;">
            <summary>&#128218; Use a ready activity (Budget of Work)</summary>
            <label>Subject</label>
            <select id="bank-subject">
              <option value="">Choose...</option>
              <option value="dotnet">Computer Programming (.NET Technology)</option>
            </select>
            <label>Week</label>
            <select id="bank-week" disabled></select>
            <label>Activity</label>
            <select id="bank-activity" disabled></select>
            <p class="muted" id="bank-competency"></p>
            <button type="button" class="secondary" id="bank-use" disabled>Fill in the form</button>
          </details>
```

- [ ] **Step 4: Logic** in `js/teacher.js` (import `{ loadBank, weeksOf, toAssignmentFields } from "./activity-bank.js?v=1"`):

```js
// Activity Bank: fills the add-assignment form from a ready BOW activity. It
// never saves - the teacher reviews and presses Add, so the normal create path
// (touchSection, notifications) runs unchanged.
let bankEntries = [];
el("bank-subject").addEventListener("change", async () => {
  const subject = el("bank-subject").value;
  el("bank-week").innerHTML = ""; el("bank-activity").innerHTML = "";
  el("bank-week").disabled = el("bank-activity").disabled = el("bank-use").disabled = true;
  el("bank-competency").textContent = "";
  if (!subject) return;
  try { bankEntries = await loadBank(subject); }
  catch (err) { alert(err.message); return; }
  el("bank-week").innerHTML = `<option value="">Choose...</option>` +
    weeksOf(bankEntries).map((w) => `<option value="${w}">Week ${w}</option>`).join("");
  el("bank-week").disabled = false;
});
el("bank-week").addEventListener("change", () => {
  const week = Number(el("bank-week").value);
  const list = bankEntries.filter((e) => e.week === week);
  el("bank-activity").innerHTML = `<option value="">Choose...</option>` +
    list.map((e) => `<option value="${escAttr(e.id)}">${escAttr(e.title)}</option>`).join("");
  el("bank-activity").disabled = !list.length;
  el("bank-use").disabled = true;
});
el("bank-activity").addEventListener("change", () => {
  const entry = bankEntries.find((e) => e.id === el("bank-activity").value);
  el("bank-competency").textContent = entry ? `Competency: ${entry.competency}` : "";
  el("bank-use").disabled = !entry;
});
el("bank-use").addEventListener("click", () => {
  const entry = bankEntries.find((e) => e.id === el("bank-activity").value);
  if (!entry) return;
  const f = toAssignmentFields(entry);
  el("assignment-title").value = f.title;
  el("assignment-instructions").value = f.instructions;
  el("assignment-filetype").value = f.allowedFileTypes;
  el("assignment-total-points").value = f.totalPoints;
  el("assignment-component").value = f.component;
  if (f.codeLang) {
    el("assignment-codelang").value = f.codeLang;
    el("assignment-starter").value = f.starterCode;
  }
  syncQuizBuilderVisibility("");
  el("bank-picker").open = false;
  toast("Filled in - check the details, set a due date, then add it.");
});
```

  Also reset the picker in `resetCreateType()` (`form.reset()` already clears selects; additionally set `bank-week`/`bank-activity` `innerHTML = ""` and disable them).

- [ ] **Step 5: Run** `npm run e2e:flows` → PASS.

- [ ] **Step 6: Commit**

```bash
git add teacher.html js/teacher.js tests/e2e/flows.spec.js
git commit -m "feat(teacher): Activity Bank picker fills the assignment form from the BOW"
```

---

### Task 8: Docs, cache-busters, final checks

**Files:**
- Create: `docs/design-notes/code-lab.md`
- Modify: `CLAUDE.md` (design-notes table row), `.claude/Skills/student-lms/SKILL.md` (task map + data model: `codeLang`, `starterCode`, `project`, `demoLink`), all HTML `?v=` via the bump script

- [ ] **Step 1: `docs/design-notes/code-lab.md`** — sections: Languages (`js/code-langs.js` is the single table; mono not dotnetcore and why; no top-level statements), Web preview sandbox rule (never `allow-same-origin`; srcdoc inherits the report-only CSP), Wandbox dependency and friendly failure, Project type + `demoLink` rules change (needs deploy), Activity Bank format, how to add `java.json` for Term 2 (Phase 2).
- [ ] **Step 2: CLAUDE.md** — add row `| Code Lab (.NET/Java) | docs/design-notes/code-lab.md | code languages, C# run, web preview sandbox, project submissions, activity bank |`.
- [ ] **Step 3: SKILL.md** — add the new files to the task map and the new fields to the data model.
- [ ] **Step 4: Bump** — `node scripts/bump-version.mjs css teacher student` then `git diff --stat` shows only version strings in HTML/sw/version.json besides earlier work.
- [ ] **Step 5: Full test run** — `npm test`, `npm run test:rules`, `npm run e2e`, `npm run e2e:flows` → all PASS.
- [ ] **Step 6: slop-critic** — run the `slop-critic` agent on the diff vs `main`; fix every "fix first" item.
- [ ] **Step 7: Commit**

```bash
git add docs/design-notes/code-lab.md CLAUDE.md .claude/Skills/student-lms/SKILL.md student.html teacher.html index.html sw.js version.json js/student.js
git commit -m "docs(code-lab): design notes, task map, cache-buster bump"
```

- [ ] **Step 8: Hand back to ian** — list: rules deploy command (`firebase deploy --only firestore:rules`), the Activity Bank to review (titles/instructions), and that nothing is pushed or deployed yet.

---

## Phase 2 (separate plan, before Term 2)
`data/activity-bank/java.json` (Java BOW weeks 1-10 + PTs; Swing weeks use `project`), "Computer Programming (Java)" option in `#bank-subject`, Java Scanner starter code. Reuses everything above.
