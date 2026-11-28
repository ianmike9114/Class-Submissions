// Tests for tools/lms-agent against the Firestore EMULATOR only (never live).
// The suite refuses to run without FIRESTORE_EMULATOR_HOST (guard below).
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

const OWNER = "owner@example.com";
const OTHER = "other@example.com";
process.env.LMS_OWNER_EMAIL = OWNER;

let db, post, pull, publish, undo, upload, cap;
const tmp = () => mkdtempSync(join(tmpdir(), "lms-agent-"));

beforeAll(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Run via `npm run test:agent` (emulator required).");
  ({ db } = await import("../../tools/lms-agent/admin.mjs"));
  post = await import("../../tools/lms-agent/post-material.mjs");
  pull = await import("../../tools/lms-agent/subs-pull.mjs");
  publish = await import("../../tools/lms-agent/grade-publish.mjs");
  undo = await import("../../tools/lms-agent/grade-undo.mjs");
  upload = await import("../../tools/lms-agent/drive-upload.mjs");
  cap = await import("../../tools/lms-agent/cap.mjs");
});

beforeEach(async () => {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  const proj = process.env.GCLOUD_PROJECT || "demo-lms-agent";
  await fetch(`http://${host}/emulator/v1/projects/${proj}/databases/(default)/documents`, { method: "DELETE" });
  await db.collection("sections").doc("sec1").set({ subjectId: "subj1", sectionName: "A", ownerEmail: OWNER });
  await db.collection("sections").doc("secX").set({ subjectId: "subjX", sectionName: "X", ownerEmail: OTHER });
  await db.collection("assignments").doc("as1").set({ sectionId: "sec1", subjectId: "subj1", title: "Act 1", totalPoints: 50, ownerEmail: OWNER, instructions: "do it" });
  await db.collection("assignments").doc("as2").set({ sectionId: "sec1", subjectId: "subj1", title: "Act 2", totalPoints: 20, ownerEmail: OWNER });
  await db.collection("enrollments").doc("en1").set({ studentUID: "stu1", sectionId: "sec1", ownerEmail: OWNER });
});

const sub = (id, over = {}) => db.collection("submissions").doc(id).set({
  assignmentId: "as1", studentUID: "stu1", studentName: "Stu One", link: "", photoPages: [], status: "pending", submittedAt: 1, ownerEmail: OWNER, ...over,
});

describe("post-material", () => {
  it("writes the material shape and the section marker", async () => {
    const r = await post.postMaterial({ section: "sec1", title: "Module 1", link: "https://drive.google.com/x", lesson: "L1", allowDownload: true });
    const a = (await db.collection("assignments").doc(r.id).get()).data();
    expect(a).toMatchObject({ subjectId: "subj1", sectionId: "sec1", title: "Module 1", type: "material", lesson: "L1", instructions: "", instructionsLink: "https://drive.google.com/x", allowDownload: true, protectFile: false, ownerEmail: OWNER });
    expect(typeof a.createdAt).toBe("number");
    expect(a.totalPoints).toBeUndefined();
    const sec = (await db.collection("sections").doc("sec1").get()).data();
    expect(typeof sec.assignmentsVersion).toBe("number");
    expect(typeof sec.assignmentVersions[r.id]).toBe("number");
  });
  it("refuses a section owned by someone else", async () => {
    await expect(post.postMaterial({ section: "secX", title: "t", link: "l" })).rejects.toThrow(/not owned/);
    expect((await db.collection("assignments").where("title", "==", "t").get()).size).toBe(0);
  });
  it("dry-run writes nothing", async () => {
    const r = await post.postMaterial({ section: "sec1", title: "D", link: "l", dryRun: true });
    expect(r.dryRun).toBe(true);
    expect((await db.collection("assignments").where("title", "==", "D").get()).size).toBe(0);
  });
  it("posts a submittable assignment with the site's graded fields", async () => {
    const r = await post.postMaterial({ section: "sec1", title: "Module 2", link: "https://drive.google.com/y", kind: "assignment", points: 50, component: "performance", due: "2026-11-20" });
    const a = (await db.collection("assignments").doc(r.id).get()).data();
    expect(a).toMatchObject({ type: "assignment", totalPoints: 50, component: "performance", dueDate: "2026-11-20", allowedFileTypes: "document", uploadFolderLink: "", rubricReferenceLink: "", ownerEmail: OWNER });
  });
  it("rejects an assignment without valid points", async () => {
    await expect(post.postMaterial({ section: "sec1", title: "NP", link: "l", kind: "assignment" })).rejects.toThrow(/--points/);
    await expect(post.postMaterial({ section: "sec1", title: "NP", link: "l", kind: "assignment", points: 10, due: "Nov 20" })).rejects.toThrow(/--due/);
  });
});

describe("cap", () => {
  it("drops 10 per return, floor 0", () => {
    expect(cap.maxAfterReturns(50, 0)).toBe(50);
    expect(cap.maxAfterReturns(50, 2)).toBe(30);
    expect(cap.maxAfterReturns(10, 5)).toBe(0);
  });
});

describe("subs-pull", () => {
  it("returns only pending subs of that assignment, decodes photos, records cap", async () => {
    const png = "data:image/png;base64," + Buffer.from("fakepng").toString("base64");
    await sub("s1", { photoPages: [png], returnCount: 1 });
    await sub("s2", { status: "published" });
    await sub("s3", { assignmentId: "as2" });
    await sub("s4", { ownerEmail: OTHER });
    const out = tmp();
    const r = await pull.pullSubs({ assignment: "as1", out });
    expect(r.results.map((x) => x.submissionId)).toEqual(["s1"]);
    expect(readdirSync(out).sort()).toEqual(["assignment.json", "s1"]);
    const meta = JSON.parse(readFileSync(join(out, "s1", "meta.json"), "utf8"));
    expect(meta.cap).toBe(40);
    expect(meta.photos).toEqual(["photo-1.png"]);
    expect(readFileSync(join(out, "s1", "photo-1.png"), "utf8")).toBe("fakepng");
    expect(JSON.stringify(meta)).not.toContain("base64");
  });
  it("fetches doc text, and records fetchError for an HTML sign-in page", async () => {
    await sub("s1", { link: "https://docs.google.com/document/d/ABCDEFGHIJ1234/edit" });
    await sub("s2", { link: "https://docs.google.com/document/d/PRIVATEDOC12345/edit" });
    const fetchImpl = async (url) => url.includes("ABCDEFGHIJ1234")
      ? new Response("hello work", { status: 200, headers: { "content-type": "text/plain" } })
      : new Response("<html>sign in</html>", { status: 200, headers: { "content-type": "text/html" } });
    const out = tmp();
    await pull.pullSubs({ assignment: "as1", out, fetchImpl });
    expect(readFileSync(join(out, "s1", "work.txt"), "utf8")).toBe("hello work");
    expect(JSON.parse(readFileSync(join(out, "s2", "meta.json"), "utf8")).fetchError).toMatch(/HTML/);
  });
  it("refuses an assignment owned by someone else", async () => {
    await db.collection("assignments").doc("asX").set({ sectionId: "secX", title: "x", totalPoints: 10, ownerEmail: OTHER });
    await expect(pull.pullSubs({ assignment: "asX", out: tmp() })).rejects.toThrow(/not owned/);
  });
});

describe("grade-publish + undo", () => {
  const g = (id, over = {}) => ({ submissionId: id, score: 40, feedback: "Good work, clear steps.", confidence: 0.9, ...over });

  it("publishes the site shape, bumps the marker, writes an audit line", async () => {
    await sub("s1");
    const r = await publish.publishGrades({ assignment: "as1", grades: [g("s1")], auditDir: tmp() });
    expect(r.published).toHaveLength(1);
    const s = (await db.collection("submissions").doc("s1").get()).data();
    expect(s.status).toBe("published");
    expect(s.finalGrade).toEqual({ score: 40, feedback: "Good work, clear steps." });
    expect(typeof s.publishedAt).toBe("number");
    expect(typeof (await db.collection("enrollments").doc("en1").get()).data().subsVersion).toBe("number");
    const lines = readFileSync(r.auditFile, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(lines).toHaveLength(1);
    expect(lines[0].previous.status).toBe("pending");
    expect(lines[0].new.finalGrade.score).toBe(40);
  });

  it("skips non-pending, low confidence, skipReason, blank feedback; errors on out-of-range and NaN", async () => {
    await sub("pub", { status: "published" });
    for (const id of ["low", "sr", "bf", "hi", "nan"]) await sub(id);
    await sub("ret", { returnCount: 2 });
    const r = await publish.publishGrades({ assignment: "as1", auditDir: tmp(), grades: [
      g("pub"), g("low", { confidence: 0.3 }), g("sr", { skipReason: "private link" }), g("bf", { feedback: "  " }),
      g("hi", { score: 51 }), g("nan", { score: NaN }), g("ret", { score: 35 }),
    ] });
    expect(r.published).toHaveLength(0);
    expect(r.skipped.map((x) => x.submissionId).sort()).toEqual(["bf", "low", "pub", "sr"]);
    expect(r.errors.map((x) => x.submissionId).sort()).toEqual(["hi", "nan", "ret"]);
    for (const id of ["low", "sr", "bf", "hi", "nan", "ret"]) {
      expect((await db.collection("submissions").doc(id).get()).data().status).toBe("pending");
    }
  });

  it("refuses another owner's submission", async () => {
    await sub("o", { ownerEmail: OTHER });
    const r = await publish.publishGrades({ assignment: "as1", grades: [g("o")], auditDir: tmp() });
    expect(r.errors).toHaveLength(1);
    expect((await db.collection("submissions").doc("o").get()).data().status).toBe("pending");
  });

  it("dry-run writes nothing", async () => {
    await sub("s1");
    const dir = tmp();
    const r = await publish.publishGrades({ assignment: "as1", grades: [g("s1")], dryRun: true, auditDir: dir });
    expect(r.published).toHaveLength(1);
    expect((await db.collection("submissions").doc("s1").get()).data().status).toBe("pending");
    expect(readdirSync(dir)).toHaveLength(0);
    expect((await db.collection("enrollments").doc("en1").get()).data().subsVersion).toBeUndefined();
  });

  it("undo restores, and skips docs edited since", async () => {
    await sub("s1"); await sub("s2", { studentUID: "stu2" });
    const r = await publish.publishGrades({ assignment: "as1", grades: [g("s1"), g("s2")], auditDir: tmp() });
    await db.collection("submissions").doc("s2").update({ "finalGrade.score": 45 }); // teacher edit
    const u = await undo.undoRun({ audit: r.auditFile });
    expect(u.restored.map((x) => x.submissionId)).toEqual(["s1"]);
    expect(u.skipped.map((x) => x.submissionId)).toEqual(["s2"]);
    const s1 = (await db.collection("submissions").doc("s1").get()).data();
    expect(s1.status).toBe("pending");
    expect(s1.finalGrade).toBeUndefined();
    expect(s1.publishedAt).toBeUndefined();
    expect((await db.collection("submissions").doc("s2").get()).data().status).toBe("published");
  });

  const ret = (id, over = {}) => ({ submissionId: id, action: "return", reason: "answers only", feedback: "Please write each question with your answer.", confidence: 0.9, ...over });

  it("return: no returnCount penalty, no score, archives an attempt, bumps marker", async () => {
    await sub("r1", { photoPages: ["data:image/webp;base64,AAA"] });
    const r = await publish.publishGrades({ assignment: "as1", grades: [ret("r1")], auditDir: tmp() });
    expect(r.returned).toHaveLength(1);
    const s = (await db.collection("submissions").doc("r1").get()).data();
    expect(s.status).toBe("returned");
    expect(s.finalGrade).toEqual({ feedback: "Please write each question with your answer." });
    expect(s.returnCount).toBeUndefined();
    expect(typeof s.returnedAt).toBe("number");
    const atts = await db.collection("submissionAttempts").where("submissionId", "==", "r1").get();
    expect(atts.size).toBe(1);
    expect(atts.docs[0].data()).toMatchObject({ score: null, ownerEmail: OWNER, photoPages: ["data:image/webp;base64,AAA"] });
    expect(typeof (await db.collection("enrollments").doc("en1").get()).data().subsVersion).toBe("number");
  });

  it("action skip writes nothing; return dry-run writes nothing; unknown action errors", async () => {
    await sub("k1"); await sub("k2"); await sub("k3");
    const dir = tmp();
    const r = await publish.publishGrades({ assignment: "as1", dryRun: true, auditDir: dir, grades: [
      { submissionId: "k1", action: "skip", reason: "blurry photo" }, ret("k2"), { submissionId: "k3", action: "zap" },
    ] });
    expect(r.skipped.map((x) => x.submissionId)).toEqual(["k1"]);
    expect(r.returned.map((x) => x.submissionId)).toEqual(["k2"]);
    expect(r.errors.map((x) => x.submissionId)).toEqual(["k3"]);
    for (const id of ["k1", "k2", "k3"]) expect((await db.collection("submissions").doc(id).get()).data().status).toBe("pending");
    expect((await db.collection("submissionAttempts").get()).size).toBe(0);
    expect(readdirSync(dir)).toHaveLength(0);
  });

  it("undo of a return restores pending and deletes the attempt; skips if student resubmitted", async () => {
    await sub("u1"); await sub("u2", { studentUID: "stu2" });
    const r = await publish.publishGrades({ assignment: "as1", grades: [ret("u1"), ret("u2")], auditDir: tmp() });
    await db.collection("submissions").doc("u2").update({ status: "pending", submittedAt: Date.now() }); // student resubmitted
    const u = await undo.undoRun({ audit: r.auditFile });
    expect(u.restored.map((x) => x.submissionId)).toEqual(["u1"]);
    expect(u.skipped.map((x) => x.submissionId)).toEqual(["u2"]);
    const s = (await db.collection("submissions").doc("u1").get()).data();
    expect(s.status).toBe("pending");
    expect(s.finalGrade).toBeUndefined();
    expect(s.returnedAt).toBeUndefined();
    expect((await db.collection("submissionAttempts").where("submissionId", "==", "u1").get()).size).toBe(0);
    expect((await db.collection("submissionAttempts").where("submissionId", "==", "u2").get()).size).toBe(1);
  });
});

describe("drive-upload", () => {
  const layout = { remote: "gdrive", studentPath: "S/{subject}/G{grade}/Q{quarter}/W{week}", privatePath: "P/{subject}/G{grade}/Q{quarter}/W{week}" };
  const base = { file: "C:/x/Key.docx", subject: "ICT", grade: "11", quarter: "1", week: "2", layout };
  const mk = () => { const calls = []; return { calls, exec: async (cmd, args) => { calls.push([cmd, ...args]); return { stdout: "https://link\n" }; } }; };

  it("answer-key goes to privatePath and never calls rclone link", async () => {
    const m = mk();
    const r = await upload.uploadToDrive({ ...base, kind: "answer-key", exec: m.exec });
    expect(r.link).toBeNull();
    expect(m.calls.some((c) => c[1] === "link")).toBe(false);
    expect(m.calls.find((c) => c[1] === "copy")[3]).toBe("gdrive:P/ICT/G11/Q1/W2");
  });
  it("module goes to studentPath and returns the link", async () => {
    const m = mk();
    const r = await upload.uploadToDrive({ ...base, kind: "module", exec: m.exec });
    expect(r.link).toBe("https://link");
    expect(m.calls.find((c) => c[1] === "copy")[3]).toBe("gdrive:S/ICT/G11/Q1/W2");
    expect(m.calls.some((c) => c[1] === "link")).toBe(true);
  });
  it("rewrites rclone open?id= links to /file/d/<id>/view", async () => {
    const exec = async (cmd, args) => ({ stdout: args[0] === "link" ? "https://drive.google.com/open?id=1AbC_d-9\n" : "" });
    const r = await upload.uploadToDrive({ ...base, kind: "module", exec });
    expect(r.link).toBe("https://drive.google.com/file/d/1AbC_d-9/view");
    expect(upload.normalizeDriveLink("https://drive.google.com/file/d/X/view")).toBe("https://drive.google.com/file/d/X/view");
    expect(upload.normalizeDriveLink("https://link")).toBe("https://link");
  });
  it("dry-run runs nothing; bad kind rejected", async () => {
    const m = mk();
    await upload.uploadToDrive({ ...base, kind: "worksheet", dryRun: true, exec: m.exec });
    expect(m.calls).toHaveLength(0);
    await expect(upload.uploadToDrive({ ...base, kind: "bogus", exec: m.exec })).rejects.toThrow(/kind/);
  });
  it("real drive-layout.json: class folder tree, answer key outside it, unknown class and missing flag rejected", async () => {
    const real = { file: "C:/x/M.docx", term: "2", sy: "2026-2027", class: "Grade 10 - Orchid - CSS", folder: "November 16, 2026", dryRun: true };
    const mod = await upload.uploadToDrive({ ...real, kind: "module" });
    expect(mod.destDir).toBe("gdrive:DepEd-AI-System/Term 2 - 2026-2027/Grade 10 - Orchid - CSS/November 16, 2026");
    const key = await upload.uploadToDrive({ ...real, kind: "answer-key" });
    expect(key.destDir.startsWith("gdrive:DepEd-AI-System/")).toBe(false);
    await expect(upload.uploadToDrive({ ...real, kind: "module", class: "Grade 7 - Nope" })).rejects.toThrow(/--class must be one of/);
    await expect(upload.uploadToDrive({ ...real, kind: "module", folder: undefined })).rejects.toThrow(/--folder is required/);
  });
  it("module .docx also uploads a PDF made by Word, and the link points to the PDF", async () => {
    const m = mk();
    const r = await upload.uploadToDrive({ ...base, file: "C:/x/Module 9.docx", kind: "module", exec: m.exec });
    expect(r.pdf).toBe(true);
    const conv = m.calls.find((c) => c[0] === "powershell");
    expect(conv).toContain("C:/x/Module 9.docx");
    expect(conv.some((a) => /docx-to-pdf\.ps1$/.test(a))).toBe(true);
    const copies = m.calls.filter((c) => c[1] === "copy");
    expect(copies).toHaveLength(2);
    expect(copies[1][2]).toMatch(/Module 9\.pdf$/);
    expect(m.calls.find((c) => c[1] === "link")[2]).toBe("gdrive:S/ICT/G11/Q1/W2/Module 9.pdf");
  });
  it("no PDF for answer keys, --no-pdf, non-docx files, or a dry run", async () => {
    for (const opts of [{ kind: "answer-key" }, { kind: "module", noPdf: true }, { kind: "worksheet", file: "C:/x/W.pdf" }]) {
      const m = mk();
      await upload.uploadToDrive({ ...base, ...opts, exec: m.exec });
      expect(m.calls.some((c) => c[0] === "powershell")).toBe(false);
      expect(m.calls.filter((c) => c[1] === "copy")).toHaveLength(1);
    }
    const m = mk();
    const r = await upload.uploadToDrive({ ...base, kind: "module", dryRun: true, exec: m.exec });
    expect(r.pdf).toBe(true);
    expect(m.calls).toHaveLength(0);
  });
  it("explains a failed Word conversion", async () => {
    const exec = async (cmd) => { if (cmd === "powershell") throw new Error("COM busy"); return { stdout: "" }; };
    await expect(upload.uploadToDrive({ ...base, kind: "module", exec })).rejects.toThrow(/--no-pdf/);
  });
  it("gives a setup hint when rclone is missing", async () => {
    const exec = async () => { const e = new Error("x"); e.code = "ENOENT"; throw e; };
    await expect(upload.uploadToDrive({ ...base, kind: "module", exec })).rejects.toThrow(/rclone not found/);
  });
});
