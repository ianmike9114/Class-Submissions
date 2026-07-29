// Direct browser -> Gemini calls. No backend, no Cloud Function - keeps the
// whole app on Firebase's free Spark plan (Storage/Functions both require
// the paid Blaze plan just to exist, even at $0 actual usage).
//
// The Gemini key is typed once into the teacher's Settings box and kept in
// localStorage only - never written to any file, never committed to git,
// and never loaded on student.html.
import { extractDriveFileId } from "./embed.js";

const STORAGE_KEY = "geminiApiKey";

export function getGeminiKey() {
  return localStorage.getItem(STORAGE_KEY) || "";
}

export function setGeminiKey(key) {
  localStorage.setItem(STORAGE_KEY, key.trim());
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
export async function runRubricCheck({ link, rubric, linkType }) {
  const apiKey = getGeminiKey();
  if (!apiKey) throw new Error("No Gemini API key set. Add one in Settings first.");

  const rubricText = rubric
    .map((r) => `- "${r.criterion}" (max ${r.maxPoints} points)`)
    .join("\n");

  const promptText = `You are helping a teacher pre-score a student submission against a rubric.
The submission is at this link: ${link}
Read/watch its content (use the URL context tool, or native video understanding if it's a YouTube link) and score it.

Return ONLY valid JSON, no markdown fences, in this exact shape:
{"scorePerCriterion": {"<criterion name>": <number>, ...}, "feedback": "<2-4 sentences, specific and constructive>"}

Rubric:
${rubricText}

Score each criterion using its own max-points scale. If you genuinely cannot access the link's content, set every score to 0 and say so plainly in the feedback field - do not guess.`;

  const parts = [{ text: promptText }];
  if (isYouTubeLink(link)) {
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
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
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
    throw new Error("Gemini didn't return valid JSON: " + rawText.slice(0, 300));
  }
}
