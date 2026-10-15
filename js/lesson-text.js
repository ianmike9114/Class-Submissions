// Reads the text out of a teacher's lesson file (PDF or PowerPoint .pptx) in
// the browser, so the quiz builder can have the AI draft questions from the
// actual lesson. The file is never uploaded or saved anywhere - no Storage
// (see CLAUDE.md) - only the extracted text goes into the AI prompt.
//
// pdf.js is lazy-loaded from CDN on first PDF; .pptx is a ZIP of slide XML,
// opened with JSZip (the caller passes its own lazy loader so the library is
// shared with teacher.js's other ZIP features).

const PDFJS_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs";
const PDFJS_WORKER_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs";

// Keeps the AI request small enough for Groq's free per-minute token limit
// (draftText() falls back to Gemini if Groq still refuses).
export const LESSON_TEXT_MAX_CHARS = 15000;

function decodeXmlEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

// One slide's (or notes page's) XML -> plain text, one line per paragraph.
// Bare numbers are dropped (slide-number placeholders on notes pages).
export function slideXmlText(xml) {
  if (!xml) return "";
  return xml
    .split(/<\/a:p>/)
    .map((para) => {
      const runs = [];
      para.replace(/<a:br\s*\/>|<a:t(?:\s[^>]*)?>([^<]*)<\/a:t>/g, (m, t) => {
        runs.push(t === undefined ? " " : decodeXmlEntities(t));
        return m;
      });
      return runs.join("").replace(/\s+/g, " ").trim();
    })
    .filter((line) => line && !/^\d+$/.test(line))
    .join("\n");
}

// Shrinks the text to `max` chars spread evenly over every page/slide (not
// just the first ones): short units keep everything, the leftover budget is
// shared by the long ones.
export function trimUnitsEvenly(units, max = LESSON_TEXT_MAX_CHARS) {
  const total = units.reduce((n, u) => n + u.length, 0);
  if (total <= max) return units;
  let budget = max;
  let open = units.map((u, i) => i);
  const limit = new Array(units.length).fill(0);
  while (open.length) {
    const share = Math.floor(budget / open.length);
    const fits = open.filter((i) => units[i].length <= share);
    if (!fits.length) {
      open.forEach((i) => { limit[i] = share; });
      break;
    }
    fits.forEach((i) => { limit[i] = units[i].length; budget -= units[i].length; });
    open = open.filter((i) => units[i].length > share);
  }
  return units.map((u, i) => (u.length > limit[i] ? u.slice(0, limit[i]).trimEnd() + " ..." : u));
}

function numberIn(path) {
  return Number(path.match(/(\d+)\.xml$/)?.[1] || 0);
}

async function pptxUnits(file, loadJSZip) {
  const JSZip = await loadJSZip();
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const paths = Object.keys(zip.files);
  const slides = paths.filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p)).sort((a, b) => numberIn(a) - numberIn(b));
  const notes = new Map(paths.filter((p) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(p)).map((p) => [numberIn(p), p]));
  const units = [];
  for (const p of slides) {
    const n = numberIn(p);
    let text = slideXmlText(await zip.file(p).async("string"));
    const noteText = notes.has(n) ? slideXmlText(await zip.file(notes.get(n)).async("string")) : "";
    if (noteText) text += `\n(Notes: ${noteText})`;
    units.push(text);
  }
  return units;
}

async function pdfUnits(file) {
  const pdfjs = await import(PDFJS_URL);
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const units = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    units.push(content.items.map((it) => it.str + (it.hasEOL ? "\n" : " ")).join("").replace(/[ \t]+/g, " ").trim());
  }
  return units;
}

// -> { text, units, kind: "pdf" | "pptx", words, trimmed }
export async function extractLessonText(file, { loadJSZip } = {}) {
  const name = (file?.name || "").toLowerCase();
  let kind;
  if (name.endsWith(".pdf") || file?.type === "application/pdf") kind = "pdf";
  else if (name.endsWith(".pptx")) kind = "pptx";
  else if (name.endsWith(".ppt")) throw new Error("Old .ppt files can't be read here - open it in PowerPoint and Save As .pptx or PDF first.");
  else throw new Error("Use a PDF or PowerPoint (.pptx) file.");

  let units;
  try {
    units = kind === "pdf" ? await pdfUnits(file) : await pptxUnits(file, loadJSZip);
  } catch (err) {
    console.error(err);
    throw new Error(`Couldn't read that ${kind === "pdf" ? "PDF" : "PowerPoint"} file (${err.message}). Try saving it again, or export it as PDF.`);
  }
  const words = units.join(" ").split(/\s+/).filter(Boolean).length;
  if (words < 10) {
    throw new Error(kind === "pdf"
      ? "This PDF is pictures of pages, with no readable text. Use the PowerPoint, or a PDF made from Word/PowerPoint."
      : "Couldn't find text on these slides (they may be pictures). Type the topic instead, or use a text PDF.");
  }
  const label = kind === "pdf" ? "Page" : "Slide";
  const trimmed = units.reduce((n, u) => n + u.length, 0) > LESSON_TEXT_MAX_CHARS;
  const text = trimUnitsEvenly(units)
    .map((u, i) => (u ? `[${label} ${i + 1}]\n${u}` : ""))
    .filter(Boolean)
    .join("\n\n");
  return { text, units: units.length, kind, words, trimmed };
}
