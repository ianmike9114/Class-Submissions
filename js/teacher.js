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

function joinLinkFor(joinCode) {
  return new URL(`student.html?code=${joinCode}`, location.href).href;
}

// Renders a QR entirely client-side (qrcodejs CDN global) - the join link
// never leaves the device, no external QR image API involved.
function renderSectionQR(sectionId, joinCode) {
  const container = el(`qr-${sectionId}`);
  if (!container) return;
  container.innerHTML = "";
  if (typeof QRCode === "undefined") {
    container.innerHTML = '<p class="muted">QR code library failed to load.</p>';
    return;
  }
  new QRCode(container, {
    text: joinLinkFor(joinCode),
    width: 160,
    height: 160,
    correctLevel: QRCode.CorrectLevel.M,
  });
}

// ---------- cascade deletes ----------
// Firestore has no server-side cascade - deleting a subject/section/
// assignment doc used to leave everything under it orphaned but still
// fully queryable (a deliberate simplification that stopped being
// tolerable once a deleted subject kept showing up on a student's
// dashboard). These walk the same parent->child chain the rest of the
// app already queries by (subjectId -> sectionId -> assignmentId).
async function deleteWhere(collectionName, field, value) {
  const snap = await getDocs(query(collection(db, collectionName), where(field, "==", value)));
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
}

async function cascadeDeleteAssignment(assignmentId) {
  await deleteWhere("submissions", "assignmentId", assignmentId);
  await deleteDoc(doc(db, "assignments", assignmentId));
}

async function cascadeDeleteSection(sectionId) {
  const assignSnap = await getDocs(query(collection(db, "assignments"), where("sectionId", "==", sectionId)));
  await Promise.all(assignSnap.docs.map((d) => cascadeDeleteAssignment(d.id)));
  await deleteWhere("enrollments", "sectionId", sectionId);
  await deleteDoc(doc(db, "sections", sectionId));
}

async function cascadeDeleteSubject(subjectId) {
  const sectionSnap = await getDocs(query(collection(db, "sections"), where("subjectId", "==", subjectId)));
  await Promise.all(sectionSnap.docs.map((d) => cascadeDeleteSection(d.id)));
  await deleteDoc(doc(db, "subjects", subjectId));
}

// ---------- pending-submission counts (the "who's submitting" badge) ----------
// One pass over every section/assignment (cheap at solo-teacher scale) plus
// one query for pending submissions, rolled up to all three levels at once
// so subject/section/assignment cards can each show their own count without
// separate nested queries per card.
async function getPendingCounts() {
  const [sectionsSnap, assignSnap, subSnap] = await Promise.all([
    getDocs(collection(db, "sections")),
    getDocs(collection(db, "assignments")),
    getDocs(query(collection(db, "submissions"), where("status", "==", "pending"))),
  ]);
  const sectionToSubject = new Map(sectionsSnap.docs.map((d) => [d.id, d.data().subjectId]));
  const assignmentToSection = new Map(assignSnap.docs.map((d) => [d.id, d.data().sectionId]));

  const byAssignment = new Map();
  const bySection = new Map();
  const bySubject = new Map();
  subSnap.forEach((d) => {
    const assignmentId = d.data().assignmentId;
    const sectionId = assignmentToSection.get(assignmentId);
    const subjectId = sectionToSubject.get(sectionId);
    byAssignment.set(assignmentId, (byAssignment.get(assignmentId) || 0) + 1);
    if (sectionId) bySection.set(sectionId, (bySection.get(sectionId) || 0) + 1);
    if (subjectId) bySubject.set(subjectId, (bySubject.get(subjectId) || 0) + 1);
  });
  return { byAssignment, bySection, bySubject };
}

function pendingBadge(count) {
  return count ? `<span class="status-pending"> — ${count} pending</span>` : "";
}

// ---------- leave-request counts (mirrors getPendingCounts()/pendingBadge() above) ----------
async function getLeaveRequestCounts() {
  const [sectionsSnap, enrollSnap] = await Promise.all([
    getDocs(collection(db, "sections")),
    getDocs(query(collection(db, "enrollments"), where("leaveRequested", "==", true))),
  ]);
  const sectionToSubject = new Map(sectionsSnap.docs.map((d) => [d.id, d.data().subjectId]));

  const bySection = new Map();
  const bySubject = new Map();
  enrollSnap.forEach((d) => {
    const sectionId = d.data().sectionId;
    const subjectId = sectionToSubject.get(sectionId);
    bySection.set(sectionId, (bySection.get(sectionId) || 0) + 1);
    if (subjectId) bySubject.set(subjectId, (bySubject.get(subjectId) || 0) + 1);
  });
  return { bySection, bySubject };
}

function leaveBadge(count) {
  return count ? `<span class="status-pending"> — ${count} leave request${count > 1 ? "s" : ""}</span>` : "";
}

let lastNotifications = { submissions: [], leaves: [], totalCount: 0, error: false };

// One combined fetch that resolves ids to display names (unlike
// getPendingCounts()/getLeaveRequestCounts() above, which only need ids
// because they're rendered inside a view that already has that context)
// - this powers the header-wide notification dropdown, which has no
// surrounding context of its own.
async function getNotifications() {
  const [subjectsSnap, sectionsSnap, assignSnap, pendingSnap, leaveSnap] = await Promise.all([
    getDocs(collection(db, "subjects")),
    getDocs(collection(db, "sections")),
    getDocs(collection(db, "assignments")),
    getDocs(query(collection(db, "submissions"), where("status", "==", "pending"))),
    getDocs(query(collection(db, "enrollments"), where("leaveRequested", "==", true))),
  ]);

  const subjectNames = new Map(subjectsSnap.docs.map((d) => [d.id, d.data().name]));
  const sections = new Map(sectionsSnap.docs.map((d) => [d.id, d.data()]));
  const assignments = new Map(assignSnap.docs.map((d) => [d.id, d.data()]));

  const submissionCounts = new Map();
  pendingSnap.forEach((d) => {
    const assignmentId = d.data().assignmentId;
    submissionCounts.set(assignmentId, (submissionCounts.get(assignmentId) || 0) + 1);
  });
  const submissions = [...submissionCounts.entries()].map(([assignmentId, count]) => {
    const a = assignments.get(assignmentId) || {};
    const section = sections.get(a.sectionId) || {};
    return {
      assignmentId,
      sectionId: a.sectionId,
      subjectId: section.subjectId,
      title: a.title || "(deleted assignment)",
      sectionName: section.sectionName || "(deleted section)",
      subjectName: subjectNames.get(section.subjectId) || "(deleted subject)",
      count,
    };
  });

  const leaveCounts = new Map();
  leaveSnap.forEach((d) => {
    const sectionId = d.data().sectionId;
    leaveCounts.set(sectionId, (leaveCounts.get(sectionId) || 0) + 1);
  });
  const leaves = [...leaveCounts.entries()].map(([sectionId, count]) => {
    const section = sections.get(sectionId) || {};
    return {
      sectionId,
      subjectId: section.subjectId,
      sectionName: section.sectionName || "(deleted section)",
      subjectName: subjectNames.get(section.subjectId) || "(deleted subject)",
      count,
    };
  });

  const totalCount =
    submissions.reduce((sum, s) => sum + s.count, 0) +
    leaves.reduce((sum, l) => sum + l.count, 0);

  return { submissions, leaves, totalCount };
}

async function refreshNotifications() {
  try {
    const data = await getNotifications();
    lastNotifications = { ...data, error: false };
  } catch (err) {
    lastNotifications = { ...lastNotifications, error: true };
  }
  const countEl = el("notif-count");
  countEl.textContent = lastNotifications.totalCount;
  countEl.classList.toggle("hidden", lastNotifications.totalCount === 0);
}

function closeNotifDropdown() {
  el("notif-dropdown").classList.add("hidden");
}

function renderNotifDropdown() {
  const { submissions, leaves, error } = lastNotifications;
  const dropdown = el("notif-dropdown");

  if (error) {
    dropdown.innerHTML = '<p class="muted" style="padding:0.5rem 0.75rem;">Couldn\'t load notifications.</p>';
    return;
  }
  if (submissions.length === 0 && leaves.length === 0) {
    dropdown.innerHTML = '<p class="muted" style="padding:0.5rem 0.75rem;">You\'re all caught up.</p>';
    return;
  }

  const submissionRows = submissions.map((s) => `
    <button class="notif-item" data-goto-assignment="${s.subjectId}|${s.sectionId}|${s.assignmentId}">
      ${s.title} <span class="muted">(${s.subjectName} &rsaquo; ${s.sectionName})</span> — ${s.count} pending
    </button>`).join("");
  const leaveRows = leaves.map((l) => `
    <button class="notif-item" data-goto-leave="${l.subjectId}|${l.sectionId}">
      ${l.subjectName} &rsaquo; ${l.sectionName} — ${l.count} leave request${l.count > 1 ? "s" : ""}
    </button>`).join("");

  dropdown.innerHTML =
    (submissions.length ? `<div class="notif-group-label">Pending submissions</div>${submissionRows}` : "") +
    (leaves.length ? `<div class="notif-group-label">Leave requests</div>${leaveRows}` : "");

  dropdown.querySelectorAll("[data-goto-assignment]").forEach((b) =>
    b.addEventListener("click", () => {
      const [subjectId, sectionId, assignmentId] = b.dataset.gotoAssignment.split("|");
      goToAssignment(subjectId, sectionId, assignmentId);
    }));
  dropdown.querySelectorAll("[data-goto-leave]").forEach((b) =>
    b.addEventListener("click", () => {
      const [subjectId, sectionId] = b.dataset.gotoLeave.split("|");
      goToLeaveRequests(subjectId, sectionId);
    }));
}

el("notif-bell").addEventListener("click", async (e) => {
  e.stopPropagation();
  const dropdown = el("notif-dropdown");
  if (!dropdown.classList.contains("hidden")) {
    closeNotifDropdown();
    return;
  }
  await refreshNotifications();
  renderNotifDropdown();
  dropdown.classList.remove("hidden");
});

document.addEventListener("click", (e) => {
  if (!e.target.closest("#notif-bell, #notif-dropdown")) closeNotifDropdown();
});

async function goToAssignment(subjectId, sectionId, assignmentId) {
  closeNotifDropdown();
  await openSubject(subjectId);
  await openSection(sectionId);
  await openAssignment(assignmentId);
}

async function goToLeaveRequests(subjectId, sectionId) {
  closeNotifDropdown();
  await openSubject(subjectId);
  await openSection(sectionId);
  await openEnrolled(sectionId);
}

// A student's display name is cached on every submission at submit time
// (not looked up live from their enrollment), so fixing a garbled Google
// name has to touch both: every enrollment AND every submission for that
// studentUID, or old submission cards/scores summaries would keep showing
// the stale name forever.
async function renameStudentEverywhere(studentUID, newName) {
  const [enrollSnap, subSnap] = await Promise.all([
    getDocs(query(collection(db, "enrollments"), where("studentUID", "==", studentUID))),
    getDocs(query(collection(db, "submissions"), where("studentUID", "==", studentUID))),
  ]);
  await Promise.all([
    ...enrollSnap.docs.map((d) => updateDoc(d.ref, { studentName: newName })),
    ...subSnap.docs.map((d) => updateDoc(d.ref, { studentName: newName })),
  ]);
}

// ---------- subjects ----------
async function loadSubjects() {
  const showArchived = el("toggle-archived").checked;
  const [snap, counts, leaveCounts] = await Promise.all([getDocs(collection(db, "subjects")), getPendingCounts(), getLeaveRequestCounts()]);
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
      ${pendingBadge(counts.bySubject.get(d.id))}
      ${leaveBadge(leaveCounts.bySubject.get(d.id))}
      ${s.archived ? '<span class="muted"> — archived</span>' : ""}
      <div id="year-term-edit-${d.id}"></div>
      <div style="margin-top:0.5rem;">
        <button data-open="${d.id}">Open</button>
        <button class="secondary" data-edit-year="${d.id}">Edit Year/Term</button>
        <button class="secondary" data-archive="${d.id}" data-value="${!s.archived}">
          ${s.archived ? "Unarchive" : "Archive"}
        </button>
        <button class="danger icon" data-delete-subject="${d.id}" title="Delete subject" aria-label="Delete subject">×</button>
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
        "Delete this subject? This also deletes every section, assignment, submission, and enrollment under it. If you just want it out of the way but might need it later, use Archive instead. This can't be undone."
      );
      if (!ok) return;
      b.disabled = true;
      await cascadeDeleteSubject(b.dataset.deleteSubject);
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
  const [snap, counts, leaveCounts] = await Promise.all([getDocs(q), getPendingCounts(), getLeaveRequestCounts()]);
  const list = el("sections-list");
  list.innerHTML = "";
  snap.forEach((d) => {
    const s = d.data();
    const row = document.createElement("div");
    row.className = "card";
    row.innerHTML = `
      <strong id="section-name-${d.id}">${s.sectionName}</strong>
      <span class="muted"> — join code: <code>${s.joinCode}</code></span>
      ${pendingBadge(counts.bySection.get(d.id))}
      ${leaveBadge(leaveCounts.bySection.get(d.id))}
      <div id="section-edit-${d.id}"></div>
      <div style="margin-top:0.5rem;">
        <button data-open="${d.id}">Open</button>
        <button class="secondary" data-edit-section="${d.id}">Edit name</button>
        <button class="danger icon" data-delete-section="${d.id}" title="Delete section" aria-label="Delete section">×</button>
      </div>
      <details style="margin-top:0.5rem;">
        <summary class="muted" style="cursor:pointer;">Show QR</summary>
        <div style="margin-top:0.5rem;">
          <div id="qr-${d.id}" class="qr-code"></div>
          <p class="muted">Scan to join, or share this link:<br>
            <a href="${joinLinkFor(s.joinCode)}" target="_blank" rel="noopener">${joinLinkFor(s.joinCode)}</a></p>
        </div>
      </details>`;
    list.appendChild(row);
    renderSectionQR(d.id, s.joinCode);
  });
  list.querySelectorAll("[data-open]").forEach((b) =>
    b.addEventListener("click", () => openSection(b.dataset.open)));
  list.querySelectorAll("[data-edit-section]").forEach((b) =>
    b.addEventListener("click", () => editSectionName(b.dataset.editSection)));
  list.querySelectorAll("[data-delete-section]").forEach((b) =>
    b.addEventListener("click", async () => {
      const ok = confirm(
        "Delete this section? This also deletes every assignment, submission, and enrollment under it. This can't be undone."
      );
      if (!ok) return;
      b.disabled = true;
      await cascadeDeleteSection(b.dataset.deleteSection);
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
    ? `<table class="records-grid"><thead><tr><th>#</th><th>Name</th><th>Gmail</th><th>Section</th><th></th></tr></thead><tbody>
        ${rows.map((r, i) => `<tr><td>${i + 1}</td><td id="enroll-name-${r.id}">${r.studentName}${r.leaveRequested ? ' <span class="status-pending">(leave requested)</span>' : ""}</td><td>${r.studentEmail || ""}</td><td>${sectionMap.get(r.sectionId) || ""}</td><td>
          <button class="secondary" data-edit-enrollment="${r.id}" data-uid="${r.studentUID}">Edit name</button>
          <button class="danger icon" data-remove-enrollment="${r.id}" data-leave-requested="${!!r.leaveRequested}" title="Remove" aria-label="Remove enrollment">×</button>
        </td></tr>`).join("")}
      </tbody></table>`
    : '<p class="muted">No students enrolled yet.</p>';

  // Fixes a garbled/raw Google display name (common when a section had no
  // roster to pick from at join time) without needing the student to
  // rejoin - renameStudentEverywhere() also updates that student's
  // existing submissions, not just this one enrollment doc, so their
  // corrected name shows consistently everywhere.
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
          await renameStudentEverywhere(b.dataset.uid, name);
        }
        openEnrolled(onlySectionId);
      };
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") save(); });
      input.addEventListener("blur", save);
    }));

  list.querySelectorAll("[data-remove-enrollment]").forEach((b) =>
    b.addEventListener("click", async () => {
      const wasRequested = b.dataset.leaveRequested === "true";
      const msg = wasRequested
        ? "Remove this student's enrollment? They requested to leave this class. This frees their roster name for someone else to claim, and they'd need to join again with the code."
        : "Remove this student's enrollment? This frees their roster name for someone else to claim, and they'd need to join again with the code.";
      const ok = confirm(msg);
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

function renderActivitiesSummary(assignments) {
  const container = el("activities-summary");
  if (assignments.length === 0) {
    container.innerHTML = "";
    return;
  }
  const groups = [
    ["Written Work", assignments.filter((a) => a.component === "written")],
    ["Performance Task", assignments.filter((a) => a.component === "performance")],
  ];
  const rows = groups
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => `
      <tr class="gender-group"><td colspan="3">${label}</td></tr>
      ${items.map((a) => `
        <tr>
          <td>${a.title}</td>
          <td>${a.totalPoints}</td>
          <td>${a.dueDate || "—"}</td>
        </tr>`).join("")}`)
    .join("");
  container.innerHTML = `
    <details class="card">
      <summary><strong>Activities overview (${assignments.length})</strong></summary>
      <table class="records-grid" style="margin-top:0.75rem;">
        <thead><tr><th>Title</th><th>Points</th><th>Due</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </details>`;
}

async function loadAssignments() {
  const q = query(collection(db, "assignments"), where("sectionId", "==", state.sectionId));
  const [snap, counts] = await Promise.all([getDocs(q), getPendingCounts()]);
  renderActivitiesSummary(snap.docs.map((d) => d.data()));
  const list = el("assignments-list");
  list.innerHTML = "";
  snap.forEach((d) => {
    const a = d.data();
    const row = document.createElement("div");
    row.className = "card";
    row.innerHTML = `
      <strong>${a.title}</strong> <span class="muted">due ${a.dueDate || "no date"}</span>
      ${pendingBadge(counts.byAssignment.get(d.id))}
      ${a.instructions ? `<p class="muted">${a.instructions}</p>` : ""}
      ${a.instructionsLink ? `<div class="muted"><a href="${a.instructionsLink}" target="_blank" rel="noopener">Instructions file</a></div>` : ""}
      <div class="muted">Allowed: ${a.allowedFileTypes} — ${a.totalPoints} points</div>
      <div style="margin-top:0.5rem;">
        <button data-open="${d.id}">Open submissions</button>
        <button class="danger icon" data-delete-assignment="${d.id}" title="Delete assignment" aria-label="Delete assignment">×</button>
      </div>`;
    list.appendChild(row);
  });
  list.querySelectorAll("[data-open]").forEach((b) =>
    b.addEventListener("click", () => openAssignment(b.dataset.open)));
  list.querySelectorAll("[data-delete-assignment]").forEach((b) =>
    b.addEventListener("click", async () => {
      const ok = confirm(
        "Delete this assignment? This also deletes every submission already made for it. This can't be undone."
      );
      if (!ok) return;
      b.disabled = true;
      await cascadeDeleteAssignment(b.dataset.deleteAssignment);
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
function renderAssignmentContext(a) {
  const container = el("assignment-context");
  const instructionsEmbed = a.instructionsLink ? toEmbedUrl(a.instructionsLink) : null;
  const rubricEmbed = a.rubricReferenceLink ? toEmbedUrl(a.rubricReferenceLink) : null;
  const nothingToShow = !a.instructions && !a.instructionsLink && !a.rubricReferenceLink;
  container.innerHTML = `
    <details class="card">
      <summary><strong>Instructions &amp; rubric (reference)</strong></summary>
      <div style="margin-top:0.75rem;">
        ${nothingToShow ? '<p class="muted">No instructions or rubric reference set for this assignment.</p>' : ""}
        ${a.instructions ? `<p>${a.instructions}</p>` : ""}
        ${a.instructionsLink
          ? (instructionsEmbed
            ? `<iframe src="${instructionsEmbed}" class="submission-preview"></iframe>`
            : `<div class="muted"><a href="${a.instructionsLink}" target="_blank" rel="noopener">Instructions file</a></div>`)
          : ""}
        ${a.rubricReferenceLink ? `
          <label style="margin-top:0.75rem;">Rubric reference</label>
          ${rubricEmbed
            ? `<iframe src="${rubricEmbed}" class="submission-preview"></iframe>`
            : `<div class="muted"><a href="${a.rubricReferenceLink}" target="_blank" rel="noopener">${a.rubricReferenceLink}</a></div>`}` : ""}
      </div>
    </details>`;
}

async function openAssignment(assignmentId) {
  state.assignmentId = assignmentId;
  const a = await getDoc(doc(db, "assignments", assignmentId));
  el("assignment-view-title").textContent = a.data().title;
  renderAssignmentContext(a.data());
  show("view-assignment");
  loadSubmissions();
}

function renderScoresSummary(submissions, totalPoints) {
  const container = el("scores-summary");
  const graded = submissions
    .filter((s) => s.status === "published")
    .sort((a, b) => a.studentName.localeCompare(b.studentName));
  if (graded.length === 0) {
    container.innerHTML = "";
    return;
  }
  container.innerHTML = `
    <details class="card">
      <summary><strong>Scores summary (${graded.length} graded)</strong></summary>
      <table class="records-grid" style="margin-top:0.75rem;">
        <thead><tr><th>Name</th><th>Score</th></tr></thead>
        <tbody>${graded.map((s) => `<tr><td>${s.studentName}</td><td>${s.finalGrade?.score ?? "—"}/${totalPoints ?? "—"}</td></tr>`).join("")}</tbody>
      </table>
    </details>`;
}

async function loadSubmissions() {
  const filter = el("submission-filter").value;
  const q = query(collection(db, "submissions"), where("assignmentId", "==", state.assignmentId));
  const [snap, aDoc] = await Promise.all([getDocs(q), getDoc(doc(db, "assignments", state.assignmentId))]);
  renderScoresSummary(snap.docs.map((d) => d.data()), aDoc.data()?.totalPoints);
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
      <strong id="sub-name-${d.id}">${s.studentName}</strong>
      <button type="button" class="secondary" data-edit-sub-name="${d.id}" data-uid="${s.studentUID}" style="margin-left:0.4rem;">Edit name</button>
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

  // Fix a garbled name right while reviewing the work, instead of having to
  // go find the student in Enrolled Students first.
  list.querySelectorAll("[data-edit-sub-name]").forEach((b) =>
    b.addEventListener("click", () => {
      const submissionId = b.dataset.editSubName;
      const nameEl = el(`sub-name-${submissionId}`);
      const current = nameEl.textContent;
      nameEl.innerHTML = `<input id="edit-sub-name-input-${submissionId}" value="${current}" style="width:auto; display:inline-block; margin-bottom:0;" />`;
      const input = el(`edit-sub-name-input-${submissionId}`);
      input.focus();
      input.select();
      let saved = false;
      const save = async () => {
        if (saved) return;
        saved = true;
        const name = input.value.trim();
        if (name && name !== current) {
          await renameStudentEverywhere(b.dataset.uid, name);
        }
        loadSubmissions();
      };
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") save(); });
      input.addEventListener("blur", save);
    }));
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
  refreshNotifications();
  show("view-subjects");
});
