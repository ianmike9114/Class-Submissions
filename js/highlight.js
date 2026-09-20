// Lightweight syntax highlighting for code submissions and generated
// examples. highlight.js is loaded lazily from a CDN (ESM) the first time a
// code block is shown - matching the app's "CDN ESM import, no bundler"
// convention (see js/firebase-config.js). If the CDN is blocked or fails,
// the plain (already HTML-escaped) <pre><code> still renders correctly, so
// highlighting is purely a progressive enhancement and never breaks a page.

const HLJS_VERSION = "11.9.0";
const CDN = `https://cdnjs.cloudflare.com/ajax/libs/highlight.js/${HLJS_VERSION}`;

// Escape for safe insertion as text inside <pre><code> (& first).
export function escapeCode(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Returns the markup for a highlightable code block. The actual coloring is
// applied later by highlightWithin() once hljs has loaded; until then (or if
// it never loads) it's a plain, correctly-escaped monospace block.
export function codeBlockHtml(source, lang = "java") {
  return `<pre class="code-block"><code class="language-${lang}">${escapeCode(source)}</code></pre>`;
}

let _hljs; // undefined = not tried, false = failed, object = loaded

async function ensureHljs() {
  if (_hljs !== undefined) return _hljs;
  try {
    // Inject the theme stylesheet once.
    if (!document.getElementById("hljs-theme")) {
      const link = document.createElement("link");
      link.id = "hljs-theme";
      link.rel = "stylesheet";
      link.href = `${CDN}/styles/github.min.css`;
      document.head.appendChild(link);
    }
    const core = await import(`${CDN}/es/core.min.js`);
    const java = await import(`${CDN}/es/languages/java.min.js`);
    const hljs = core.default;
    hljs.registerLanguage("java", java.default);
    _hljs = hljs;
  } catch (e) {
    console.warn("highlight.js failed to load - code shows unhighlighted:", e.message);
    _hljs = false;
  }
  return _hljs;
}

// Highlights every <pre><code class="language-*"> inside `root`. No-op (and
// never throws) if hljs couldn't load.
export async function highlightWithin(root) {
  if (!root) return;
  const blocks = root.querySelectorAll("pre code[class^='language-']");
  if (blocks.length === 0) return;
  const hljs = await ensureHljs();
  if (!hljs) return;
  blocks.forEach((b) => {
    try { hljs.highlightElement(b); } catch { /* leave it plain */ }
  });
}
