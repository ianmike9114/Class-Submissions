// Runs a student's Java directly from the browser via Wandbox's free public
// compiler API (wandbox.org) - no backend, no Cloud Function, so it keeps the
// app on Firebase's free Spark plan (same "call an external service straight
// from the browser" pattern as js/gemini.js). Wandbox compiles and runs the
// code on its own servers and returns the output; the student's own source is
// all that's ever sent, and Wandbox serves permissive CORS headers so the
// browser call works from the deployed site.
//
// (We originally used Piston/emkc.org, but its public API became whitelist-
// only in Feb 2026 - Wandbox is the free, no-key, CORS-open replacement.)
//
// Every failure path returns a friendly message rather than throwing, so a
// failed Run never blocks actually submitting the pasted code.

const WANDBOX_URL = "https://wandbox.org/api/compile.json";
// A current OpenJDK confirmed available via GET https://wandbox.org/api/list.json.
const JAVA_COMPILER = "openjdk-jdk-21+35";

// Wandbox saves the submitted source as prog.java, so a top-level *public*
// class (e.g. the `public class Main` students are taught to write) fails with
// "class X is public, should be declared in a file named X.java". Dropping the
// `public` modifier from top-level type declarations makes it compile, and
// Wandbox still auto-runs whichever class has main(). This only touches
// `public class/interface/enum`, never `public static`/`public void`/etc.
function stripTopLevelPublic(src) {
  return src.replace(/\bpublic\s+(class|interface|enum|record)\b/g, "$1");
}

// Runs Java source and returns a single combined, human-readable output
// string (compile errors + program output), plus an `ok` flag. Never throws.
export async function runJava(source, stdin = "") {
  if (!source || !source.trim()) {
    return { ok: false, output: "Nothing to run - paste your Java code first." };
  }
  let res;
  try {
    res = await fetch(WANDBOX_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        compiler: JAVA_COMPILER,
        code: stripTopLevelPublic(source),
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

  // Wandbox: status "0" = compiled and ran; compiler_error holds build errors,
  // program_output/program_error hold stdout/stderr at runtime.
  const parts = [];
  if (data.compiler_error) parts.push(data.compiler_error.trimEnd());
  if (data.program_output) parts.push(data.program_output.trimEnd());
  if (data.program_error) parts.push(data.program_error.trimEnd());

  const ok = String(data.status) === "0";
  const output = parts.join("\n").trim()
    || (ok ? "(program finished with no output)" : "Your code didn't run - check for errors.");
  return { ok, output };
}
