import { db, ADMIN_EMAIL } from "./firebase-config.js";
import { guardPage, signOutUser } from "./auth.js";
import {
  collection, addDoc, doc, setDoc, updateDoc, deleteDoc, getDoc, getDocs, query, where,
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

const state = { subjectId: null, sectionId: null, assignmentId: null, subjectName: null, viewAsEmail: null };
let currentUser = null;

// Legacy (pre-multi-teacher) docs have no ownerEmail field at all - a plain
// where("ownerEmail","==",...) filter would silently exclude them forever,
// "losing" all of the admin's own pre-existing data the moment this ships,
// with no backfill run yet. The super admin's firestore.rules already grant
// unconditional list access (isSuperAdmin() doesn't depend on resource.data),
// so when viewing as themselves, query unfiltered and narrow to "mine or
// legacy" client-side instead - mirrors firestore.rules' isLegacyUnowned().
// Any other (granted) teacher never has legacy data, so always gets a
// strict server-side filter.
function ownedByViewAs(data) {
  return data.ownerEmail === state.viewAsEmail || (!("ownerEmail" in data) && state.viewAsEmail === ADMIN_EMAIL);
}
function ownerScopedQuery(collectionName, ...wheres) {
  return state.viewAsEmail === ADMIN_EMAIL
    ? query(collection(db, collectionName), ...wheres)
    : query(collection(db, collectionName), where("ownerEmail", "==", state.viewAsEmail), ...wheres);
}

function el(id) { return document.getElementById(id); }
function genJoinCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function joinLinkFor(joinCode) {
  return new URL(`student.html?code=${joinCode}`, location.href).href;
}

// Renders a QR entirely client-side (qrcodejs CDN global) - the join link
// never leaves the device, no external QR image API involved. The
// subject/section label is baked into the same canvas (not just a sibling
// <p>) so a tight screenshot or print crop of just the code still
// identifies which class it's for.
function renderSectionQR(sectionId, joinCode, label) {
  const container = el(`qr-${sectionId}`);
  if (!container) return;
  container.innerHTML = "";
  if (typeof QRCode === "undefined") {
    container.innerHTML = '<p class="muted">QR code library failed to load.</p>';
    return;
  }
  const qrHolder = document.createElement("div");
  new QRCode(qrHolder, {
    text: joinLinkFor(joinCode),
    width: 160,
    height: 160,
    correctLevel: QRCode.CorrectLevel.M,
  });
  const qrCanvas = qrHolder.querySelector("canvas");
  if (!qrCanvas) {
    // Very old browser - qrcodejs fell back to a <table> instead of
    // canvas. Show the plain QR, skip the baked-in label rather than crash.
    container.appendChild(qrHolder);
    return;
  }
  const labelHeight = 34;
  const composite = document.createElement("canvas");
  composite.width = 160;
  composite.height = 160 + labelHeight;
  const ctx = composite.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, composite.width, composite.height);
  ctx.fillStyle = "#002045";
  ctx.textAlign = "center";
  // Canvas text ignores the page's custom @font-face fonts unless loaded
  // via document.fonts first - not worth the complexity for a small label.
  ctx.font = "bold 13px Arial, sans-serif";
  ctx.fillText(label, composite.width / 2, 16, 150);
  ctx.font = "11px Arial, sans-serif";
  ctx.fillText("Scan to join", composite.width / 2, 30, 150);
  ctx.drawImage(qrCanvas, 0, labelHeight);
  container.appendChild(composite);
}

// ---------- cascade deletes ----------
// Firestore has no server-side cascade - deleting a subject/section/
// assignment doc used to leave everything under it orphaned but still
// fully queryable (a deliberate simplification that stopped being
// tolerable once a deleted subject kept showing up on a student's
// dashboard). These walk the same parent->child chain the rest of the
// app already queries by (subjectId -> sectionId -> assignmentId).
// Both current callers (submissions, enrollments) have owner-gated read
// rules - an unfiltered query would be rejected outright for a non-admin
// teacher (Firestore can't prove ownership without an ownerEmail filter in
// the query itself), so this goes through ownerScopedQuery() like every
// other owner-gated read in this file.
async function deleteWhere(collectionName, field, value) {
  const snap = await getDocs(ownerScopedQuery(collectionName, where(field, "==", value)));
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
    getDocs(ownerScopedQuery("sections")),
    getDocs(ownerScopedQuery("assignments")),
    getDocs(ownerScopedQuery("submissions", where("status", "==", "pending"))),
  ]);
  const sectionToSubject = new Map(sectionsSnap.docs.map((d) => [d.id, d.data().subjectId]));
  const assignmentToSection = new Map(assignSnap.docs.map((d) => [d.id, d.data().sectionId]));

  const byAssignment = new Map();
  const bySection = new Map();
  const bySubject = new Map();
  subSnap.forEach((d) => {
    if (!ownedByViewAs(d.data())) return; // admin's unfiltered submissions query includes every teacher's - narrow to mine/legacy
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
    getDocs(ownerScopedQuery("sections")),
    getDocs(ownerScopedQuery("enrollments", where("leaveRequested", "==", true))),
  ]);
  const sectionToSubject = new Map(sectionsSnap.docs.map((d) => [d.id, d.data().subjectId]));

  const bySection = new Map();
  const bySubject = new Map();
  enrollSnap.forEach((d) => {
    if (!ownedByViewAs(d.data())) return; // admin's unfiltered enrollments query includes every teacher's - narrow to mine/legacy
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
    getDocs(ownerScopedQuery("subjects")),
    getDocs(ownerScopedQuery("sections")),
    getDocs(ownerScopedQuery("assignments")),
    getDocs(ownerScopedQuery("submissions", where("status", "==", "pending"))),
    getDocs(ownerScopedQuery("enrollments", where("leaveRequested", "==", true))),
  ]);

  const subjectNames = new Map(subjectsSnap.docs.map((d) => [d.id, d.data().name]));
  const sections = new Map(sectionsSnap.docs.map((d) => [d.id, d.data()]));
  const assignments = new Map(assignSnap.docs.map((d) => [d.id, d.data()]));

  const submissionCounts = new Map();
  pendingSnap.forEach((d) => {
    if (!ownedByViewAs(d.data())) return; // admin's unfiltered submissions query includes every teacher's - narrow to mine/legacy
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
    if (!ownedByViewAs(d.data())) return; // admin's unfiltered enrollments query includes every teacher's - narrow to mine/legacy
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
  // The same Google account can be enrolled under two different teachers -
  // owner-scope this too, or fixing a garbled name under one teacher would
  // silently rewrite it in another teacher's classes as well.
  const [enrollSnap, subSnap] = await Promise.all([
    getDocs(ownerScopedQuery("enrollments", where("studentUID", "==", studentUID))),
    getDocs(ownerScopedQuery("submissions", where("studentUID", "==", studentUID))),
  ]);
  await Promise.all([
    ...enrollSnap.docs.filter((d) => ownedByViewAs(d.data())).map((d) => updateDoc(d.ref, { studentName: newName })),
    ...subSnap.docs.filter((d) => ownedByViewAs(d.data())).map((d) => updateDoc(d.ref, { studentName: newName })),
  ]);
}

// ---------- subjects ----------
async function loadSubjects() {
  const showArchived = el("toggle-archived").checked;
  const [snap, counts, leaveCounts] = await Promise.all([getDocs(ownerScopedQuery("subjects")), getPendingCounts(), getLeaveRequestCounts()]);
  const list = el("subjects-list");
  list.innerHTML = "";
  snap.forEach((d) => {
    const s = d.data();
    if (!ownedByViewAs(s)) return; // admin's unfiltered subjects query includes every teacher's - narrow to mine/legacy
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
    ownerEmail: state.viewAsEmail,
    ownerName: currentUser.displayName || currentUser.email,
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
  state.subjectName = subject.name;
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
          <p class="muted" style="margin:0 0 0.35rem;"><strong>${state.subjectName || "—"}</strong> — ${s.sectionName}</p>
          <div id="qr-${d.id}" class="qr-code"></div>
          <p class="muted">Scan to join, or share this link:<br>
            <a href="${joinLinkFor(s.joinCode)}" target="_blank" rel="noopener">${joinLinkFor(s.joinCode)}</a></p>
          <p class="muted" style="font-size:0.85em;">Tip for students: after scanning, tap "Open in Safari/Chrome" on the banner that pops up — don't use the in-scanner preview, sign-in won't work there.</p>
        </div>
      </details>`;
    list.appendChild(row);
    renderSectionQR(d.id, s.joinCode, `${state.subjectName || "—"} — ${s.sectionName}`);
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
    ownerEmail: state.viewAsEmail,
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
    ownerScopedQuery("enrollments", where("sectionId", "in", sectionIds.slice(0, 30)))
  );
  const rows = enrollSnap.docs
    .filter((d) => ownedByViewAs(d.data()))
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
      refreshNotifications();
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
    ownerEmail: state.viewAsEmail,
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

// A per-assignment gallery of every submitted photo (photoPages, or the
// legacy single photoData), with a one-click "download everything as one
// ZIP" button - all client-side (JSZip CDN), no Storage involved, since
// the images already live inline on the submission docs.
function renderImagesGallery(submissions, assignmentTitle) {
  const container = el("images-gallery");
  const withPhotos = submissions
    .map((s) => ({ name: s.studentName, photos: s.photoPages?.length ? s.photoPages : s.photoData ? [s.photoData] : [] }))
    .filter((s) => s.photos.length > 0);
  if (withPhotos.length === 0) {
    container.innerHTML = "";
    return;
  }
  const total = withPhotos.reduce((sum, s) => sum + s.photos.length, 0);
  container.innerHTML = `
    <details class="card">
      <summary><strong>Photo submissions</strong> (${total} image${total > 1 ? "s" : ""} from ${withPhotos.length} student${withPhotos.length > 1 ? "s" : ""})</summary>
      <div style="margin-top:0.75rem;">
        <button type="button" id="download-all-photos">Download all as ZIP</button>
        <div class="photo-thumbs" style="margin-top:0.75rem;">
          ${withPhotos.map((s) => s.photos.map((p, i) =>
            `<a href="${p}" target="_blank" rel="noopener" title="${s.name} - page ${i + 1}"><img src="${p}" /></a>`
          ).join("")).join("")}
        </div>
      </div>
    </details>`;
  el("download-all-photos").addEventListener("click", async (e) => {
    e.target.disabled = true;
    e.target.textContent = "Zipping...";
    try {
      const zip = new JSZip();
      withPhotos.forEach((s) => {
        const safeName = s.name.replace(/[/\\:*?"<>|]/g, "-");
        s.photos.forEach((p, i) => {
          const base64 = p.split(",")[1];
          zip.file(`${safeName}-page${i + 1}.jpg`, base64, { base64: true });
        });
      });
      const blob = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${assignmentTitle.replace(/[/\\:*?"<>|]/g, "-")}-photos.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      alert("Couldn't build the ZIP: " + err.message);
    }
    e.target.disabled = false;
    e.target.textContent = "Download all as ZIP";
  });
}

async function loadSubmissions() {
  const filter = el("submission-filter").value;
  const q = ownerScopedQuery("submissions", where("assignmentId", "==", state.assignmentId));
  const [snap, aDoc] = await Promise.all([getDocs(q), getDoc(doc(db, "assignments", state.assignmentId))]);
  const ownedDocs = snap.docs.filter((d) => ownedByViewAs(d.data()));
  renderScoresSummary(ownedDocs.map((d) => d.data()), aDoc.data()?.totalPoints);
  renderImagesGallery(ownedDocs.map((d) => d.data()), aDoc.data()?.title || "submissions");
  const list = el("submissions-list");
  list.innerHTML = "";
  ownedDocs.forEach((d) => {
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
    refreshNotifications();
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

  const enrollSnap = await getDocs(ownerScopedQuery("enrollments", where("sectionId", "==", state.sectionId)));
  const enrollments = enrollSnap.docs.filter((d) => ownedByViewAs(d.data())).map((d) => d.data());

  const submissionsByAssignment = {};
  for (const a of assignments) {
    const subSnap = await getDocs(ownerScopedQuery("submissions", where("assignmentId", "==", a.id)));
    const byStudent = new Map();
    subSnap.forEach((d) => { if (ownedByViewAs(d.data())) byStudent.set(d.data().studentUID, d.data()); });
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

// ---------- admin: teacher accounts (super admin only, see firestore.rules) ----------
async function loadTeachers() {
  const snap = await getDocs(collection(db, "teachers"));
  const rows = snap.docs.map((d) => d.data()).sort((a, b) => a.email.localeCompare(b.email));
  const container = el("teachers-list");
  container.innerHTML = rows.length
    ? `<table class="records-grid"><thead><tr><th>Email</th><th></th></tr></thead><tbody>
        ${rows.map((t) => `<tr><td>${t.email}</td><td>
          <button class="danger icon" data-remove-teacher="${t.email}" title="Remove" aria-label="Remove teacher access">×</button>
        </td></tr>`).join("")}
      </tbody></table>`
    : '<p class="muted">No other teachers added yet.</p>';

  container.querySelectorAll("[data-remove-teacher]").forEach((b) =>
    b.addEventListener("click", async () => {
      const email = b.dataset.removeTeacher;
      const ok = confirm(`Remove ${email}'s teacher access? Their existing classes stay intact, just no longer editable by them.`);
      if (!ok) return;
      b.disabled = true;
      await deleteDoc(doc(db, "teachers", email));
      loadTeachers();
      renderViewAsPicker();
    }));
}

el("add-teacher-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = el("add-teacher-email").value.trim().toLowerCase();
  if (!email) return;
  await setDoc(doc(db, "teachers", email), {
    email,
    addedAt: Date.now(),
    addedBy: currentUser.email,
  });
  e.target.reset();
  loadTeachers();
  renderViewAsPicker();
});

// ---------- admin: "view as" picker (super admin only) ----------
async function renderViewAsPicker() {
  const picker = el("view-as-picker");
  const snap = await getDocs(collection(db, "teachers"));
  const emails = snap.docs.map((d) => d.data().email).sort();
  picker.innerHTML =
    `<option value="${ADMIN_EMAIL}">My Classes</option>` +
    emails.map((email) => `<option value="${email}">View as: ${email}</option>`).join("");
  picker.value = state.viewAsEmail;
  picker.classList.remove("hidden");
}

el("view-as-picker").addEventListener("change", (e) => {
  state.viewAsEmail = e.target.value;
  show("view-subjects");
  loadSubjects();
  refreshNotifications();
});

// ---------- init ----------
guardPage("teacher").then((user) => {
  if (!user) return;
  currentUser = user;
  state.viewAsEmail = user.email;
  el("teacher-email").textContent = user.email;
  const isAdmin = user.email === ADMIN_EMAIL;
  if (AI_CHECK_ENABLED) {
    el("gemini-key").value = getGeminiKey();
  } else {
    const aiOption = el("submission-filter").querySelector('option[value="ai-drafted"]');
    if (aiOption) aiOption.hidden = true;
  }
  // The Settings button used to only gate the (now-hidden) Gemini key box,
  // so it hid itself whenever AI_CHECK_ENABLED was off. It's also the entry
  // point to teacher-account management now, so the super admin always
  // keeps it, regardless of that flag.
  if (!AI_CHECK_ENABLED && !isAdmin) {
    el("toggle-settings").classList.add("hidden");
  }
  if (isAdmin) {
    el("admin-teachers-section").classList.remove("hidden");
    loadTeachers();
    renderViewAsPicker();
  }
  loadSubjects();
  refreshNotifications();
  show("view-subjects");
});
