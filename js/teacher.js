import { db, ADMIN_EMAIL } from "./firebase-config.js";
import { guardPage, signOutUser } from "./auth.js";
import {
  collection, addDoc, doc, setDoc, updateDoc, deleteDoc, getDoc, getDocs, query, where, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getGeminiKey, setGeminiKey, runRubricCheck } from "./gemini.js";
import { toEmbedUrl, openInChromeButton, wireOpenInChromeButtons } from "./embed.js";
import { loadWorkbook } from "./class-record.js";
import {
  Document, Packer, Paragraph, TextRun, ImageRun, HeadingLevel, AlignmentType,
} from "https://cdn.jsdelivr.net/npm/docx@9.7.1/dist/index.mjs";

// AI rubric-check is hidden (not deleted) - per-call Gemini cost isn't
// worth it right now. Flip this back to true to restore the Run AI Check
// button, the Settings gear (only the Gemini key box lives there), and
// the "AI drafted" filter option. Note: runAiCheck() below still expects
// assignment.rubric (per-criterion), which assignments no longer have
// since grading switched to a single total-points score - re-enabling
// would need a small adapter first.
const AI_CHECK_ENABLED = false;

const state = { subjectId: null, sectionId: null, assignmentId: null, subjectName: null, subjectOwnerName: null, viewAsEmail: null };
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

// Names arrive with inconsistent casing depending on source (roster
// upload already uppercases on save, but the Google-account-name
// fallback and submissions.studentName don't) - normalize how they
// *display* everywhere, without touching the stored value.
function displayStudentName(name) { return (name || "").toUpperCase(); }

// Submitted photos are inline data: URLs (no Storage) - opening one with
// <a href target="_blank"> navigates the browser straight to a raw
// data:image/...;base64,... "page", which desktop and mobile browsers alike
// render unreliably (sometimes just the raw base64 text). Show it in-page
// instead. Wired once via event delegation (below) so any current or future
// [data-photo-src] thumbnail works without per-render rewiring.
function openPhotoLightbox(src, label) {
  const img = el("photo-lightbox-img");
  img.src = src;
  img.alt = label || "";
  el("photo-lightbox").classList.remove("hidden");
}
el("photo-lightbox-close").addEventListener("click", () => el("photo-lightbox").classList.add("hidden"));
el("photo-lightbox").addEventListener("click", (e) => {
  if (e.target.id === "photo-lightbox") el("photo-lightbox").classList.add("hidden");
});
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-photo-src]");
  if (btn) openPhotoLightbox(btn.dataset.photoSrc, btn.title);
});

// Cascade deletes (subject/section/assignment - each wipes everything
// nested under it, no undo) get a type-to-confirm instead of a plain OK/
// Cancel dialog, since an accidental double-tap can clear a confirm() but
// can't accidentally retype the exact name. Case-sensitive, exact match.
function confirmByTyping(message, name) {
  const typed = prompt(`${message}\n\nType the name exactly to confirm: "${name}"`);
  if (typed === null) return false; // cancelled
  if (typed.trim() !== name) {
    alert("That didn't match - nothing was deleted.");
    return false;
  }
  return true;
}

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

// ---------- pending invites (invite-by-email auto-join, mirrors getPendingCounts()/getLeaveRequestCounts() above) ----------
async function getPendingInvites() {
  const snap = await getDocs(ownerScopedQuery("invites"));
  const bySection = new Map();
  snap.forEach((d) => {
    if (!ownedByViewAs(d.data())) return; // admin's unfiltered invites query includes every teacher's - narrow to mine/legacy
    const sectionId = d.data().sectionId;
    if (!bySection.has(sectionId)) bySection.set(sectionId, []);
    bySection.get(sectionId).push({ id: d.id, ...d.data() });
  });
  return bySection;
}

// ---------- master lists (reusable name+email rosters, independent of any
// subject/section - see buildMasterListFromSection()/applyMasterListToSection()
// below) ----------
async function getMasterLists() {
  const snap = await getDocs(ownerScopedQuery("masterLists"));
  return snap.docs
    .filter((d) => ownedByViewAs(d.data()))
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Bulk-creates one invites doc per master-list student not already
// enrolled in or invited to this section (by lowercased email) - same
// doc shape as the one-at-a-time "Invite by email" form, just looped.
async function applyMasterListToSection(listId, sectionId, sectionName, pendingInvites) {
  const list = (await getDoc(doc(db, "masterLists", listId))).data();
  const enrollSnap = await getDocs(ownerScopedQuery("enrollments", where("sectionId", "==", sectionId)));
  const enrolledEmails = new Set(
    enrollSnap.docs.filter((d) => ownedByViewAs(d.data())).map((d) => (d.data().studentEmail || "").toLowerCase())
  );
  const invitedEmails = new Set(pendingInvites.map((inv) => (inv.studentEmail || "").toLowerCase()));

  const students = list.students || [];
  const toInvite = students.filter((s) => s.email && !enrolledEmails.has(s.email.toLowerCase()) && !invitedEmails.has(s.email.toLowerCase()));
  const skippedEnrolled = students.filter((s) => s.email && enrolledEmails.has(s.email.toLowerCase())).length;
  const skippedInvited = students.filter((s) => s.email && invitedEmails.has(s.email.toLowerCase())).length;

  await Promise.all(toInvite.map((student) => addDoc(collection(db, "invites"), {
    studentEmail: student.email.toLowerCase(),
    studentName: student.name,
    subjectId: state.subjectId,
    subjectName: state.subjectName,
    sectionId,
    sectionName,
    teacherName: state.subjectOwnerName,
    ownerEmail: state.viewAsEmail,
    createdAt: serverTimestamp(),
  })));

  return { invited: toInvite.length, skippedEnrolled, skippedInvited };
}

let lastNotifications = { submissions: [], leaves: [], totalCount: 0, error: false };

// One combined fetch that resolves ids to display names (unlike
// getPendingCounts()/getLeaveRequestCounts() above, which only need ids
// because they're rendered inside a view that already has that context)
// - this powers the header-wide notification dropdown, which has no
// surrounding context of its own.
async function getNotifications() {
  const [subjectsSnap, sectionsSnap, assignSnap, pendingSnap, leaveSnap, joinSnap] = await Promise.all([
    getDocs(ownerScopedQuery("subjects")),
    getDocs(ownerScopedQuery("sections")),
    getDocs(ownerScopedQuery("assignments")),
    getDocs(ownerScopedQuery("submissions", where("status", "==", "pending"))),
    getDocs(ownerScopedQuery("enrollments", where("leaveRequested", "==", true))),
    getDocs(ownerScopedQuery("enrollments", where("seen", "==", false))),
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

  // "Who joined" - grouped by section like leaves, but with names inline
  // (not just a count) since the whole point is knowing who, not just how
  // many. Marked seen (js/teacher.js renderNotifDropdown's click handler)
  // once the teacher's actually looked at the dropdown, not on every silent
  // background refresh - see the seen:false comment in js/student.js's
  // enroll() for why unseen is query-able with no backfill.
  const joinsBySection = new Map();
  joinSnap.forEach((d) => {
    if (!ownedByViewAs(d.data())) return; // admin's unfiltered enrollments query includes every teacher's - narrow to mine/legacy
    const data = d.data();
    if (!joinsBySection.has(data.sectionId)) joinsBySection.set(data.sectionId, []);
    joinsBySection.get(data.sectionId).push({ enrollmentId: d.id, studentName: data.studentName });
  });
  const joins = [...joinsBySection.entries()].map(([sectionId, students]) => {
    const section = sections.get(sectionId) || {};
    return {
      sectionId,
      subjectId: section.subjectId,
      sectionName: section.sectionName || "(deleted section)",
      subjectName: subjectNames.get(section.subjectId) || "(deleted subject)",
      students,
    };
  });

  const totalCount =
    submissions.reduce((sum, s) => sum + s.count, 0) +
    leaves.reduce((sum, l) => sum + l.count, 0) +
    joins.reduce((sum, j) => sum + j.students.length, 0);

  return { submissions, leaves, joins, totalCount };
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
  const { submissions, leaves, joins, error } = lastNotifications;
  const dropdown = el("notif-dropdown");

  if (error) {
    dropdown.innerHTML = '<p class="muted" style="padding:0.5rem 0.75rem;">Couldn\'t load notifications.</p>';
    return;
  }
  if (submissions.length === 0 && leaves.length === 0 && joins.length === 0) {
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
  const joinRows = joins.map((j) => `
    <button class="notif-item" data-goto-join="${j.subjectId}|${j.sectionId}">
      ${j.students.map((s) => displayStudentName(s.studentName)).join(", ")} joined <span class="muted">(${j.subjectName} &rsaquo; ${j.sectionName})</span>
    </button>`).join("");

  dropdown.innerHTML =
    (joins.length ? `<div class="notif-group-label">New joins</div>${joinRows}` : "") +
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
  dropdown.querySelectorAll("[data-goto-join]").forEach((b) =>
    b.addEventListener("click", () => {
      const [subjectId, sectionId] = b.dataset.gotoJoin.split("|");
      const j = joins.find((x) => x.sectionId === sectionId);
      goToNewJoins(subjectId, sectionId, j?.students.map((s) => s.enrollmentId) || []);
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

// Names are already visible right on the dropdown row (unlike pending
// submissions/leave requests, nothing further is "resolved" by looking),
// so clicking a joins row is itself the read receipt - stamp seen:true on
// the way to Enrolled Students rather than requiring a separate dismiss.
async function goToNewJoins(subjectId, sectionId, enrollmentIds) {
  closeNotifDropdown();
  await openSubject(subjectId);
  await openSection(sectionId);
  await openEnrolled(sectionId);
  await Promise.all(enrollmentIds.map((id) => updateDoc(doc(db, "enrollments", id), { seen: true })));
  refreshNotifications();
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
  const subjectNames = new Map(); // id -> name, for the delete-confirm prompt below
  snap.forEach((d) => {
    const s = d.data();
    if (!ownedByViewAs(s)) return; // admin's unfiltered subjects query includes every teacher's - narrow to mine/legacy
    subjectNames.set(d.id, s.name);
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
      const archiving = b.dataset.value === "true";
      await updateDoc(doc(db, "subjects", b.dataset.archive), { archived: archiving });
      alert(archiving ? "Archived." : "Unarchived.");
      loadSubjects();
    }));
  list.querySelectorAll("[data-delete-subject]").forEach((b) =>
    b.addEventListener("click", async () => {
      const ok = confirmByTyping(
        "Delete this subject? This also deletes every section, assignment, submission, and enrollment under it. If you just want it out of the way but might need it later, use Archive instead.",
        subjectNames.get(b.dataset.deleteSubject) || ""
      );
      if (!ok) return;
      b.disabled = true;
      await cascadeDeleteSubject(b.dataset.deleteSubject);
      alert("Deleted.");
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
    alert("Saved.");
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
  alert("Subject added.");
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
  state.subjectOwnerName = subject.ownerName || "—";
  el("subject-view-name").textContent = `${subject.name} (${subject.gradeLevel || "—"} — SY ${subject.schoolYear || "—"} · Term ${subject.term || "—"})`;
  show("view-subject");
  loadSections();
}

async function loadSections() {
  const q = query(collection(db, "sections"), where("subjectId", "==", state.subjectId));
  const [snap, counts, leaveCounts, invitesBySection, masterLists] = await Promise.all([
    getDocs(q), getPendingCounts(), getLeaveRequestCounts(), getPendingInvites(), getMasterLists(),
  ]);
  const list = el("sections-list");
  list.innerHTML = "";
  const sectionNames = new Map(); // id -> name, for the delete-confirm prompt below
  snap.forEach((d) => {
    const s = d.data();
    sectionNames.set(d.id, s.sectionName);
    const pendingInvites = invitesBySection.get(d.id) || [];
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
      </details>
      <details style="margin-top:0.5rem;">
        <summary class="muted" style="cursor:pointer;">Invite by email</summary>
        <div style="margin-top:0.5rem;">
          <p class="muted" style="margin:0 0 0.5rem;">Adds a student by their Gmail address — they're enrolled automatically the moment they sign in with that address, no email/click-to-accept step needed. Use this for students who can't reliably use the join code/QR.</p>
          <form class="invite-form" data-section="${d.id}">
            <label>Student's Gmail address</label>
            <input class="invite-email" type="email" required placeholder="name@gmail.com" />
            <label>Student's name (as it should appear on your roster)</label>
            ${s.roster?.length ? `
            <select class="invite-name-select">
              ${s.roster.map((r) => (typeof r === "string" ? r : r.name)).map((name) => `<option value="${name}">${name}</option>`).join("")}
              <option value="__other__">Other (type a name)</option>
            </select>
            <input class="invite-name" placeholder="e.g. Alcaide, Led Jervis J." style="display:none;" />` : `
            <input class="invite-name" required placeholder="e.g. Alcaide, Led Jervis J." />`}
            <button type="submit">Send invite</button>
          </form>
          <p class="invite-message muted"></p>
          <div class="invite-pending">
            ${pendingInvites.length ? pendingInvites.map((inv) => `
              <div style="display:flex; align-items:center; gap:0.5rem; margin-top:0.35rem;">
                <span class="muted">Pending: ${displayStudentName(inv.studentName)} (${inv.studentEmail})</span>
                <button type="button" class="secondary" data-cancel-invite="${inv.id}">Cancel</button>
              </div>`).join("") : ""}
          </div>
        </div>
      </details>
      <details style="margin-top:0.5rem;">
        <summary class="muted" style="cursor:pointer;">Apply a saved student list</summary>
        <div style="margin-top:0.5rem;">
          ${masterLists.length ? `
          <select class="master-list-select">
            <option value="">Choose a list…</option>
            ${masterLists.map((l) => `<option value="${l.id}">${l.name} (${l.students.length})</option>`).join("")}
          </select>
          <button type="button" class="apply-master-list-btn" data-section="${d.id}">Invite everyone in this list</button>` : `
          <p class="muted">No saved lists yet — build one from an already-enrolled section's Enrolled Students page, or add one from Student Lists in the header.</p>`}
          <p class="apply-master-list-message muted"></p>
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
      const ok = confirmByTyping(
        "Delete this section? This also deletes every assignment, submission, and enrollment under it.",
        sectionNames.get(b.dataset.deleteSection) || ""
      );
      if (!ok) return;
      b.disabled = true;
      await cascadeDeleteSection(b.dataset.deleteSection);
      alert("Deleted.");
      loadSections();
    }));
  list.querySelectorAll(".invite-name-select").forEach((select) => {
    const textInput = select.parentElement.querySelector(".invite-name");
    const sync = () => {
      const isOther = select.value === "__other__";
      textInput.style.display = isOther ? "" : "none";
      textInput.required = isOther;
      if (isOther) textInput.focus();
    };
    select.addEventListener("change", sync);
    sync();
  });
  list.querySelectorAll(".invite-form").forEach((form) =>
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const sectionId = form.dataset.section;
      const email = form.querySelector(".invite-email").value.trim().toLowerCase();
      const select = form.querySelector(".invite-name-select");
      const studentName = (select && select.value !== "__other__"
        ? select.value
        : form.querySelector(".invite-name").value).trim();
      const msg = form.parentElement.querySelector(".invite-message");
      const btn = form.querySelector("button");
      btn.disabled = true;
      try {
        await addDoc(collection(db, "invites"), {
          studentEmail: email,
          studentName,
          subjectId: state.subjectId,
          subjectName: state.subjectName,
          sectionId,
          sectionName: sectionNames.get(sectionId),
          teacherName: state.subjectOwnerName,
          ownerEmail: state.viewAsEmail,
          createdAt: serverTimestamp(),
        });
        msg.textContent = `Invited ${studentName} — they'll join automatically once they sign in with ${email}.`;
        form.reset();
        loadSections();
      } catch (err) {
        msg.textContent = "Invite failed: " + err.message;
        btn.disabled = false;
      }
    }));
  list.querySelectorAll("[data-cancel-invite]").forEach((b) =>
    b.addEventListener("click", async () => {
      await deleteDoc(doc(db, "invites", b.dataset.cancelInvite));
      alert("Invite cancelled.");
      loadSections();
    }));
  list.querySelectorAll(".apply-master-list-btn").forEach((b) =>
    b.addEventListener("click", async () => {
      const sectionId = b.dataset.section;
      const select = b.parentElement.querySelector(".master-list-select");
      const listId = select.value;
      if (!listId) return;
      const msg = b.parentElement.querySelector(".apply-master-list-message");
      b.disabled = true;
      msg.textContent = "Inviting...";
      try {
        const result = await applyMasterListToSection(listId, sectionId, sectionNames.get(sectionId), invitesBySection.get(sectionId) || []);
        msg.textContent = `Invited ${result.invited}. Skipped ${result.skippedEnrolled} already enrolled, ${result.skippedInvited} already invited.`;
        loadSections();
      } catch (err) {
        msg.textContent = "Couldn't apply list: " + err.message;
        b.disabled = false;
      }
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
    alert("Saved.");
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
  alert("Section added.");
  e.target.reset();
  loadSections();
});

// ---------- enrolled students (subject-wide, all its sections) ----------
// onlySectionId scopes the list to one section (called from view-section);
// omitted, it's subject-wide across all that subject's sections (called
// from view-subject) - same table either way, just a different source query
// and back-button target.
let enrolledBackView = "view-subject";
let enrolledSectionId = null; // set below when this is a single-section view - lets #build-master-list-btn know what to build from
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
  enrolledSectionId = onlySectionId || null;
  el("build-master-list-btn").classList.toggle("hidden", !onlySectionId);
  el("build-master-list-message").textContent = "";
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
        ${rows.map((r, i) => `<tr><td>${i + 1}</td><td id="enroll-name-${r.id}">${displayStudentName(r.studentName)}${r.leaveRequested ? ' <span class="status-pending">(leave requested)</span>' : ""}</td><td>${r.studentEmail || ""}</td><td>${sectionMap.get(r.sectionId) || ""}</td><td>
          <button class="secondary" data-edit-enrollment="${r.id}" data-uid="${r.studentUID}" data-raw="${r.studentName}">Edit name</button>
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
      const current = b.dataset.raw;
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
      alert("Removed.");
      openEnrolled(onlySectionId);
      refreshNotifications();
    }));

  show("view-enrolled");
}
el("open-enrolled").addEventListener("click", () => openEnrolled());
el("open-enrolled-section").addEventListener("click", () => openEnrolled(state.sectionId));
el("back-to-subject-from-enrolled").addEventListener("click", () => show(enrolledBackView));
el("build-master-list-btn").addEventListener("click", () => {
  if (enrolledSectionId) buildMasterListFromSection(enrolledSectionId);
});

// Pulls real name+email pairs from an already-enrolled section's
// enrollments (self-reported at sign-in, so these are verified emails,
// not retyped by the teacher) into a new reusable masterLists doc - the
// "sync this section's roster to my other subject" entry point.
async function buildMasterListFromSection(sectionId) {
  const msg = el("build-master-list-message");
  const enrollSnap = await getDocs(ownerScopedQuery("enrollments", where("sectionId", "==", sectionId)));
  const owned = enrollSnap.docs.filter((d) => ownedByViewAs(d.data())).map((d) => d.data());
  const candidates = owned.filter((e) => e.studentEmail);
  const skippedNoEmail = owned.length - candidates.length;
  if (candidates.length === 0) {
    msg.textContent = "No enrolled students with an email on file.";
    return;
  }
  const name = prompt('Name this student list (e.g. "Grade 12 TVL-ICT"):', el("enrolled-view-name").textContent);
  if (name === null) return;
  const trimmed = name.trim();
  if (!trimmed) return;

  msg.textContent = "Saving...";
  try {
    await addDoc(collection(db, "masterLists"), {
      ownerEmail: state.viewAsEmail,
      name: trimmed,
      students: candidates.map((e) => ({ name: e.studentName, email: e.studentEmail.toLowerCase(), gender: "" })),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    msg.textContent = `Saved ${candidates.length} students to "${trimmed}"${skippedNoEmail ? ` (skipped ${skippedNoEmail} with no email on file)` : ""}. Find it under Student Lists in the header.`;
  } catch (err) {
    msg.textContent = "Couldn't save: " + err.message;
  }
}

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
  rosterPreviewNames = (section.roster || []).map((r) =>
    typeof r === "string" ? { name: r.toUpperCase(), gender: "" } : { ...r, name: r.name.toUpperCase() });
  pendingDuplicateReview = [];
  el("roster-message").textContent = "";
  el("roster-preview").innerHTML = "";
  el("roster-duplicate-review").innerHTML = "";
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
  const assignmentTitles = new Map(); // id -> title, for the delete-confirm prompt below
  snap.forEach((d) => {
    const a = d.data();
    assignmentTitles.set(d.id, a.title);
    const row = document.createElement("div");
    row.className = "card";
    row.innerHTML = `
      <strong>${a.title}</strong> <span class="muted">due ${a.dueDate || "no date"}</span>
      ${pendingBadge(counts.byAssignment.get(d.id))}
      ${a.instructions ? `<p class="muted">${a.instructions}</p>` : ""}
      ${a.instructionsLink ? `<div class="muted"><a href="${a.instructionsLink}" target="_blank" rel="noopener">Instructions file</a></div>` : ""}
      ${a.uploadFolderLink ? `<div class="muted"><a href="${a.uploadFolderLink}" target="_blank" rel="noopener">Upload folder</a></div>` : ""}
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
      const ok = confirmByTyping(
        "Delete this assignment? This also deletes every submission already made for it.",
        assignmentTitles.get(b.dataset.deleteAssignment) || ""
      );
      if (!ok) return;
      b.disabled = true;
      await cascadeDeleteAssignment(b.dataset.deleteAssignment);
      alert("Deleted.");
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
    uploadFolderLink: el("assignment-upload-link").value.trim(),
    component: el("assignment-component").value,
    dueDate: el("assignment-due").value,
    allowedFileTypes: el("assignment-filetype").value,
    totalPoints: Number(el("assignment-total-points").value) || 0,
    rubricReferenceLink: el("assignment-rubric-link").value.trim(),
    createdAt: Date.now(),
    ownerEmail: state.viewAsEmail,
  });
  alert("Assignment added.");
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
            : `<div class="muted"><a href="${a.instructionsLink}" target="_blank" rel="noopener">Instructions file</a>${openInChromeButton(a.instructionsLink)}</div>`)
          : ""}
        ${a.uploadFolderLink ? `<div class="muted"><a href="${a.uploadFolderLink}" target="_blank" rel="noopener">Upload folder</a>${openInChromeButton(a.uploadFolderLink)}</div>` : ""}
        ${a.rubricReferenceLink ? `
          <label style="margin-top:0.75rem;">Rubric reference</label>
          ${rubricEmbed
            ? `<iframe src="${rubricEmbed}" class="submission-preview"></iframe>`
            : `<div class="muted"><a href="${a.rubricReferenceLink}" target="_blank" rel="noopener">${a.rubricReferenceLink}</a>${openInChromeButton(a.rubricReferenceLink)}</div>`}` : ""}
      </div>
    </details>`;
}

async function openAssignment(assignmentId) {
  state.assignmentId = assignmentId;
  const data = (await getDoc(doc(db, "assignments", assignmentId))).data();
  el("assignment-view-title").textContent = data.title;
  el("edit-assignment-title").value = data.title || "";
  el("edit-assignment-instructions").value = data.instructions || "";
  el("edit-assignment-instructions-link").value = data.instructionsLink || "";
  el("edit-assignment-upload-link").value = data.uploadFolderLink || "";
  el("edit-assignment-component").value = data.component || "written";
  el("edit-assignment-due").value = data.dueDate || "";
  el("edit-assignment-filetype").value = data.allowedFileTypes || "document";
  el("edit-assignment-total-points").value = data.totalPoints ?? "";
  el("edit-assignment-rubric-link").value = data.rubricReferenceLink || "";
  renderAssignmentContext(data);
  show("view-assignment");
  loadSubmissions();
}

el("edit-assignment-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const assignmentId = state.assignmentId;
  await updateDoc(doc(db, "assignments", assignmentId), {
    title: el("edit-assignment-title").value.trim(),
    instructions: el("edit-assignment-instructions").value.trim(),
    instructionsLink: el("edit-assignment-instructions-link").value.trim(),
    uploadFolderLink: el("edit-assignment-upload-link").value.trim(),
    component: el("edit-assignment-component").value,
    dueDate: el("edit-assignment-due").value,
    allowedFileTypes: el("edit-assignment-filetype").value,
    totalPoints: Number(el("edit-assignment-total-points").value) || 0,
    rubricReferenceLink: el("edit-assignment-rubric-link").value.trim(),
  });
  alert("Saved.");
  await openAssignment(assignmentId);
});

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
        <tbody>${graded.map((s) => `<tr><td>${displayStudentName(s.studentName)}</td><td>${s.finalGrade?.score ?? "—"}/${totalPoints ?? "—"}</td></tr>`).join("")}</tbody>
      </table>
    </details>`;
}

// Shared by the per-assignment gallery below and the header-wide "Photo
// ZIPs" panel (getPhotoAssignments()/renderPhotosDropdown()) - all
// client-side (JSZip CDN), no Storage involved, since the images already
// live inline on the submission docs.
async function downloadPhotosZip(withPhotos, filename, buttonEl) {
  buttonEl.disabled = true;
  const original = buttonEl.textContent;
  buttonEl.textContent = "Zipping...";
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
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (err) {
    alert("Couldn't build the ZIP: " + err.message);
  }
  buttonEl.disabled = false;
  buttonEl.textContent = original;
}

const MAX_COLLAGE_PHOTOS = 14;
const COLLAGE_WIDTH = 1600;
const COLLAGE_HEIGHT = 1200;

// Decodes a base64 photo data-URI into an <img> so its natural size is known
// for the collage layout/docx embed - photos already live inline on the
// submission docs, no fetch/CORS step needed.
function loadImageFromDataUri(dataUri) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUri;
  });
}

function canvasToBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

async function downloadCollagePng(canvas, filename) {
  const blob = await canvasToBlob(canvas);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// Draws a scrapbook-style collage: photos at randomized sizes/rotation,
// scattered (not grid-aligned, deliberately allowed to overlap - that's what
// makes it read as a scrapbook instead of a plain grid), with a centered
// title/section/date badge drawn on top. No seeded RNG and nothing cached
// here - every call (including "Regenerate layout") recomputes fresh
// Math.random() placement, so the arrangement is genuinely different each time.
function drawScatteredCollage(ctx, canvas, { images, title, sectionName, dateLabel }) {
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#f7fafc";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, W - 4, H - 4);

  if (images.length === 0) return;

  const pool = images.length > MAX_COLLAGE_PHOTOS
    ? [...images].sort(() => Math.random() - 0.5).slice(0, MAX_COLLAGE_PHOTOS)
    : images;

  const cols = 4, rows = 4;
  const cellW = W / cols, cellH = H / rows;
  const cells = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push({ cx: c * cellW + cellW / 2, cy: r * cellH + cellH / 2 });
  cells.sort(() => Math.random() - 0.5);

  const placed = pool.slice(0, cells.length).map((p, i) => {
    const cell = cells[i];
    const targetW = cellW * (0.55 + Math.random() * 0.4);
    const targetH = targetW * (p.naturalHeight / p.naturalWidth);
    const jitterX = (Math.random() * 2 - 1) * cellW * 0.25;
    const jitterY = (Math.random() * 2 - 1) * cellH * 0.25;
    const angle = (Math.random() * 24 - 12) * Math.PI / 180;
    return { img: p, targetW, targetH, cx: cell.cx + jitterX, cy: cell.cy + jitterY, angle };
  });

  // Largest photos first so smaller ones layer on top - reads as layered snapshots.
  placed.sort((a, b) => (b.targetW * b.targetH) - (a.targetW * a.targetH));

  placed.forEach(({ img, targetW, targetH, cx, cy, angle }) => {
    // Clamp so the rotated bounding box never clips off the canvas edge.
    const diag = Math.sqrt(targetW * targetW + targetH * targetH);
    const clampedCx = Math.min(Math.max(cx, diag / 2), W - diag / 2);
    const clampedCy = Math.min(Math.max(cy, diag / 2), H - diag / 2);
    const mat = 12;
    ctx.save();
    ctx.translate(clampedCx, clampedCy);
    ctx.rotate(angle);
    ctx.shadowColor = "rgba(17,28,44,0.25)";
    ctx.shadowBlur = 14;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(-targetW / 2 - mat, -targetH / 2 - mat, targetW + mat * 2, targetH + mat * 2);
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.drawImage(img, -targetW / 2, -targetH / 2, targetW, targetH);
    ctx.restore();
  });

  // Centered circular badge, drawn last so it always reads clearly on top.
  const radius = Math.min(W, H) * 0.20;
  const bcx = W / 2, bcy = H / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(bcx, bcy, radius + 10, 0, Math.PI * 2);
  ctx.setLineDash([6, 6]);
  ctx.strokeStyle = "#002045";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.beginPath();
  ctx.arc(bcx, bcy, radius, 0, Math.PI * 2);
  ctx.fillStyle = "#fffaf0";
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = "#002045";
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const chordAt = (dy) => 2 * Math.sqrt(Math.max(radius * radius - dy * dy, 0)) * 0.85;
  const fitText = (text, maxWidth, startSize, weight) => {
    let size = startSize;
    ctx.font = `${weight} ${size}px 'Source Serif 4', Georgia, serif`;
    while (ctx.measureText(text).width > maxWidth && size > 10) {
      size -= 1;
      ctx.font = `${weight} ${size}px 'Source Serif 4', Georgia, serif`;
    }
    return size;
  };

  ctx.fillStyle = "#002045";
  const titleSize = fitText(title || "", chordAt(-radius * 0.35), Math.round(radius * 0.22), "bold");
  ctx.font = `bold ${titleSize}px 'Source Serif 4', Georgia, serif`;
  ctx.fillText(title || "", bcx, bcy - radius * 0.28);

  const sectionSize = fitText(sectionName || "", chordAt(0), Math.round(radius * 0.14), "normal");
  ctx.font = `${sectionSize}px 'Source Serif 4', Georgia, serif`;
  ctx.fillText(sectionName || "", bcx, bcy + 2);

  ctx.fillStyle = "#4a5568";
  const dateSize = fitText(dateLabel || "", chordAt(radius * 0.35), Math.round(radius * 0.11), "normal");
  ctx.font = `${dateSize}px 'Source Serif 4', Georgia, serif`;
  ctx.fillText(dateLabel || "", bcx, bcy + radius * 0.32);
  ctx.restore();

  // Two simple decorative flourishes, drawn as plain shapes (not emoji -
  // inconsistent glyph rendering across OS/font stacks would show up in the
  // rasterized PNG/docx output).
  ctx.save();
  ctx.fillStyle = "rgba(148,163,184,0.55)";
  const cloudX = W * 0.1, cloudY = H * 0.12;
  [[0, 0, 30], [26, -10, 24], [50, 0, 28], [22, 12, 22]].forEach(([dx, dy, r]) => {
    ctx.beginPath();
    ctx.arc(cloudX + dx, cloudY + dy, r, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();

  ctx.save();
  const potX = W * 0.9, potY = H * 0.88;
  ctx.fillStyle = "#c05621";
  ctx.beginPath();
  ctx.moveTo(potX - 22, potY);
  ctx.lineTo(potX + 22, potY);
  ctx.lineTo(potX + 14, potY + 36);
  ctx.lineTo(potX - 14, potY + 36);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#38a169";
  [[-14, -18], [0, -26], [14, -18]].forEach(([dx, dy]) => {
    ctx.beginPath();
    ctx.ellipse(potX + dx, potY + dy, 10, 18, dx === 0 ? 0 : dx < 0 ? -Math.PI / 6 : Math.PI / 6, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

function collageDateLabel() {
  const from = el("report-date-from").value;
  const to = el("report-date-to").value;
  if (!from && !to) return "";
  if (from && to && from !== to) return `${from} to ${to}`;
  return from || to;
}

// Short auto-draft so the report reads as a brief explanation of the WFH
// activity, not a submission count - folds in the assignment's own
// `instructions` text (already shown to students) when present, since
// that's the closest existing data to an actual activity description.
// Teacher can freely rewrite this before generating.
function draftReportDescription({ assignmentTitle, sectionName, instructions, dateLabel }) {
  const dateClause = dateLabel ? ` on ${dateLabel}` : "";
  let sentence = `Students of ${sectionName || "the class"} completed "${assignmentTitle}" as a work-from-home activity${dateClause}, submitting photo documentation of their work.`;
  if (instructions && instructions.trim()) {
    sentence += ` ${instructions.trim()}`;
  }
  return sentence;
}

// Decodes every submitted photo once, draws the initial collage, then wires
// "Regenerate layout" (redraw with fresh randomization) and the two export
// buttons. Runs inside the same per-assignment gallery scope as the existing
// ZIP download, so no extra Firestore reads are needed.
async function renderCollagePreview(withPhotos, context) {
  const canvas = el("collage-preview");
  canvas.width = COLLAGE_WIDTH;
  canvas.height = COLLAGE_HEIGHT;
  const ctx = canvas.getContext("2d");

  const flatPhotos = [];
  withPhotos.forEach((s) => s.photos.forEach((p) => flatPhotos.push(p)));
  const images = await Promise.all(flatPhotos.map(loadImageFromDataUri));

  const draw = () => drawScatteredCollage(ctx, canvas, {
    images,
    title: el("report-title").value || context.assignmentTitle,
    sectionName: context.sectionName || "",
    dateLabel: collageDateLabel(),
  });
  draw();

  el("regenerate-collage").addEventListener("click", draw);
  el("report-title").addEventListener("input", draw);
  el("report-date-from").addEventListener("change", draw);
  el("report-date-to").addEventListener("change", draw);

  el("download-collage-png").addEventListener("click", async (e) => {
    const btn = e.target;
    btn.disabled = true;
    try {
      const title = el("report-title").value || context.assignmentTitle;
      await downloadCollagePng(canvas, `${title.replace(/[/\\:*?"<>|]/g, "-")}-collage.png`);
    } finally {
      btn.disabled = false;
    }
  });

  el("generate-report-docx").addEventListener("click", (e) =>
    generateAccomplishmentReport(context, canvas, e.target));
}

// DepEd accomplishment-report .docx structure - kept deliberately simple and
// adjustable (header fields, collage, brief activity narrative) since the
// teacher will share their real report template later to refine the exact
// layout.
async function buildAccomplishmentReportDocx({ title, subjectName, sectionName, dateLabel, description, collageBuffer, collageWidth, collageHeight }) {
  const pageContentWidth = 540;
  const imgHeight = Math.round(pageContentWidth * (collageHeight / collageWidth));

  return new Document({
    sections: [{
      children: [
        new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 }),
        new Paragraph({ children: [new TextRun({ text: `Subject: ${subjectName}`, bold: true })] }),
        new Paragraph({ children: [new TextRun({ text: `Section: ${sectionName}`, bold: true })] }),
        new Paragraph({ children: [new TextRun({ text: `Date(s) Covered: ${dateLabel || "—"}`, bold: true })] }),
        new Paragraph({ text: "" }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new ImageRun({
            type: "png",
            data: collageBuffer,
            transformation: { width: pageContentWidth, height: imgHeight },
          })],
        }),
        new Paragraph({ text: "" }),
        new Paragraph({ children: [new TextRun({ text: description || "" })] }),
      ],
    }],
  });
}

async function generateAccomplishmentReport(context, canvas, buttonEl) {
  buttonEl.disabled = true;
  const original = buttonEl.textContent;
  buttonEl.textContent = "Generating...";
  try {
    const title = el("report-title").value || context.assignmentTitle;
    const collageBlob = await canvasToBlob(canvas);
    const collageBuffer = new Uint8Array(await collageBlob.arrayBuffer());
    const doc = await buildAccomplishmentReportDocx({
      title,
      subjectName: context.subjectName || "",
      sectionName: context.sectionName || "",
      dateLabel: collageDateLabel(),
      description: el("report-description").value,
      collageBuffer,
      collageWidth: canvas.width,
      collageHeight: canvas.height,
    });
    const blob = await Packer.toBlob(doc);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${title.replace(/[/\\:*?"<>|]/g, "-")}-accomplishment-report.docx`;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (err) {
    alert("Couldn't build the report: " + err.message);
  }
  buttonEl.disabled = false;
  buttonEl.textContent = original;
}

// A per-assignment gallery of every submitted photo (photoPages, or the
// legacy single photoData), with a one-click "download everything as one
// ZIP" button. Easy to miss if this assignment has no other open card
// nearby (it's a collapsed <details>) - the header "Photo ZIPs" panel
// (getPhotoAssignments() below) surfaces the same download across every
// assignment at once, so it doesn't require drilling in here first.
function renderImagesGallery(submissions, assignmentTitle, context) {
  const container = el("images-gallery");
  const withPhotos = submissions
    .map((s) => ({ name: displayStudentName(s.studentName), photos: s.photoPages?.length ? s.photoPages : s.photoData ? [s.photoData] : [] }))
    .filter((s) => s.photos.length > 0);
  if (withPhotos.length === 0) {
    container.innerHTML = "";
    return;
  }
  const total = withPhotos.reduce((sum, s) => sum + s.photos.length, 0);
  const defaultDescription = draftReportDescription({
    assignmentTitle, sectionName: context?.sectionName, instructions: context?.instructions, dateLabel: "",
  });
  container.innerHTML = `
    <details class="card">
      <summary><strong>Photo submissions</strong> (${total} image${total > 1 ? "s" : ""} from ${withPhotos.length} student${withPhotos.length > 1 ? "s" : ""})</summary>
      <div style="margin-top:0.75rem;">
        <button type="button" id="download-all-photos">Download all as ZIP</button>
        <div class="photo-thumbs" style="margin-top:0.75rem;">
          ${withPhotos.map((s) => s.photos.map((p, i) =>
            `<button type="button" class="photo-thumb-btn" data-photo-src="${p}" title="${s.name} - page ${i + 1}"><img src="${p}" /></button>`
          ).join("")).join("")}
        </div>
      </div>
      <div class="card" style="margin-top:1rem;">
        <strong>Accomplishment report</strong>
        <p class="muted" style="margin-top:0.25rem;">For DepEd modular/work-from-home activity documentation.</p>
        <label>Report title</label>
        <input id="report-title" value="${assignmentTitle}" />
        <label>Date(s) covered</label>
        <div style="display:flex; gap:0.5rem;">
          <input type="date" id="report-date-from" />
          <input type="date" id="report-date-to" />
        </div>
        <label>Activity description</label>
        <textarea id="report-description" rows="3">${defaultDescription}</textarea>
        <div style="margin-top:0.75rem;">
          <canvas id="collage-preview" class="collage-preview"></canvas>
        </div>
        <div style="margin-top:0.5rem;">
          <button type="button" class="secondary" id="regenerate-collage">Regenerate layout</button>
          <button type="button" class="secondary" id="download-collage-png">Download Collage (PNG)</button>
          <button type="button" id="generate-report-docx">Generate Accomplishment Report (.docx)</button>
        </div>
      </div>
    </details>`;
  el("download-all-photos").addEventListener("click", (e) =>
    downloadPhotosZip(withPhotos, `${assignmentTitle.replace(/[/\\:*?"<>|]/g, "-")}-photos.zip`, e.target));

  renderCollagePreview(withPhotos, { ...context, assignmentTitle });
}

// Header-wide list of every assignment (across every subject/section this
// teacher owns) that has at least one photo submission, each with its own
// ZIP button - so downloading photos doesn't require opening each
// assignment's own (collapsed-by-default) Photo submissions card first.
async function getPhotoAssignments() {
  const [subjectsSnap, sectionsSnap, assignSnap, subSnap] = await Promise.all([
    getDocs(ownerScopedQuery("subjects")),
    getDocs(ownerScopedQuery("sections")),
    getDocs(ownerScopedQuery("assignments")),
    getDocs(ownerScopedQuery("submissions")),
  ]);
  const subjectNames = new Map(subjectsSnap.docs.map((d) => [d.id, d.data().name]));
  const sections = new Map(sectionsSnap.docs.map((d) => [d.id, d.data()]));
  const assignments = new Map(assignSnap.docs.map((d) => [d.id, d.data()]));

  const byAssignment = new Map();
  subSnap.forEach((d) => {
    if (!ownedByViewAs(d.data())) return; // admin's unfiltered submissions query includes every teacher's - narrow to mine/legacy
    const s = d.data();
    const photos = s.photoPages?.length ? s.photoPages : s.photoData ? [s.photoData] : [];
    if (photos.length === 0) return;
    if (!byAssignment.has(s.assignmentId)) byAssignment.set(s.assignmentId, []);
    byAssignment.get(s.assignmentId).push({ name: displayStudentName(s.studentName), photos });
  });

  return [...byAssignment.entries()].map(([assignmentId, withPhotos]) => {
    const a = assignments.get(assignmentId) || {};
    const section = sections.get(a.sectionId) || {};
    const total = withPhotos.reduce((sum, s) => sum + s.photos.length, 0);
    return {
      assignmentId,
      title: a.title || "(deleted assignment)",
      sectionName: section.sectionName || "(deleted section)",
      subjectName: subjectNames.get(section.subjectId) || "(deleted subject)",
      withPhotos,
      total,
    };
  }).sort((x, y) => y.total - x.total);
}

function renderPhotosDropdown(list) {
  const dropdown = el("photos-dropdown");
  if (list.length === 0) {
    dropdown.innerHTML = '<p class="muted" style="padding:0.5rem 0.75rem;">No photo submissions yet.</p>';
    return;
  }
  dropdown.innerHTML = list.map((p, i) => `
    <div class="notif-item" style="display:flex; align-items:center; justify-content:space-between; gap:0.5rem;">
      <span>${p.title} <span class="muted">(${p.subjectName} &rsaquo; ${p.sectionName}) — ${p.total} photo${p.total > 1 ? "s" : ""}</span></span>
      <button type="button" class="secondary" data-zip-index="${i}" style="flex-shrink:0;">ZIP</button>
    </div>`).join("");
  dropdown.querySelectorAll("[data-zip-index]").forEach((b) =>
    b.addEventListener("click", () => {
      const p = list[Number(b.dataset.zipIndex)];
      downloadPhotosZip(p.withPhotos, `${p.title.replace(/[/\\:*?"<>|]/g, "-")}-photos.zip`, b);
    }));
}

el("photos-bell").addEventListener("click", async (e) => {
  e.stopPropagation();
  const dropdown = el("photos-dropdown");
  if (!dropdown.classList.contains("hidden")) {
    dropdown.classList.add("hidden");
    return;
  }
  dropdown.innerHTML = '<p class="muted" style="padding:0.5rem 0.75rem;">Loading...</p>';
  dropdown.classList.remove("hidden");
  try {
    renderPhotosDropdown(await getPhotoAssignments());
  } catch (err) {
    dropdown.innerHTML = '<p class="muted" style="padding:0.5rem 0.75rem;">Couldn\'t load photo submissions.</p>';
  }
});
document.addEventListener("click", (e) => {
  if (!e.target.closest("#photos-bell, #photos-dropdown")) el("photos-dropdown").classList.add("hidden");
});

async function loadSubmissions() {
  const filter = el("submission-filter").value;
  const q = ownerScopedQuery("submissions", where("assignmentId", "==", state.assignmentId));
  const [snap, aDoc] = await Promise.all([getDocs(q), getDoc(doc(db, "assignments", state.assignmentId))]);
  const ownedDocs = snap.docs.filter((d) => ownedByViewAs(d.data()));
  renderScoresSummary(ownedDocs.map((d) => d.data()), aDoc.data()?.totalPoints);
  renderImagesGallery(ownedDocs.map((d) => d.data()), aDoc.data()?.title || "submissions", {
    subjectName: state.subjectName,
    sectionName: el("section-view-name").textContent,
    instructions: aDoc.data()?.instructions,
  });
  const list = el("submissions-list");
  list.innerHTML = "";
  // Pending (and AI-drafted, still unreviewed) submissions need the
  // teacher's attention most - surface those first instead of leaving them
  // buried among already-published ones in query order.
  const STATUS_PRIORITY = { pending: 0, "ai-drafted": 1, returned: 2, published: 3 };
  const sortedDocs = ownedDocs.slice().sort(
    (a, b) => (STATUS_PRIORITY[a.data().status] ?? 4) - (STATUS_PRIORITY[b.data().status] ?? 4)
  );
  sortedDocs.forEach((d) => {
    const s = d.data();
    if (filter !== "all" && s.status !== filter) return;
    const row = document.createElement("div");
    row.className = "card";
    const embedUrl = toEmbedUrl(s.link);
    const linkBlock = (s.photoPages && s.photoPages.length > 0)
      ? `<div class="photo-thumbs">${s.photoPages.map((p, i) => `<button type="button" class="photo-thumb-btn" data-photo-src="${p}" title="page ${i + 1}"><img src="${p}" /></button>`).join("")}</div>`
      : s.photoData // legacy single-photo submissions made before multi-page support
        ? `<button type="button" class="photo-thumb-btn" data-photo-src="${s.photoData}" title="submitted photo"><img src="${s.photoData}" class="photo-preview" /></button>`
        : embedUrl
        ? `<iframe src="${embedUrl}" class="submission-preview"></iframe>
         <div class="muted"><a href="${s.link}" target="_blank" rel="noopener">open in new tab</a></div>`
        : `<div class="muted"><a href="${s.link}" target="_blank" rel="noopener">${s.link}</a></div>`;
    row.innerHTML = `
      <strong id="sub-name-${d.id}">${displayStudentName(s.studentName)}</strong>
      <button type="button" class="secondary" data-edit-sub-name="${d.id}" data-uid="${s.studentUID}" data-raw="${s.studentName}" style="margin-left:0.4rem;">Edit name</button>
      <span class="status-${s.status}"> — ${s.status}</span>
      ${linkBlock}
      <div id="detail-${d.id}"></div>
      <div style="margin-top:0.5rem;">
        ${AI_CHECK_ENABLED ? `<button data-ai="${d.id}">Run AI Check</button>` : ""}
        <button class="secondary" data-review="${d.id}">Review / Grade</button>
        <button class="danger" data-delete-sub="${d.id}">Delete</button>
      </div>`;
    list.appendChild(row);
  });
  if (AI_CHECK_ENABLED) {
    list.querySelectorAll("[data-ai]").forEach((b) =>
      b.addEventListener("click", () => runAiCheck(b.dataset.ai)));
  }
  list.querySelectorAll("[data-review]").forEach((b) =>
    b.addEventListener("click", () => openReview(b.dataset.review)));
  list.querySelectorAll("[data-delete-sub]").forEach((b) =>
    b.addEventListener("click", async () => {
      const s = ownedDocs.find((d) => d.id === b.dataset.deleteSub)?.data();
      const ok = confirmByTyping(
        `Delete ${s?.studentName || "this student"}'s submission? This cannot be undone.`,
        s?.studentName || ""
      );
      if (!ok) return;
      b.disabled = true;
      await deleteDoc(doc(db, "submissions", b.dataset.deleteSub));
      alert("Deleted.");
      loadSubmissions();
    }));

  // Fix a garbled name right while reviewing the work, instead of having to
  // go find the student in Enrolled Students first.
  list.querySelectorAll("[data-edit-sub-name]").forEach((b) =>
    b.addEventListener("click", () => {
      const submissionId = b.dataset.editSubName;
      const nameEl = el(`sub-name-${submissionId}`);
      const current = b.dataset.raw;
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
      <button type="button" class="secondary" data-return="${submissionId}">Return for revision</button>
      <div class="muted" style="margin-top:0.4rem; font-size:0.85em;">Return for revision unlocks editing for the student to redo the work; Publish finalizes the grade and locks it.</div>
    </div>`;

  // <input max> only styles the field - it doesn't block typing or block a
  // programmatic .value read, so an over-max score would otherwise save
  // silently. Shared check for both buttons below.
  function readValidScore() {
    const score = Number(el(`score-${submissionId}`).value) || 0;
    if (score < 0 || score > a.totalPoints) {
      alert(`Score must be between 0 and ${a.totalPoints}.`);
      return null;
    }
    return score;
  }

  container.querySelector(`[data-publish]`).addEventListener("click", async () => {
    const score = readValidScore();
    if (score === null) return;
    const btn = container.querySelector(`[data-publish]`);
    btn.disabled = true;
    btn.textContent = "Saving...";
    await updateDoc(ref, {
      finalGrade: {
        score,
        feedback: el(`feedback-${submissionId}`).value,
      },
      status: "published",
      publishedAt: Date.now(),
    });
    alert("Published — the student can now see their grade and feedback.");
    loadSubmissions();
    refreshNotifications();
  });

  // Sends the submission back to the student to redo instead of grading it -
  // reuses the same score/feedback boxes so the teacher can leave a note on
  // what needs fixing. Student side then deletes and resubmits, same as the
  // existing pending-submission "Remove" flow.
  container.querySelector(`[data-return]`).addEventListener("click", async () => {
    const score = readValidScore();
    if (score === null) return;
    const btn = container.querySelector(`[data-return]`);
    btn.disabled = true;
    btn.textContent = "Saving...";
    await updateDoc(ref, {
      finalGrade: {
        score,
        feedback: el(`feedback-${submissionId}`).value,
      },
      status: "returned",
      returnedAt: Date.now(),
    });
    alert("Returned for revision — the student can now redo and resubmit.");
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

// Best-effort match for two spellings of the same student ("Tranks Amir
// B." vs "TRANKZ AMIR BUIZA") - strips accents/case/punctuation, then
// requires an exact surname match (the part before the comma) plus a
// close first-given-name match, so same-surname classmates (two
// different "Costales" students, common in a Filipino class list) don't
// false-positive on surname alone.
function normalizeRosterName(raw) {
  const noAccents = raw.normalize("NFD").replace(/[̀-ͯ]/g, "");
  const [surnamePart, ...rest] = noAccents.split(",");
  const clean = (s) => s.toLowerCase().replace(/[^a-z\s]/g, "").trim().replace(/\s+/g, " ");
  return { surname: clean(surnamePart || ""), given: clean(rest.join(",")) };
}

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

function findLikelyDuplicate(candidateName, existingNames) {
  const cand = normalizeRosterName(candidateName);
  const candFirst = cand.given.split(" ")[0] || "";
  if (!cand.surname || !candFirst) return null;
  for (const existing of existingNames) {
    const ex = normalizeRosterName(existing);
    const exFirst = ex.given.split(" ")[0] || "";
    if (ex.surname !== cand.surname || !exFirst) continue;
    if (exFirst === candFirst || levenshtein(exFirst, candFirst) <= 2) return existing;
  }
  return null;
}

let pendingDuplicateReview = []; // { name, gender, matchedExisting }

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
    // Normalize casing on the way in - the teacher's two source lists
    // (Class Record excerpt vs. a full-caps list) disagreed on case,
    // which is exactly the kind of surface difference that made 15 real
    // students look like 30 in this session's report. Uppercasing here
    // keeps every roster name (and, downstream, the Records grid and
    // join-name picker) visually consistent regardless of paste source.
    candidates.push({ name: line.toUpperCase(), gender: currentGender });
  }
  const seen = new Set(rosterPreviewNames.map((r) => r.name.toLowerCase()));
  const existingNames = rosterPreviewNames.map((r) => r.name);
  for (const c of candidates) {
    const key = c.name.toLowerCase();
    if (seen.has(key)) continue;
    const match = findLikelyDuplicate(c.name, [...existingNames, ...pendingDuplicateReview.map((p) => p.name)]);
    if (match) {
      pendingDuplicateReview.push({ ...c, matchedExisting: match });
      continue;
    }
    seen.add(key);
    existingNames.push(c.name);
    rosterPreviewNames.push(c);
  }
  renderRosterPreview();
  renderDuplicateReview();
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
    rosterPreviewNames = rows.map((r) => ({ name: r.name.toUpperCase(), gender: "" }));
    renderRosterPreview();
  } catch (err) {
    msg.textContent = err.message;
  }
});

function renderRosterPreview() {
  const container = el("roster-preview");
  const rows = rosterPreviewNames.map((r, i) => `
    <tr><td>${i + 1}</td><td>${r.name}</td><td>
      <select data-gender-index="${i}">
        <option value="" ${r.gender ? "" : "selected"}>—</option>
        <option value="Male" ${r.gender === "Male" ? "selected" : ""}>Male</option>
        <option value="Female" ${r.gender === "Female" ? "selected" : ""}>Female</option>
      </select>
    </td><td><button type="button" class="secondary" data-remove-name="${i}">Remove</button></td></tr>`).join("");

  container.innerHTML = `
    <p class="muted">${rosterPreviewNames.length} name(s) in the list. Remove any that aren't actual students, then save.</p>
    <table class="records-grid"><thead><tr><th>#</th><th>Name</th><th>Gender</th><th></th></tr></thead><tbody>${rows}</tbody></table>
    <button id="roster-save" style="margin-top:0.75rem;">Save Roster (${rosterPreviewNames.length})</button>`;

  container.querySelectorAll("[data-gender-index]").forEach((sel) => {
    sel.addEventListener("change", () => {
      rosterPreviewNames[Number(sel.dataset.genderIndex)].gender = sel.value;
    });
  });

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
    pendingDuplicateReview = [];
    el("roster-duplicate-review").innerHTML = "";
  });
}

function renderDuplicateReview() {
  const container = el("roster-duplicate-review");
  if (pendingDuplicateReview.length === 0) {
    container.innerHTML = "";
    return;
  }
  container.innerHTML = `
    <p class="muted">These look like they might already be on the list under a different spelling - review before adding:</p>
    ${pendingDuplicateReview.map((p, i) => `
      <div class="card">
        <p>New: <strong>${p.name}</strong></p>
        <p class="muted">Looks like: <strong>${p.matchedExisting}</strong> (already in the list)</p>
        <button type="button" class="secondary" data-dup-add="${i}">Add anyway (different person)</button>
        <button type="button" data-dup-skip="${i}">Skip (same person)</button>
      </div>`).join("")}`;

  container.querySelectorAll("[data-dup-add]").forEach((b) =>
    b.addEventListener("click", () => {
      const i = Number(b.dataset.dupAdd);
      const { matchedExisting, ...entry } = pendingDuplicateReview[i];
      rosterPreviewNames.push(entry);
      pendingDuplicateReview.splice(i, 1);
      renderRosterPreview();
      renderDuplicateReview();
    }));
  container.querySelectorAll("[data-dup-skip]").forEach((b) =>
    b.addEventListener("click", () => {
      pendingDuplicateReview.splice(Number(b.dataset.dupSkip), 1);
      renderDuplicateReview();
    }));
}

// ---------- master lists management (Student Lists header view) ----------
async function openMasterLists() {
  show("view-master-lists");
  loadMasterLists();
}
el("toggle-master-lists").addEventListener("click", openMasterLists);
el("back-from-master-lists").addEventListener("click", () => { show("view-subjects"); loadSubjects(); });

// Accepts either "Name, email" (one comma-separated line) or a
// tab-separated paste straight from a spreadsheet's Name/Email columns -
// matches the two ways a teacher realistically has this data on hand.
function parseMasterListPaste(text) {
  const EMAIL_RE = /[^\s,]+@[^\s,]+\.[^\s,]+/;
  const out = [];
  for (const rawLine of text.split(/\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.includes("\t")) {
      const [name, email] = line.split("\t").map((s) => s.trim());
      if (name && email) out.push({ name: name.toUpperCase(), email: email.toLowerCase() });
      continue;
    }
    const match = line.match(EMAIL_RE);
    if (!match) continue;
    const email = match[0].toLowerCase();
    const name = line.slice(0, match.index).replace(/,\s*$/, "").trim();
    if (name) out.push({ name: name.toUpperCase(), email });
  }
  return out;
}

let masterListPreviewStudents = [];
el("master-list-add-manual").addEventListener("click", () => {
  const textarea = el("master-list-manual-paste");
  const parsed = parseMasterListPaste(textarea.value);
  const seen = new Set(masterListPreviewStudents.map((s) => s.email));
  for (const p of parsed) {
    if (seen.has(p.email)) continue;
    seen.add(p.email);
    masterListPreviewStudents.push({ ...p, gender: "" });
  }
  textarea.value = "";
  renderMasterListPreview();
});

function renderMasterListPreview() {
  const container = el("master-list-preview");
  if (masterListPreviewStudents.length === 0) {
    container.innerHTML = "";
    return;
  }
  const rows = masterListPreviewStudents.map((s, i) => `
    <tr><td>${i + 1}</td><td>${s.name}</td><td>${s.email}</td><td>
      <button type="button" class="secondary" data-remove-master-preview="${i}">Remove</button>
    </td></tr>`).join("");
  container.innerHTML = `
    <p class="muted">${masterListPreviewStudents.length} student(s) parsed. Remove any that aren't actual students, then save.</p>
    <table class="records-grid"><thead><tr><th>#</th><th>Name</th><th>Email</th><th></th></tr></thead><tbody>${rows}</tbody></table>
    <button id="master-list-save" style="margin-top:0.75rem;">Save List (${masterListPreviewStudents.length})</button>`;

  container.querySelectorAll("[data-remove-master-preview]").forEach((b) =>
    b.addEventListener("click", () => {
      masterListPreviewStudents.splice(Number(b.dataset.removeMasterPreview), 1);
      renderMasterListPreview();
    }));

  el("master-list-save").addEventListener("click", async () => {
    const name = el("new-master-list-name").value.trim();
    if (!name) {
      el("master-list-message").textContent = "Name this list first.";
      return;
    }
    await addDoc(collection(db, "masterLists"), {
      ownerEmail: state.viewAsEmail,
      name,
      students: masterListPreviewStudents,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    el("master-list-message").textContent = `Saved "${name}" with ${masterListPreviewStudents.length} students.`;
    masterListPreviewStudents = [];
    el("master-list-preview").innerHTML = "";
    el("new-master-list-name").value = "";
    loadMasterLists();
  });
}

async function loadMasterLists() {
  const lists = await getMasterLists();
  const container = el("master-lists-list");
  container.innerHTML = lists.length
    ? lists.map((l) => `
      <div class="card">
        <strong id="master-list-name-${l.id}">${l.name}</strong>
        <span class="muted"> — ${l.students.length} student${l.students.length === 1 ? "" : "s"}</span>
        <div id="master-list-name-edit-${l.id}"></div>
        <div style="margin-top:0.5rem;">
          <button class="secondary" data-edit-master-list-name="${l.id}">Rename</button>
          <button class="secondary" data-toggle-master-list-students="${l.id}">View / Edit students</button>
          <button class="danger icon" data-delete-master-list="${l.id}" title="Delete list" aria-label="Delete list">×</button>
        </div>
        <div id="master-list-students-${l.id}"></div>
      </div>`).join("")
    : '<p class="muted">No saved lists yet.</p>';

  container.querySelectorAll("[data-edit-master-list-name]").forEach((b) =>
    b.addEventListener("click", () => {
      const listId = b.dataset.editMasterListName;
      const list = lists.find((l) => l.id === listId);
      const holder = el(`master-list-name-edit-${listId}`);
      holder.innerHTML = `<input id="master-list-name-input-${listId}" value="${list.name}" style="width:auto; display:inline-block;" /><button data-save-master-list-name>Save</button>`;
      holder.querySelector("[data-save-master-list-name]").addEventListener("click", async () => {
        const name = el(`master-list-name-input-${listId}`).value.trim();
        if (!name) return;
        await updateDoc(doc(db, "masterLists", listId), { name, updatedAt: serverTimestamp() });
        alert("Renamed.");
        loadMasterLists();
      });
    }));

  container.querySelectorAll("[data-toggle-master-list-students]").forEach((b) =>
    b.addEventListener("click", () => {
      const listId = b.dataset.toggleMasterListStudents;
      const list = lists.find((l) => l.id === listId);
      renderMasterListStudentsEditor(listId, list.students);
    }));

  container.querySelectorAll("[data-delete-master-list]").forEach((b) =>
    b.addEventListener("click", async () => {
      const listId = b.dataset.deleteMasterList;
      const list = lists.find((l) => l.id === listId);
      const ok = confirm(`Delete the student list "${list.name}"? This only deletes the saved list — it doesn't affect anyone already enrolled or invited.`);
      if (!ok) return;
      await deleteDoc(doc(db, "masterLists", listId));
      alert("Deleted.");
      loadMasterLists();
    }));
}

// Toggles an inline editable table for one list's students - a fresh
// in-memory draft each time it's opened, discarded (not saved) if the
// panel is collapsed again without hitting Save.
function renderMasterListStudentsEditor(listId, students) {
  const container = el(`master-list-students-${listId}`);
  if (container.dataset.open === "true") {
    container.innerHTML = "";
    container.dataset.open = "false";
    return;
  }
  container.dataset.open = "true";
  const draft = students.map((s) => ({ ...s }));

  const render = () => {
    container.innerHTML = `
      <table class="records-grid"><thead><tr><th>#</th><th>Name</th><th>Email</th><th></th></tr></thead><tbody>
        ${draft.map((s, i) => `<tr><td>${i + 1}</td><td>${s.name}</td><td>${s.email}</td><td>
          <button type="button" class="secondary" data-remove-student="${i}">Remove</button>
        </td></tr>`).join("")}
      </tbody></table>
      <div style="margin-top:0.5rem;">
        <input id="add-student-name-${listId}" placeholder="Name" style="width:auto; display:inline-block;" />
        <input id="add-student-email-${listId}" placeholder="Email" style="width:auto; display:inline-block;" />
        <button type="button" id="add-student-btn-${listId}">+ Add</button>
      </div>
      <button id="save-master-list-students-${listId}" style="margin-top:0.5rem;">Save changes</button>`;

    el(`add-student-btn-${listId}`).addEventListener("click", () => {
      const name = el(`add-student-name-${listId}`).value.trim().toUpperCase();
      const email = el(`add-student-email-${listId}`).value.trim().toLowerCase();
      if (!name || !email) return;
      draft.push({ name, email, gender: "" });
      render();
    });
    container.querySelectorAll("[data-remove-student]").forEach((b) =>
      b.addEventListener("click", () => { draft.splice(Number(b.dataset.removeStudent), 1); render(); }));
    el(`save-master-list-students-${listId}`).addEventListener("click", async () => {
      await updateDoc(doc(db, "masterLists", listId), { students: draft, updatedAt: serverTimestamp() });
      alert("Saved.");
      loadMasterLists();
    });
  };
  render();
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
  const roster = (section.roster || []).map((r) =>
    typeof r === "string" ? { name: r.toUpperCase(), gender: "" } : { ...r, name: r.name.toUpperCase() });

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
  ["view-subjects", "view-subject", "view-enrolled", "view-section", "view-assignment", "view-records", "view-master-lists"].forEach((v) => {
    el(v).classList.toggle("hidden", v !== viewId);
  });
  // Survives a page refresh - restoreNavState() below replays whichever
  // view this was on init instead of always landing back on the subjects list.
  try {
    sessionStorage.setItem("teacherNavState", JSON.stringify({
      view: viewId,
      subjectId: state.subjectId,
      sectionId: state.sectionId,
      assignmentId: state.assignmentId,
      enrolledBackView,
    }));
  } catch {}
}

async function restoreNavState() {
  let saved;
  try { saved = JSON.parse(sessionStorage.getItem("teacherNavState") || "null"); } catch { saved = null; }
  if (saved && saved.view === "view-master-lists") {
    await openMasterLists();
    return;
  }
  if (!saved || saved.view === "view-subjects" || !saved.subjectId) {
    show("view-subjects");
    loadSubjects();
    return;
  }
  try {
    await openSubject(saved.subjectId);
    if (saved.view === "view-subject") return;

    if (saved.view === "view-enrolled" && saved.enrolledBackView === "view-subject") {
      await openEnrolled();
      return;
    }

    if (!saved.sectionId) return; // already showing view-subject from openSubject above
    await openSection(saved.sectionId);
    if (saved.view === "view-section") return;
    if (saved.view === "view-records") { await openRecords(); return; }
    if (saved.view === "view-enrolled") { await openEnrolled(saved.sectionId); return; }
    if (saved.view === "view-assignment" && saved.assignmentId) { await openAssignment(saved.assignmentId); return; }
  } catch {
    show("view-subjects");
    loadSubjects();
  }
}
el("go-home").addEventListener("click", () => { show("view-subjects"); loadSubjects(); });
el("toggle-settings").addEventListener("click", () => el("settings-panel").classList.toggle("hidden"));
el("back-to-subjects").addEventListener("click", () => { show("view-subjects"); loadSubjects(); });
el("back-to-subject").addEventListener("click", () => show("view-subject"));
el("back-to-section").addEventListener("click", () => show("view-section"));
el("back-to-section-from-records").addEventListener("click", () => show("view-section"));
el("sign-out").addEventListener("click", signOutUser);
wireOpenInChromeButtons(el("assignment-context"));

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
      alert("Access removed.");
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
  alert("Access granted.");
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
  refreshNotifications();
  restoreNavState();
});
