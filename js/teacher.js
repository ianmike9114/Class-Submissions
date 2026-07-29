import { db, functions } from "./firebase-config.js";
import { guardPage, signOutUser } from "./auth.js";
import {
  collection, addDoc, doc, updateDoc, getDoc, getDocs, query, where, orderBy,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

const state = { subjectId: null, sectionId: null, assignmentId: null };

function el(id) { return document.getElementById(id); }
function genJoinCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

// ---------- subjects ----------
async function loadSubjects() {
  const showArchived = el("toggle-archived").checked;
  const snap = await getDocs(collection(db, "subjects"));
  const list = el("subjects-list");
  list.innerHTML = "";
  snap.forEach((d) => {
    const s = d.data();
    if (s.archived && !showArchived) return;
    const row = document.createElement("div");
    row.className = "card";
    row.innerHTML = `
      <strong>${s.name}</strong> <span class="muted">(${s.gradeLevel})</span>
      ${s.archived ? '<span class="muted"> — archived</span>' : ""}
      <div style="margin-top:0.5rem;">
        <button data-open="${d.id}">Open</button>
        <button class="secondary" data-archive="${d.id}" data-value="${!s.archived}">
          ${s.archived ? "Unarchive" : "Archive"}
        </button>
      </div>`;
    list.appendChild(row);
  });
  list.querySelectorAll("[data-open]").forEach((b) =>
    b.addEventListener("click", () => openSubject(b.dataset.open)));
  list.querySelectorAll("[data-archive]").forEach((b) =>
    b.addEventListener("click", async () => {
      await updateDoc(doc(db, "subjects", b.dataset.archive), { archived: b.dataset.value === "true" });
      loadSubjects();
    }));
}

el("add-subject-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  await addDoc(collection(db, "subjects"), {
    name: el("subject-name").value.trim(),
    gradeLevel: el("subject-grade").value.trim(),
    archived: false,
  });
  e.target.reset();
  loadSubjects();
});
el("toggle-archived").addEventListener("change", loadSubjects);

// ---------- sections ----------
async function openSubject(subjectId) {
  state.subjectId = subjectId;
  state.sectionId = null;
  state.assignmentId = null;
  const subject = await getDoc(doc(db, "subjects", subjectId));
  el("subject-view-name").textContent = subject.data().name;
  show("view-subject");
  loadSections();
}

async function loadSections() {
  const q = query(collection(db, "sections"), where("subjectId", "==", state.subjectId));
  const snap = await getDocs(q);
  const list = el("sections-list");
  list.innerHTML = "";
  snap.forEach((d) => {
    const s = d.data();
    const row = document.createElement("div");
    row.className = "card";
    row.innerHTML = `
      <strong>${s.sectionName}</strong>
      <span class="muted"> — join code: <code>${s.joinCode}</code></span>
      <div style="margin-top:0.5rem;"><button data-open="${d.id}">Open</button></div>`;
    list.appendChild(row);
  });
  list.querySelectorAll("[data-open]").forEach((b) =>
    b.addEventListener("click", () => openSection(b.dataset.open)));
}

el("add-section-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  await addDoc(collection(db, "sections"), {
    subjectId: state.subjectId,
    sectionName: el("section-name").value.trim(),
    joinCode: genJoinCode(),
  });
  e.target.reset();
  loadSections();
});

// ---------- assignments ----------
async function openSection(sectionId) {
  state.sectionId = sectionId;
  state.assignmentId = null;
  const section = await getDoc(doc(db, "sections", sectionId));
  el("section-view-name").textContent = section.data().sectionName;
  show("view-section");
  loadAssignments();
}

let rubricRowCount = 0;
function addRubricRow(criterion = "", maxPoints = "", description = "") {
  rubricRowCount++;
  const row = document.createElement("div");
  row.className = "rubric-row";
  row.innerHTML = `
    <input placeholder="Criterion (e.g. Code correctness)" class="rubric-criterion" value="${criterion}" />
    <input placeholder="Max pts" type="number" class="rubric-points" value="${maxPoints}" />
    <button type="button" class="secondary" data-remove-row>x</button>`;
  row.querySelector("[data-remove-row]").addEventListener("click", () => row.remove());
  el("rubric-rows").appendChild(row);
}
el("add-rubric-row").addEventListener("click", () => addRubricRow());

async function loadAssignments() {
  const q = query(collection(db, "assignments"), where("sectionId", "==", state.sectionId));
  const snap = await getDocs(q);
  const list = el("assignments-list");
  list.innerHTML = "";
  snap.forEach((d) => {
    const a = d.data();
    const row = document.createElement("div");
    row.className = "card";
    row.innerHTML = `
      <strong>${a.title}</strong> <span class="muted">due ${a.dueDate || "no date"}</span>
      <div class="muted">Allowed: ${a.allowedFileTypes} — ${a.rubric.length} rubric criteria</div>
      <div style="margin-top:0.5rem;"><button data-open="${d.id}">Open submissions</button></div>`;
    list.appendChild(row);
  });
  list.querySelectorAll("[data-open]").forEach((b) =>
    b.addEventListener("click", () => openAssignment(b.dataset.open)));
}

el("add-assignment-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const rubric = [...document.querySelectorAll(".rubric-row")].map((row) => ({
    criterion: row.querySelector(".rubric-criterion").value.trim(),
    maxPoints: Number(row.querySelector(".rubric-points").value) || 0,
  })).filter((r) => r.criterion);

  await addDoc(collection(db, "assignments"), {
    subjectId: state.subjectId,
    sectionId: state.sectionId,
    title: el("assignment-title").value.trim(),
    dueDate: el("assignment-due").value,
    allowedFileTypes: el("assignment-filetype").value,
    rubric,
    createdAt: Date.now(),
  });
  e.target.reset();
  el("rubric-rows").innerHTML = "";
  addRubricRow();
  loadAssignments();
});

// ---------- submissions ----------
async function openAssignment(assignmentId) {
  state.assignmentId = assignmentId;
  const a = await getDoc(doc(db, "assignments", assignmentId));
  el("assignment-view-title").textContent = a.data().title;
  show("view-assignment");
  loadSubmissions();
}

async function loadSubmissions() {
  const filter = el("submission-filter").value;
  const q = query(collection(db, "submissions"), where("assignmentId", "==", state.assignmentId));
  const snap = await getDocs(q);
  const list = el("submissions-list");
  list.innerHTML = "";
  snap.forEach((d) => {
    const s = d.data();
    if (filter !== "all" && s.status !== filter) return;
    const row = document.createElement("div");
    row.className = "card";
    const link = s.videoLink
      ? `<a href="${s.videoLink}" target="_blank" rel="noopener">video link</a>`
      : `<a href="${s.fileURL}" target="_blank" rel="noopener">uploaded file</a>`;
    row.innerHTML = `
      <strong>${s.studentName}</strong>
      <span class="status-${s.status}"> — ${s.status}</span>
      <div class="muted">${link}</div>
      <div id="detail-${d.id}"></div>
      <div style="margin-top:0.5rem;">
        ${s.videoLink ? "" : `<button data-ai="${d.id}">Run AI Check</button>`}
        <button class="secondary" data-review="${d.id}">Review / Grade</button>
      </div>`;
    list.appendChild(row);
  });
  list.querySelectorAll("[data-ai]").forEach((b) =>
    b.addEventListener("click", () => runAiCheck(b.dataset.ai)));
  list.querySelectorAll("[data-review]").forEach((b) =>
    b.addEventListener("click", () => openReview(b.dataset.review)));
}
el("submission-filter").addEventListener("change", loadSubmissions);

async function runAiCheck(submissionId) {
  const btn = document.querySelector(`[data-ai="${submissionId}"]`);
  if (btn) { btn.disabled = true; btn.textContent = "Checking..."; }
  try {
    const call = httpsCallable(functions, "runAiCheck");
    await call({ submissionId });
    loadSubmissions();
  } catch (e) {
    alert("AI check failed: " + e.message);
    if (btn) { btn.disabled = false; btn.textContent = "Run AI Check"; }
  }
}

async function openReview(submissionId) {
  const ref = doc(db, "submissions", submissionId);
  const snap = await getDoc(ref);
  const s = snap.data();
  const a = (await getDoc(doc(db, "assignments", s.assignmentId))).data();
  const container = el(`detail-${submissionId}`);

  const draft = s.finalGrade || s.aiDraft || { scorePerCriterion: {}, feedback: "" };
  const rows = a.rubric.map((r) => `
    <label>${r.criterion} (max ${r.maxPoints})</label>
    <input type="number" data-crit="${r.criterion}" value="${draft.scorePerCriterion?.[r.criterion] ?? ""}" />
  `).join("");

  container.innerHTML = `
    <div class="card">
      ${rows}
      <label>Feedback</label>
      <textarea id="feedback-${submissionId}" rows="3">${draft.feedback || ""}</textarea>
      <button data-publish="${submissionId}">Publish to student</button>
    </div>`;

  container.querySelector(`[data-publish]`).addEventListener("click", async () => {
    const scorePerCriterion = {};
    container.querySelectorAll("[data-crit]").forEach((inp) => {
      scorePerCriterion[inp.dataset.crit] = Number(inp.value) || 0;
    });
    await updateDoc(ref, {
      finalGrade: {
        scorePerCriterion,
        feedback: el(`feedback-${submissionId}`).value,
      },
      status: "published",
      publishedAt: Date.now(),
    });
    loadSubmissions();
  });
}

// ---------- nav ----------
function show(viewId) {
  ["view-subjects", "view-subject", "view-section", "view-assignment"].forEach((v) => {
    el(v).classList.toggle("hidden", v !== viewId);
  });
}
el("back-to-subjects").addEventListener("click", () => { show("view-subjects"); loadSubjects(); });
el("back-to-subject").addEventListener("click", () => show("view-subject"));
el("back-to-section").addEventListener("click", () => show("view-section"));
el("sign-out").addEventListener("click", signOutUser);

// ---------- init ----------
guardPage("teacher").then((user) => {
  if (!user) return;
  el("teacher-email").textContent = user.email;
  addRubricRow();
  loadSubjects();
  show("view-subjects");
});
