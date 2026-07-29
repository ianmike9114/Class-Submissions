import { db } from "./firebase-config.js";
import { guardPage, signOutUser } from "./auth.js";
import {
  collection, addDoc, doc, updateDoc, deleteDoc, getDoc, getDocs, query, where,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getGeminiKey, setGeminiKey, runRubricCheck } from "./gemini.js";
import { toEmbedUrl } from "./embed.js";
import { loadWorkbook, matchStudents, applyAndDownload, totalScore } from "./class-record.js";

const state = { subjectId: null, sectionId: null, assignmentId: null };
let exportState = { matches: [], rosterRows: [], scoreCol: "", fileBaseName: "" };

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
        <button class="danger" data-delete-subject="${d.id}">Delete</button>
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
  list.querySelectorAll("[data-delete-subject]").forEach((b) =>
    b.addEventListener("click", async () => {
      const ok = confirm(
        "Delete this subject? This only removes the subject itself - any sections/assignments/submissions/enrollments already under it are NOT deleted and will become unreachable in this app. If you just want it out of the way but might need it later, use Archive instead. This can't be undone."
      );
      if (!ok) return;
      await deleteDoc(doc(db, "subjects", b.dataset.deleteSubject));
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
      <div style="margin-top:0.5rem;">
        <button data-open="${d.id}">Open</button>
        <button class="danger" data-delete-section="${d.id}">Delete</button>
      </div>`;
    list.appendChild(row);
  });
  list.querySelectorAll("[data-open]").forEach((b) =>
    b.addEventListener("click", () => openSection(b.dataset.open)));
  list.querySelectorAll("[data-delete-section]").forEach((b) =>
    b.addEventListener("click", async () => {
      const ok = confirm(
        "Delete this section? This only removes the section itself - any assignments/submissions/enrollments already under it are NOT deleted and will become unreachable in this app. This can't be undone."
      );
      if (!ok) return;
      await deleteDoc(doc(db, "sections", b.dataset.deleteSection));
      loadSections();
    }));
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
      ${a.instructions ? `<p class="muted">${a.instructions}</p>` : ""}
      ${a.instructionsLink ? `<div class="muted"><a href="${a.instructionsLink}" target="_blank" rel="noopener">Instructions file</a></div>` : ""}
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
    instructions: el("assignment-instructions").value.trim(),
    instructionsLink: el("assignment-instructions-link").value.trim(),
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
    const embedUrl = toEmbedUrl(s.link);
    const linkBlock = embedUrl
      ? `<iframe src="${embedUrl}" class="submission-preview"></iframe>
         <div class="muted"><a href="${s.link}" target="_blank" rel="noopener">open in new tab</a></div>`
      : `<div class="muted"><a href="${s.link}" target="_blank" rel="noopener">${s.link}</a></div>`;
    row.innerHTML = `
      <strong>${s.studentName}</strong>
      <span class="status-${s.status}"> — ${s.status}</span>
      ${linkBlock}
      <div id="detail-${d.id}"></div>
      <div style="margin-top:0.5rem;">
        <button data-ai="${d.id}">Run AI Check</button>
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
    const subRef = doc(db, "submissions", submissionId);
    const submission = (await getDoc(subRef)).data();
    const assignment = (await getDoc(doc(db, "assignments", submission.assignmentId))).data();

    const aiDraft = await runRubricCheck({
      link: submission.link,
      rubric: assignment.rubric,
      linkType: assignment.allowedFileTypes,
    });

    await updateDoc(subRef, {
      aiDraft,
      status: "ai-drafted",
      aiCheckedAt: Date.now(),
    });
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

// ---------- export to Class Record (.xlsx) ----------
el("export-config-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = el("export-message");
  msg.textContent = "";
  el("export-match-table").innerHTML = "";
  try {
    const file = el("record-file").files[0];
    if (!file) throw new Error("Choose a file first.");

    const rosterRows = await loadWorkbook(file, {
      sheet: el("record-sheet").value,
      nameCol: el("record-name-col").value,
      dataStartRow: el("record-start-row").value,
    });
    if (rosterRows.length === 0) {
      throw new Error("No names found there - check the sheet name, column letter, and start row.");
    }

    const q = query(
      collection(db, "submissions"),
      where("assignmentId", "==", state.assignmentId),
      where("status", "==", "published")
    );
    const snap = await getDocs(q);
    const submissions = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (submissions.length === 0) throw new Error("No published submissions for this assignment yet.");

    exportState = {
      matches: matchStudents(submissions, rosterRows),
      rosterRows,
      scoreCol: el("record-score-col").value,
      fileBaseName: file.name.replace(/\.xlsx$/i, ""),
    };
    renderMatchTable();
  } catch (err) {
    msg.textContent = err.message;
  }
});

function renderMatchTable() {
  const container = el("export-match-table");
  const rows = exportState.matches.map((m, i) => `
    <div style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem; margin-bottom:0.4rem;">
      <span>${m.studentName} <span class="muted">(score: ${m.score})</span></span>
      <select data-match-idx="${i}">
        <option value="">-- not found, skip --</option>
        ${exportState.rosterRows.map((r) => `
          <option value="${r.row}" ${r.row === m.matchedRow ? "selected" : ""}>${r.name} (row ${r.row})</option>
        `).join("")}
      </select>
    </div>`).join("");

  container.innerHTML = `${rows}<button id="export-apply">Apply &amp; Download</button>`;

  container.querySelectorAll("[data-match-idx]").forEach((sel) => {
    sel.addEventListener("change", () => {
      const idx = Number(sel.dataset.matchIdx);
      exportState.matches[idx].matchedRow = sel.value ? Number(sel.value) : null;
    });
  });

  el("export-apply").addEventListener("click", () => {
    applyAndDownload(exportState.matches, exportState.scoreCol, `${exportState.fileBaseName}-updated.xlsx`);
  });
}

// ---------- roster (per-section, seeds the Records grid's rows) ----------
let rosterPreviewNames = [];

el("roster-config-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = el("roster-message");
  msg.textContent = "";
  el("roster-preview").innerHTML = "";
  try {
    const file = el("roster-file").files[0];
    if (!file) throw new Error("Choose a file first.");
    const rows = await loadWorkbook(file, {
      sheet: el("roster-sheet").value,
      nameCol: el("roster-name-col").value,
      dataStartRow: el("roster-start-row").value,
    });
    if (rows.length === 0) {
      throw new Error("No names found there - check the sheet name, column letter, and start row.");
    }
    rosterPreviewNames = rows.map((r) => r.name);
    renderRosterPreview();
  } catch (err) {
    msg.textContent = err.message;
  }
});

function renderRosterPreview() {
  const container = el("roster-preview");
  const rows = rosterPreviewNames.map((name, i) => `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.3rem;">
      <span>${name}</span>
      <button type="button" class="secondary" data-remove-name="${i}">Remove</button>
    </div>`).join("");

  container.innerHTML = `
    <p class="muted">${rosterPreviewNames.length} name(s) found. Remove any that aren't actual students (e.g. a "MALE"/"FEMALE" header row), then save.</p>
    ${rows}
    <button id="roster-save">Save Roster (${rosterPreviewNames.length})</button>`;

  container.querySelectorAll("[data-remove-name]").forEach((b) => {
    b.addEventListener("click", () => {
      rosterPreviewNames.splice(Number(b.dataset.removeName), 1);
      renderRosterPreview();
    });
  });

  el("roster-save").addEventListener("click", async () => {
    await updateDoc(doc(db, "sections", state.sectionId), { roster: rosterPreviewNames });
    el("roster-message").textContent = `Saved ${rosterPreviewNames.length} name(s) to this section's roster.`;
    el("roster-preview").innerHTML = "";
  });
}

// ---------- records (gradebook grid, one section at a time) ----------
async function openRecords() {
  show("view-records");
  loadRecords();
}
el("view-records-btn").addEventListener("click", openRecords);

async function loadRecords() {
  const container = el("records-table");
  container.innerHTML = `<p class="muted">Loading...</p>`;

  const section = (await getDoc(doc(db, "sections", state.sectionId))).data();
  el("records-view-title").textContent = section.sectionName;
  const roster = section.roster || [];

  if (roster.length === 0) {
    container.innerHTML = `<p class="muted">No roster set for this section yet - go back and use "Set Roster" first.</p>`;
    return;
  }

  const assignSnap = await getDocs(query(collection(db, "assignments"), where("sectionId", "==", state.sectionId)));
  const assignments = assignSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  if (assignments.length === 0) {
    container.innerHTML = `<p class="muted">No assignments yet in this section.</p>`;
    return;
  }

  const enrollSnap = await getDocs(query(collection(db, "enrollments"), where("sectionId", "==", state.sectionId)));
  const enrollments = enrollSnap.docs.map((d) => d.data());

  const submissionsByAssignment = {};
  for (const a of assignments) {
    const subSnap = await getDocs(query(collection(db, "submissions"), where("assignmentId", "==", a.id)));
    const byStudent = new Map();
    subSnap.forEach((d) => byStudent.set(d.data().studentUID, d.data()));
    submissionsByAssignment[a.id] = byStudent;
  }

  const headerCells = assignments.map((a) => `<th>${a.title}</th>`).join("");
  const bodyRows = roster.map((name) => {
    const enrollment = enrollments.find((en) => en.studentName.toLowerCase() === name.toLowerCase());
    const cells = assignments.map((a) => {
      if (!enrollment) return `<td class="muted">Not joined</td>`;
      const sub = submissionsByAssignment[a.id].get(enrollment.studentUID);
      if (!sub) return `<td class="muted">No submission</td>`;
      if (sub.status === "published") {
        return `<td>${totalScore(sub.finalGrade?.scorePerCriterion)}</td>`;
      }
      return `<td class="status-${sub.status}">${sub.status}</td>`;
    }).join("");
    return `<tr><td>${name}</td>${cells}</tr>`;
  }).join("");

  container.innerHTML = `
    <table class="records-grid">
      <thead><tr><th>Student</th>${headerCells}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>`;
}

// ---------- nav ----------
function show(viewId) {
  ["view-subjects", "view-subject", "view-section", "view-assignment", "view-records"].forEach((v) => {
    el(v).classList.toggle("hidden", v !== viewId);
  });
}
el("back-to-subjects").addEventListener("click", () => { show("view-subjects"); loadSubjects(); });
el("back-to-subject").addEventListener("click", () => show("view-subject"));
el("back-to-section").addEventListener("click", () => show("view-section"));
el("back-to-section-from-records").addEventListener("click", () => show("view-section"));
el("sign-out").addEventListener("click", signOutUser);

// ---------- settings (Gemini key, kept in localStorage only) ----------
el("settings-form").addEventListener("submit", (e) => {
  e.preventDefault();
  setGeminiKey(el("gemini-key").value);
  el("settings-message").textContent = "Saved (kept in this browser only).";
});

// ---------- init ----------
guardPage("teacher").then((user) => {
  if (!user) return;
  el("teacher-email").textContent = user.email;
  el("gemini-key").value = getGeminiKey();
  addRubricRow();
  loadSubjects();
  show("view-subjects");
});
