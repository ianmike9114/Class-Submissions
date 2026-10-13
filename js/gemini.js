// Direct browser -> Gemini calls. No backend, no Cloud Function - keeps the
// whole app on Firebase's free Spark plan (Storage/Functions both require
// the paid Blaze plan just to exist, even at $0 actual usage).
//
// The Gemini key is typed once into the teacher's Settings box and kept in
// localStorage only - never written to any file, never committed to git,
// and never loaded on student.html.
import { extractDriveFileId } from "./embed.js";

const STORAGE_KEY = "geminiApiKey";
// "-latest" alias tracks Google's current Flash model, so
// a pinned version (was gemini-2.0-flash) can't break when Google retires it.
const GEMINI_MODEL = "gemini-flash-latest";

export function getGeminiKey() {
  return localStorage.getItem(STORAGE_KEY) || "";
}

export function setGeminiKey(key) {
  localStorage.setItem(STORAGE_KEY, key.trim());
}

// Groq (free key from console.groq.com, no credit card) is tried FIRST for the
// text-only drafting tools (quiz + code examples); Gemini is the fallback if
// Groq has no key, is down, or is rate-limited. The rubric-check stays
// Gemini-only (it sends images). Same localStorage-only storage as Gemini.
const GROQ_STORAGE_KEY = "groqApiKey";
// Groq retires models (llama-3.3-70b-versatile was shut down Aug 2026), so
// the model isn't hard-wired: try these in order, and on "model_not_found"
// ask Groq's /models endpoint which ones this key can use and pick the first
// match (or any chat model). The working choice is remembered per browser.
const GROQ_MODEL_PREFS = [
  "openai/gpt-oss-120b",
  "qwen/qwen3.6-27b",
  "openai/gpt-oss-20b",
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
];
const GROQ_MODEL_STORAGE_KEY = "groqModel";

export function getGroqKey() {
  return localStorage.getItem(GROQ_STORAGE_KEY) || "";
}

export function setGroqKey(key) {
  localStorage.setItem(GROQ_STORAGE_KEY, key.trim());
}

async function pickGroqModel() {
  const res = await fetch("https://api.groq.com/openai/v1/models", {
    headers: { Authorization: `Bearer ${getGroqKey()}` },
  });
  if (!res.ok) throw new Error(`Groq model list failed (${res.status})`);
  const ids = ((await res.json()).data || []).map((m) => m.id);
  const pick = GROQ_MODEL_PREFS.find((m) => ids.includes(m))
    || ids.find((id) => !/whisper|tts|guard|playai|orpheus|compound|prompt-guard/i.test(id));
  if (!pick) throw new Error("Groq has no usable chat model for this key.");
  localStorage.setItem(GROQ_MODEL_STORAGE_KEY, pick);
  return pick;
}

async function groqRequest(model, promptText, json) {
  const body = {
    model,
    messages: [{ role: "user", content: promptText }],
    temperature: 0.7,
  };
  if (json) body.response_format = { type: "json_object" };
  // gpt-oss models "think" first; keep it short so drafts stay fast.
  if (model.startsWith("openai/gpt-oss")) body.reasoning_effort = "low";
  // Qwen puts its <think> notes in the reply text unless hidden.
  if (model.startsWith("qwen/")) body.reasoning_format = "hidden";
  return fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getGroqKey()}` },
    body: JSON.stringify(body),
  });
}

async function callGroq(promptText, json) {
  let model = localStorage.getItem(GROQ_MODEL_STORAGE_KEY) || GROQ_MODEL_PREFS[0];
  let res = await groqRequest(model, promptText, json);
  if (res.status === 404 || res.status === 400) {
    const text = await res.text();
    if (!/model_not_found|decommissioned|does not exist/i.test(text)) {
      throw new Error(`Groq request failed (${res.status}): ${text.slice(0, 300)}`);
    }
    model = await pickGroqModel();
    res = await groqRequest(model, promptText, json);
  }
  if (!res.ok) {
    throw new Error(`Groq request failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
  const data = await res.json();
  return (data.choices?.[0]?.message?.content || "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

// Gemini returns 503 "high demand" in spikes - retry once after a short wait,
// then try the lighter Flash-Lite model before giving up.
async function callGemini(promptText, json) {
  const body = { contents: [{ parts: [{ text: promptText }] }] };
  if (json) body.generationConfig = { responseMimeType: "application/json" };
  const attempts = [GEMINI_MODEL, GEMINI_MODEL, "gemini-flash-lite-latest"];
  let lastError = null;
  for (let i = 0; i < attempts.length; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 2000));
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${attempts[i]}:generateContent?key=${getGeminiKey()}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    if (res.ok) {
      const data = await res.json();
      return data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
    }
    lastError = new Error(`Gemini request failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
    if (res.status !== 503 && res.status !== 429 && res.status !== 500) throw lastError;
  }
  throw lastError;
}

// Text-only drafting call: Groq first, Gemini fallback. Throws only if no key
// is set or every configured provider failed.
async function draftText(promptText, { json = false } = {}) {
  const hasGroq = !!getGroqKey();
  const hasGemini = !!getGeminiKey();
  if (!hasGroq && !hasGemini) {
    throw new Error("No AI key set. Add a free Groq key (console.groq.com) in Settings (gear icon) first.");
  }
  let groqError = null;
  if (hasGroq) {
    try {
      return await callGroq(promptText, json);
    } catch (err) {
      groqError = err;
      if (!hasGemini) throw err;
    }
  }
  try {
    return await callGemini(promptText, json);
  } catch (err) {
    if (groqError) throw new Error(`${groqError.message} | Gemini fallback also failed: ${err.message}`);
    throw err;
  }
}

function isYouTubeLink(url) {
  return /youtube\.com\/watch|youtu\.be\//.test(url);
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(",")[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// Best-effort: fetch a Drive-hosted image's actual bytes for Gemini vision,
// more reliable than the urlContext tool for genuinely visual content like
// a photographed handwritten page. Drive's direct-view endpoint doesn't
// reliably send permissive CORS headers, so this can fail - on any failure
// this returns null and the caller just falls back to urlContext-only,
// same as before this existed. Failure is logged (not surfaced to the
// teacher) so it's debuggable without breaking the AI check entirely.
async function tryFetchImagePart(link) {
  const fileId = extractDriveFileId(link);
  if (!fileId) return null;
  try {
    const res = await fetch(`https://drive.google.com/uc?export=view&id=${fileId}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const data = await blobToBase64(blob);
    const mimeType = res.headers.get("content-type") || "image/jpeg";
    return { inlineData: { mimeType, data } };
  } catch (e) {
    console.warn("Direct image fetch for Gemini vision failed, falling back to urlContext only:", e.message);
    return null;
  }
}

// Returns { scorePerCriterion, feedback } or throws.
// linkType is the assignment's allowedFileTypes ("document"/"code"/"image"/
// "video") - only "image" attempts the direct-fetch vision path above.
// rubricReferenceLink (optional) is a PDF/doc with the full rubric
// description - given as extra context only, doesn't change what's
// actually scored (still the criterion/maxPoints rows in `rubric`).
// photoData (optional) is a "data:image/...;base64,..." string from the
// student's in-app camera capture (js/student.js's compressImage()) -
// when present it's sent as inline image data instead of reading `link`.
export async function runRubricCheck({ link, photoData, rubric, linkType, rubricReferenceLink }) {
  const apiKey = getGeminiKey();
  if (!apiKey) throw new Error("No Gemini API key set. Add one in Settings first.");

  const rubricText = rubric
    .map((r) => `- "${r.criterion}" (max ${r.maxPoints} points)`)
    .join("\n");

  const referenceLine = rubricReferenceLink
    ? `\nFor extra context on what each criterion means, also read this rubric reference document (use the URL context tool): ${rubricReferenceLink}\n`
    : "";

  const submissionLine = photoData
    ? "The student's submission is an attached photo (see the image data below) - score what you see in it directly."
    : `The submission is at this link: ${link}\nRead/watch its content (use the URL context tool, or native video understanding if it's a YouTube link) and score it.`;

  const promptText = `You are helping a teacher pre-score a student submission against a rubric.
${submissionLine}
${referenceLine}
Return ONLY valid JSON, no markdown fences, in this exact shape:
{"scorePerCriterion": {"<criterion name>": <number>, ...}, "feedback": "<2-4 sentences, specific and constructive>"}

Rubric:
${rubricText}

Score each criterion using its own max-points scale, exactly as named above (the reference document is context only - don't add or rename criteria). If you genuinely cannot access/read the submission, set every score to 0 and say so plainly in the feedback field - do not guess.`;

  const parts = [{ text: promptText }];
  if (photoData) {
    const match = photoData.match(/^data:([^;]+);base64,(.*)$/);
    if (match) parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
  } else if (isYouTubeLink(link)) {
    parts.push({ fileData: { fileUri: link } });
  } else if (linkType === "image") {
    const imagePart = await tryFetchImagePart(link);
    if (imagePart) parts.push(imagePart);
  }

  const body = {
    contents: [{ parts }],
    tools: [{ urlContext: {} }],
  };

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    throw new Error(`Gemini request failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
  const data = await res.json();
  const rawText = data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
  const cleaned = rawText.replace(/^```json\s*/i, "").replace(/```$/, "").trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error("The AI didn't return valid JSON: " + rawText.slice(0, 300));
  }
}

// Teacher-only: draft an example/starter program for a topic, to hand to
// students. Same browser-direct Gemini call as runRubricCheck (teacher's own
// key, no backend), but returns raw source code as a plain string.
// style: "starter" (skeleton with TODOs), "solution" (complete worked
// example), or "commented" (complete + heavily explained line by line).
export async function generateCodeExample({ topic, language = "Java", style = "commented" }) {
  if (!topic || !topic.trim()) throw new Error("Describe what the example should do first.");

  const styleLine = {
    starter: "a STARTER SKELETON: the class/method structure and imports the student needs, with `// TODO:` comments where they must write the logic themselves. Do not give away the full solution.",
    solution: "a COMPLETE, correct worked example that compiles and runs.",
    commented: "a COMPLETE, correct example that compiles and runs, with clear comments on each important line explaining what it does, suitable for a beginner.",
  }[style] || "a complete, correct example.";

  const promptText = `You are helping a Senior High School teacher prepare a ${language} programming example for their students.
Write ${styleLine}
The example must cover: ${topic}

Rules:
- Output ONLY the ${language} source code. No explanation before or after, no markdown code fences.
- If it is ${language} and a runnable program, put the entry point in a public class named Main so it can be run as-is.
- Keep it appropriate for a beginner Grade 11-12 student.`;

  const rawText = await draftText(promptText);
  // Strip any stray markdown fences the model adds despite the instruction.
  return rawText.replace(/^```[a-zA-Z]*\s*/i, "").replace(/```\s*$/, "").trim();
}

// Teacher-only: draft quiz items for a topic. Same browser-direct call and
// "Return ONLY valid JSON" pattern as runRubricCheck. Returns the model's raw
// parsed JSON - js/quiz.js's parseGeneratedQuiz() sanitizes it into builder
// items, and the teacher reviews/edits every item before saving.
// types: subset of ["mc","tf","id"].
export async function generateQuiz({ topic, count = 10, types = ["mc"], gradeLevel = "11", avoid = [] }) {
  if (!topic || !topic.trim()) throw new Error("Type the quiz topic first.");

  const typeLines = {
    mc: '- "mc" (multiple choice): {"type":"mc","prompt":"...","choices":["...","...","...","..."],"answer":<index 0-3 of the correct choice>}',
    tf: '- "tf" (true or false): {"type":"tf","prompt":"<a statement>","answer":true|false}',
    id: '- "id" (identification, 1-3 word answer): {"type":"id","prompt":"...","answer":["<accepted answer>","<optional alternate spelling/abbreviation>"]}',
  };
  const wanted = types.filter((t) => typeLines[t]);
  if (wanted.length === 0) throw new Error("Pick at least one item type.");

  const promptText = `You are helping a Philippine DepEd Senior High School teacher write a quiz for Grade ${gradeLevel} students.
Topic / coverage: ${topic}

Write exactly ${count} items, mixing these item types as evenly as possible:
${wanted.map((t) => typeLines[t]).join("\n")}

Rules:
- Use clear, simple English a Grade ${gradeLevel} Filipino student can read quickly.
- Prefer questions that check understanding and application (short scenarios, examples, "which of these") over pure word-for-word recall.
- Multiple choice: exactly 4 plausible choices, only one correct, no "all of the above"/"none of the above". Vary the position of the correct answer.
- Multiple choice: all 4 choices must be SIMILAR IN LENGTH AND DETAIL (within a few words of each other). The correct answer must NOT be the longest or most detailed choice - make the wrong choices just as specific and believable. Vary which position holds the longest choice.
- True/False: avoid trick wording and double negatives.
- Identification: the answer must be short and unambiguous.${avoid.length ? `
- These questions already exist - write NEW ones that do not repeat or closely reword them:
${avoid.filter(Boolean).slice(0, 60).map((p) => "  * " + p.trim().slice(0, 160)).join("\n")}` : ""}

Return ONLY valid JSON, no markdown fences, in this exact shape:
{"items":[ ...items as shown above... ]}`;

  const rawText = await draftText(promptText, { json: true });
  const cleaned = rawText.replace(/^```json\s*/i, "").replace(/```$/, "").trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error("The AI didn't return valid JSON: " + rawText.slice(0, 300));
  }
}
