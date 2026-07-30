import { db } from "./firebase-config.js";
import { guardPage, signOutUser } from "./auth.js";
import {
  collection, addDoc, doc, updateDoc, deleteDoc, getDoc, getDocs, query, where,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getGeminiKey, setGeminiKey, runRubricCheck } from "./gemini.js";
import { toEmbedUrl } from "./embed.js";
import { loadWorkbook } from "./class-record.js";

// AI rubric-check is hidden (not deleted) - per-call Gemini cost isn't
// worth it right now. Flip this back to true to restore the Run AI Check
// button, the Settings gear (only the Gemini key box lives there), and
// the "AI drafted" filter option. Note: runAiCheck() below still expects
// assignment.rubric (per-criterion), which assignments no longer have
// since grading switched to a single total-points score - re-enabling
// would need a small adapter first.
const AI_CHECK_ENABLED = false;

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
      <strong>${s.name}</strong>
      <span class="muted" id="year-term-${d.id}">(${s.gradeLevel} — SY ${s.schoolYear || "—"} · Term ${s.term || "—"})</span>
      ${s.archived ? '<span class="muted"> — archived</span>' : ""}
      <div id="year-term-edit-${d.id}"></div>
      <div style="margin-top:0.5rem;">
        <button data-open="${d.id}">Open</button>
        <button class="secondary" data-edit-year="${d.id}">Edit Year/Term</button>
        <button class="secondary" data-archive="${d.id}" data-value="${!s.archived}">
          ${s.archived ? "Unarchive" : "Archive"}
        </button>
        <button class="danger" data-delete-subject="${d.id}">Delete</button>
      </div>`;
    list.appendChild(row);
  });
  list.querySelectorAll("[data-open]").forEach((b) =>
    b.addEventListener("click", () => openSubject(b.dataset.open)));
  list.querySelectorAll("[data-edit-year]").forEach((b) =>
    b.addEventListener("click", () => editSubjectYearTerm(b.dataset.editYear)));
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

async function editSubjectYearTerm(subjectId) {
  const s = (await getDoc(doc(db, "subjects", subjectId))).data();
  const container = el(`year-term-edit-${subjectId}`);
  container.innerHTML = `
    <label>School Year</label>
    <input id="edit-year-${subjectId}" value="${s.schoolYear || ""}" placeholder="e.g. 2026-2027" />
    <label>Term</label>
    <select id="edit-term-${subjectId}">
      <option value="1" ${s.term === "1" ? "selected" : ""}>Term 1</option>
      <option value="2" ${s.term === "2" ? "selected" : ""}>Term 2</option>
      <option value="3" ${s.term === "3" ? "selected" : ""}>Term 3</option>
    </select>
    <button data-save-year="${subjectId}">Save</button>`;

  container.querySelector("[data-save-year]").addEventListener("click", async () => {
    await updateDoc(doc(db, "subjects", subjectId), {
      schoolYear: el(`edit-year-${subjectId}`).value.trim(),
      term: el(`edit-term-${subjectId}`).value,
    });
    loadSubjects();
  });
}

el("add-subject-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  await addDoc(collection(db, "subjects"), {
    name: el("subject-name").value.trim(),
    gradeLevel: el("subject-grade").value.trim(),
    schoolYear: el("subject-year").value.trim(),
    term: el("subject-term").value,
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
  const subject = (await getDoc(doc(db, "subjects", subjectId))).data();
  el("subject-view-name").textContent = `${subject.name} (${subject.gradeLevel || "—"} — SY ${subject.schoolYear || "—"} · Term ${subject.term || "—"})`;
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
      <strong id="section-name-${d.id}">${s.sectionName}</strong>
      <span class="muted"> — join code: <code>${s.joinCode}</code></span>
      <div id="section-edit-${d.id}"></div>
      <div style="margin-top:0.5rem;">
        <button data-open="${d.id}">Open</button>
        <button class="secondary" data-edit-section="${d.id}">Edit name</button>
        <button class="danger" data-delete-section="${d.id}">Delete</button>
      </div>`;
    list.appendChild(row);
  });
  list.querySelectorAll("[data-open]").forEach((b) =>
    b.addEventListener("click", () => openSection(b.dataset.open)));
  list.querySelectorAll("[data-edit-section]").forEach((b) =>
    b.addEventListener("click", () => editSectionName(b.dataset.editSection)));
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

async function editSectionName(sectionId) {
  const s = (await getDoc(doc(db, "sections", sectionId))).data();
  const container = el(`section-edit-${sectionId}`);
  container.innerHTML = `
    <label>Section name</label>
    <input id="edit-section-name-${sectionId}" value="${s.sectionName}" />
    <button data-save-section="${sectionId}">Save</button>`;

  container.querySelector("[data-save-section]").addEventListener("click", async () => {
    const name = el(`edit-section-name-${sectionId}`).value.trim();
    if (!name) return;
    await updateDoc(doc(db, "sections", sectionId), { sectionName: name });
    loadSections();
  });
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

// ---------- enrolled students (subject-wide, all its sections) ----------
// onlySectionId scopes the list to one section (called from view-section);
// omitted, it's subject-wide across all that subject's sections (called
// from view-subject) - same table either way, just a different source query
// and back-button target.
let enrolledBackView = "view-subject";
async function openEnrolled(onlySectionId) {
  let sectionMap, titleText;
  if (onlySectionId) {
    const sectionData = (await getDoc(doc(db, "sections", onlySectionId))).data();
    sectionMap = new Map([[onlySectionId, sectionData.sectionName]]);
    titleText = sectionData.sectionName;
    enrolledBackView = "view-section";
  } else {
    const sectionsSnap = await getDocs(query(collection(db, "sections"), where("subjectId", "==", state.subjectId)));
    sectionMap = new Map(sectionsSnap.docs.map((d) => [d.id, d.data().sectionName]));
    titleText = el("subject-view-name").textContent;
    enrolledBackView = "view-subject";
  }
  el("enrolled-view-name").textContent = titleText;
  const sectionIds = [...sectionMap.keys()];

  const list = el("enrolled-list");
  if (sectionIds.length === 0) {
    list.innerHTML = '<p class="muted">No sections yet.</p>';
    show("view-enrolled");
    return;
  }

  // Firestore 'in' queries cap at 30 - fine for a solo-teacher class load.
  const enrollSnap = await getDocs(
    query(collection(db, "enrollments"), where("sectionId", "in", sectionIds.slice(0, 30)))
  );
  const rows = enrollSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) =>
      (sectionMap.get(a.sectionId) || "").localeCompare(sectionMap.get(b.sectionId) || "")
      || a.studentName.localeCompare(b.studentName));

  list.innerHTML = rows.length
    ? `<table class="records-grid"><thead><tr><th>Name</th><th>Gmail</th><th>Section</th><th></th></tr></thead><tbody>
        ${rows.map((r) => `<tr><td id="enroll-name-${r.id}">${r.studentName}</td><td>${r.studentEmail || ""}</td><td>${sectionMap.get(r.sectionId) || ""}</td><td>
          <button class="secondary" data-edit-enrollment="${r.id}">Edit name</button>
          <button class="danger" data-remove-enrollment="${r.id}">Remove</button>
        </td></tr>`).join("")}
      </tbody></table>`
    : '<p class="muted">No students enrolled yet.</p>';

  // Fixes a garbled/raw Google display name (common when a section had no
  // roster to pick from at join time) without needing the student to
  // rejoin - edits the enrollment's studentName in place.
  list.querySelectorAll("[data-edit-enrollment]").forEach((b) =>
    b.addEventListener("click", () => {
      const enrollmentId = b.dataset.editEnrollment;
      const cell = el(`enroll-name-${enrollmentId}`);
      const current = cell.textContent;
      cell.innerHTML = `<input id="edit-enroll-${enrollmentId}" value="${current}" style="margin-bottom:0;" />`;
      const input = el(`edit-enroll-${enrollmentId}`);
      input.focus();
      input.select();
      let saved = false;
      const save = async () => {
        if (saved) return;
        saved = true;
        const name = input.value.trim();
        if (name && name !== current) {
          await updateDoc(doc(db, "enrollments", enrollmentId), { studentName: name });
        }
        openEnrolled(onlySectionId);
      };
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") save(); });
      input.addEventListener("blur", save);
    }));

  list.querySelectorAll("[data-remove-enrollment]").forEach((b) =>
    b.addEventListener("click", async () => {
      const ok = confirm("Remove this student's enrollment? This frees their roster name for someone else to claim, and they'd need to join again with the code.");
      if (!ok) return;
      await deleteDoc(doc(db, "enrollments", b.dataset.removeEnrollment));
      openEnrolled(onlySectionId);
    }));

  show("view-enrolled");
}
el("open-enrolled").addEventListener("click", () => openEnrolled());
el("open-enrolled-section").addEventListener("click", () => openEnrolled(state.sectionId));
el("back-to-subject-from-enrolled").addEventListener("click", () => show(enrolledBackView));

// ---------- assignments ----------
async function openSection(sectionId) {
  state.sectionId = sectionId;
  state.assignmentId = null;
  const section = (await getDoc(doc(db, "sections", sectionId))).data();
  el("section-view-name").textContent = section.sectionName;

  // Preload the already-saved roster (if any) so it's editable right away,
  // instead of only being visible right after a fresh upload. Older
  // sections saved a plain string[] before gender tracking existed -
  // normalize those to {name, gender: ""} on load.
  rosterPreviewNames = (section.roster || []).map((r) => (typeof r === "string" ? { name: r, gender: "" } : r));
  el("roster-message").textContent = "";
  el("roster-preview").innerHTML = "";
  if (rosterPreviewNames.length > 0) renderRosterPreview();

  show("view-section");
  loadAssignments();
}

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
      <div class="muted">Allowed: ${a.allowedFileTypes} — ${a.totalPoints} points</div>
      <div style="margin-top:0.5rem;">
        <button data-open="${d.id}">Open submissions</button>
        <button class="danger" data-delete-assignment="${d.id}">Delete</button>
      </div>`;
    list.appendChild(row);
  });
  list.querySelectorAll("[data-open]").forEach((b) =>
    b.addEventListener("click", () => openAssignment(b.dataset.open)));
  list.querySelectorAll("[data-delete-assignment]").forEach((b) =>
    b.addEventListener("click", async () => {
      const ok = confirm(
        "Delete this assignment? This only removes the assignment itself - any submissions already made for it are NOT deleted and will become unreachable in this app. This can't be undone."
      );
      if (!ok) return;
      await deleteDoc(doc(db, "assignments", b.dataset.deleteAssignment));
      loadAssignments();
    }));
}

el("add-assignment-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  await addDoc(collection(db, "assignments"), {
    subjectId: state.subjectId,
    sectionId: state.sectionId,
    title: el("assignment-title").value.trim(),
    instructions: el("assignment-instructions").value.trim(),
    instructionsLink: el("assignment-instructions-link").value.trim(),
    component: el("assignment-component").value,
    dueDate: el("assignment-due").value,
    allowedFileTypes: el("assignment-filetype").value,
    totalPoints: Number(el("assignment-total-points").value) || 0,
    rubricReferenceLink: el("assignment-rubric-link").value.trim(),
    createdAt: Date.now(),
  });
  e.target.reset();
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
    const linkBlock = (s.photoPages && s.photoPages.length > 0)
      ? `<div class="photo-thumbs">${s.photoPages.map((p) => `<a href="${p}" target="_blank" rel="noopener"><img src="${p}" /></a>`).join("")}</div>`
      : s.photoData // legacy single-photo submissions made before multi-page support
        ? `<img src="${s.photoData}" class="photo-preview" />`
        : embedUrl
        ? `<iframe src="${embedUrl}" class="submission-preview"></iframe>
         <div class="muted"><a href="${s.link}" target="_blank" rel="noopener">open in new tab</a></div>`
        : `<div class="muted"><a href="${s.link}" target="_blank" rel="noopener">${s.link}</a></div>`;
    row.innerHTML = `
      <strong>${s.studentName}</strong>
      <span class="status-${s.status}"> — ${s.status}</span>
      ${linkBlock}
      <div id="detail-${d.id}"></div>
      <div style="margin-top:0.5rem;">
        ${AI_CHECK_ENABLED ? `<button data-ai="${d.id}">Run AI Check</button>` : ""}
        <button class="secondary" data-review="${d.id}">Review / Grade</button>
      </div>`;
    list.appendChild(row);
  });
  if (AI_CHECK_ENABLED) {
    list.querySelectorAll("[data-ai]").forEach((b) =>
      b.addEventListener("click", () => runAiCheck(b.dataset.ai)));
  }
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
      photoData: submission.photoData,
      rubric: assignment.rubric,
      linkType: assignment.allowedFileTypes,
      rubricReferenceLink: assignment.rubricReferenceLink,
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

  const draft = s.finalGrade || { score: "", feedback: "" };
  const rubricEmbedUrl = a.rubricReferenceLink ? toEmbedUrl(a.rubricReferenceLink) : null;
  const rubricBlock = a.rubricReferenceLink
    ? `<label>Your rubric (reference)</label>
       ${rubricEmbedUrl
         ? `<iframe src="${rubricEmbedUrl}" class="submission-preview"></iframe>`
         : `<div class="muted"><a href="${a.rubricReferenceLink}" target="_blank" rel="noopener">${a.rubricReferenceLink}</a></div>`}`
    : "";

  container.innerHTML = `
    <div class="card">
      ${rubricBlock}
      <label>Score (out of ${a.totalPoints})</label>
      <input type="number" id="score-${submissionId}" min="0" max="${a.totalPoints}" value="${draft.score ?? ""}" />
      <label>Feedback</label>
      <textarea id="feedback-${submissionId}" rows="3">${draft.feedback || ""}</textarea>
      <button data-publish="${submissionId}">Publish to student</button>
    </div>`;

  container.querySelector(`[data-publish]`).addEventListener("click", async () => {
    await updateDoc(ref, {
      finalGrade: {
        score: Number(el(`score-${submissionId}`).value) || 0,
        feedback: el(`feedback-${submissionId}`).value,
      },
      status: "published",
      publishedAt: Date.now(),
    });
    loadSubmissions();
  });
}

// ---------- roster (per-section, seeds the Records grid's rows) ----------
let rosterPreviewNames = [];

// DepEd names are "Surname, First Name M.I." - the comma is part of the
// name, not a separator, so this only splits on newlines (pasting a Class
// Record's name column gives one line per cell anyway). A pasted MALE/
// FEMALE section label tags every name after it with that gender, until
// the next label - matches a real Class Record's layout exactly, so no
// separate gender input is needed. Also strips a leading row number
// ("1 " / "1.") that comes along for free when copy-pasting from a sheet.
const ROSTER_JUNK_LINES = new Set(["name", "names"]);
function addRosterNames(text) {
  let currentGender = "";
  const candidates = [];
  for (const rawLine of text.split(/\n/)) {
    const line = rawLine.replace(/^\s*\d+[.)]?\s+/, "").trim();
    if (!line) continue;
    const lower = line.toLowerCase();
    if (lower === "male" || lower === "female") {
      currentGender = lower === "male" ? "Male" : "Female";
      continue;
    }
    if (ROSTER_JUNK_LINES.has(lower)) continue;
    candidates.push({ name: line, gender: currentGender });
  }
  const seen = new Set(rosterPreviewNames.map((r) => r.name.toLowerCase()));
  for (const c of candidates) {
    const key = c.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rosterPreviewNames.push(c);
  }
  renderRosterPreview();
}
el("roster-add-manual").addEventListener("click", () => {
  const textarea = el("roster-manual-names");
  addRosterNames(textarea.value);
  textarea.value = "";
});

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
    rosterPreviewNames = rows.map((r) => ({ name: r.name, gender: "" }));
    renderRosterPreview();
  } catch (err) {
    msg.textContent = err.message;
  }
});

function renderRosterPreview() {
  const container = el("roster-preview");
  const rows = rosterPreviewNames.map((r, i) => `
    <tr><td>${i + 1}</td><td>${r.name}</td><td>${r.gender || "—"}</td><td><button type="button" class="secondary" data-remove-name="${i}">Remove</button></td></tr>`).join("");

  container.innerHTML = `
    <p class="muted">${rosterPreviewNames.length} name(s) in the list. Remove any that aren't actual students, then save.</p>
    <table class="records-grid"><thead><tr><th>#</th><th>Name</th><th>Gender</th><th></th></tr></thead><tbody>${rows}</tbody></table>
    <button id="roster-save" style="margin-top:0.75rem;">Save Roster (${rosterPreviewNames.length})</button>`;

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
  const roster = (section.roster || []).map((r) => (typeof r === "string" ? { name: r, gender: "" } : r));

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

  // Group by component (Written Work / Performance Task) for the header,
  // in that order. Older assignments made before this field existed have
  // no component - they land in a fallback "Other" group instead of being
  // dropped.
  const COMPONENT_LABELS = { written: "Written Work", performance: "Performance Task" };
  const groups = ["written", "performance"]
    .map((key) => ({ key, label: COMPONENT_LABELS[key], assignments: assignments.filter((a) => a.component === key) }))
    .filter((g) => g.assignments.length > 0);
  const other = assignments.filter((a) => a.component !== "written" && a.component !== "performance");
  if (other.length > 0) groups.push({ key: "other", label: "Other", assignments: other });

  const orderedAssignments = groups.flatMap((g) => g.assignments);
  const groupHeaderCells = groups.map((g) => `<th colspan="${g.assignments.length}">${g.label}</th>`).join("");
  const titleHeaderCells = orderedAssignments.map((a) => `<th>${a.title}</th>`).join("");

  function renderStudentRow(r) {
    const name = r.name;
    const enrollment = enrollments.find((en) => en.studentName.toLowerCase() === name.toLowerCase());
    const cells = orderedAssignments.map((a) => {
      if (!enrollment) return `<td class="muted">Not joined</td>`;
      const sub = submissionsByAssignment[a.id].get(enrollment.studentUID);
      if (!sub) return `<td class="muted">No submission</td>`;
      if (sub.status === "published") {
        return `<td>${sub.finalGrade?.score ?? 0}/${a.totalPoints}</td>`;
      }
      return `<td class="status-${sub.status}">${sub.status}</td>`;
    }).join("");
    return `<tr><td>${name}</td>${cells}</tr>`;
  }

  // Group rows by gender (matches the real Class Record's MALE/FEMALE
  // blocks) only when the roster actually has gender data - a roster
  // saved before gender tracking existed just renders flat, same as before.
  const genderGroups = ["Male", "Female"]
    .map((label) => ({ label, students: roster.filter((r) => r.gender === label) }))
    .filter((g) => g.students.length > 0);
  const ungendered = roster.filter((r) => r.gender !== "Male" && r.gender !== "Female");
  if (ungendered.length > 0) genderGroups.push({ label: "Other", students: ungendered });

  const bodyRows = genderGroups.length > 1
    ? genderGroups.map((g) => {
        const header = `<tr class="gender-group"><td colspan="${orderedAssignments.length + 1}">${g.label}</td></tr>`;
        return header + g.students.map(renderStudentRow).join("");
      }).join("")
    : roster.map(renderStudentRow).join("");

  container.innerHTML = `
    <table class="records-grid">
      <thead>
        <tr><th></th>${groupHeaderCells}</tr>
        <tr><th>Student</th>${titleHeaderCells}</tr>
      </thead>
      <tbody>${bodyRows}</tbody>
    </table>`;
}

// ---------- nav ----------
function show(viewId) {
  ["view-subjects", "view-subject", "view-enrolled", "view-section", "view-assignment", "view-records"].forEach((v) => {
    el(v).classList.toggle("hidden", v !== viewId);
  });
}
el("go-home").addEventListener("click", () => { show("view-subjects"); loadSubjects(); });
el("toggle-settings").addEventListener("click", () => el("settings-panel").classList.toggle("hidden"));
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
  if (AI_CHECK_ENABLED) {
    el("gemini-key").value = getGeminiKey();
  } else {
    el("toggle-settings").classList.add("hidden");
    const aiOption = el("submission-filter").querySelector('option[value="ai-drafted"]');
    if (aiOption) aiOption.hidden = true;
  }
  loadSubjects();
  show("view-subjects");
});
