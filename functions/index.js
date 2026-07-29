const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const mammoth = require("mammoth");

admin.initializeApp();
const db = admin.firestore();
const bucket = admin.storage().bucket();

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
// Set this the same way as firestore.rules / storage.rules / js/firebase-config.js.
const TEACHER_EMAIL = "galutira.ianjoseph.f@gmail.com";

const TEXT_EXTENSIONS = [".txt", ".js", ".py", ".java", ".html", ".css", ".c", ".cpp", ".cs", ".json", ".md"];

function extForUrl(url) {
  const clean = url.split("?")[0];
  const match = clean.match(/\.[a-zA-Z0-9]+$/);
  return match ? match[0].toLowerCase() : "";
}

async function downloadFromUrl(fileURL) {
  const res = await fetch(fileURL);
  if (!res.ok) throw new Error(`Could not download submission file (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

async function buildGeminiContent(submission) {
  const ext = extForUrl(submission.fileURL || "");

  if (ext === ".docx") {
    const buffer = await downloadFromUrl(submission.fileURL);
    const { value: text } = await mammoth.extractRawText({ buffer });
    return [{ text }];
  }

  if (ext === ".pdf") {
    const buffer = await downloadFromUrl(submission.fileURL);
    return [{ inlineData: { mimeType: "application/pdf", data: buffer.toString("base64") } }];
  }

  if ([".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(ext)) {
    const buffer = await downloadFromUrl(submission.fileURL);
    const mimeType = ext === ".png" ? "image/png" : ext === ".gif" ? "image/gif" : "image/jpeg";
    return [{ inlineData: { mimeType, data: buffer.toString("base64") } }];
  }

  if (TEXT_EXTENSIONS.includes(ext)) {
    const buffer = await downloadFromUrl(submission.fileURL);
    return [{ text: buffer.toString("utf-8") }];
  }

  // pptx and anything else: not auto-extracted in v1 - teacher grades manually.
  throw new HttpsError(
    "failed-precondition",
    `File type "${ext || "unknown"}" isn't auto-checked yet (v1 supports docx/pdf/images/code/text). Grade this one manually.`
  );
}

exports.runAiCheck = onCall({ secrets: [GEMINI_API_KEY] }, async (request) => {
  if (request.auth?.token?.email !== TEACHER_EMAIL) {
    throw new HttpsError("permission-denied", "Only the teacher account can run AI checks.");
  }

  const { submissionId } = request.data;
  if (!submissionId) throw new HttpsError("invalid-argument", "submissionId is required.");

  const subRef = db.collection("submissions").doc(submissionId);
  const subSnap = await subRef.get();
  if (!subSnap.exists) throw new HttpsError("not-found", "Submission not found.");
  const submission = subSnap.data();

  if (submission.videoLink) {
    throw new HttpsError("failed-precondition", "Video submissions are graded manually, not via AI check.");
  }

  const assignSnap = await db.collection("assignments").doc(submission.assignmentId).get();
  const assignment = assignSnap.data();

  const contentParts = await buildGeminiContent(submission);

  const rubricText = assignment.rubric
    .map((r) => `- "${r.criterion}" (max ${r.maxPoints} points)`)
    .join("\n");

  const promptText = `You are helping a teacher pre-score a student submission against a rubric.
Return ONLY valid JSON, no markdown fences, in this exact shape:
{"scorePerCriterion": {"<criterion name>": <number>, ...}, "feedback": "<2-4 sentences, specific and constructive>"}

Rubric:
${rubricText}

Score each criterion using its own max-points scale. Base every score strictly on the submission content below.`;

  const body = {
    contents: [{ parts: [{ text: promptText }, ...contentParts] }],
  };

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY.value()}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    throw new HttpsError("internal", `Gemini request failed (${res.status}): ${await res.text()}`);
  }
  const data = await res.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const cleaned = rawText.replace(/^```json\s*/i, "").replace(/```$/, "").trim();

  let aiDraft;
  try {
    aiDraft = JSON.parse(cleaned);
  } catch {
    throw new HttpsError("internal", "Gemini did not return valid JSON: " + rawText.slice(0, 300));
  }

  await subRef.update({
    aiDraft,
    status: "ai-drafted",
    aiCheckedAt: Date.now(),
  });

  return { ok: true, aiDraft };
});
