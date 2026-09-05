import { db, ADMIN_EMAIL, isSuperAdmin } from "./firebase-config.js";
import { guardPage, signOutUser } from "./auth.js";
import {
  collection, addDoc, doc, setDoc, updateDoc, deleteDoc, getDoc, getDocs, query, where, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getGeminiKey, setGeminiKey, runRubricCheck } from "./gemini.js";
import { getEmailConfig, saveEmailConfig, notifySection } from "./notify.js";
import { toEmbedUrl, openInChromeButton, wireOpenInChromeButtons } from "./embed.js";
import { loadWorkbook } from "./class-record.js";

// AI rubric-check is hidden (not deleted) - per-call Gemini cost isn't
// worth it right now. Flip this back to true to restore the Run AI Check
// button and the "AI drafted" filter option (the Settings gear itself
// stays visible regardless - the EmailJS notify config lives there too
// now). Note: runAiCheck() below still expects
// assignment.rubric (per-criterion), which assignments no longer have
// since grading switched to a single total-points score - re-enabling
// would need a small adapter first.
const AI_CHECK_ENABLED = false;

const state = { subjectId: null, sectionId: null, assignmentId: null, subjectName: null, subjectOwnerName: null, viewAsEmail: null, topics: [] };
let currentUser = null;

// xlsx/qrcodejs/jszip used to be eager <script> tags in teacher.html,
// blocking every page load with ~950KB+ of code most teachers never touch
// that session (roster upload, QR expand, ZIP download are each one-off
// actions). Loaded on demand instead, cached per URL so a second use
// doesn't re-fetch/re-inject.
const scriptLoadPromises = new Map();
function loadScriptOnce(src) {
  if (!scriptLoadPromises.has(src)) {
    scriptLoadPromises.set(src, new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(script);
    }));
  }
  return scriptLoadPromises.get(src);
}
const XLSX_CDN_URL = "https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js";
const QRCODEJS_CDN_URL = "https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js";
const JSZIP_CDN_URL = "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js";

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

// Short-lived read coalescing. A teacher landing fires getNotifications()
// immediately followed by loadSubjects() (which calls getPendingCounts() +
// getLeaveRequestCounts()); those independently re-scan the same owner-scoped
// collections (sections 3x, assignments/pending-submissions/leave-enrollments
// 2x each on one page load). Firestore bills per doc returned, so those
// duplicate whole-account scans multiplied the reads for a single load. This
// memoizes identical owner-scoped fetches for a brief window so the siblings in
// one burst share one query instead of repeating it. The cache is cleared at
// the start of every refreshNotifications() - which runs after every mutation -
// so a badge never reflects data older than the last refresh; the TTL only
// bounds reuse for back-to-back navigation with no refresh in between (counts
// don't change without a mutation in this session, matching the app's existing
// no-live-listener behaviour). Callers pass a stable key; the same key across
// functions is what lets them share a fetch.
const READ_CACHE_TTL_MS = 3000;
let readCache = new Map(); // key -> { t, promise }
function invalidateReadCache() { readCache = new Map(); }
function cachedOwnerDocs(key, collectionName, ...wheres) {
  // Scope the key to who we're viewing as: admin "view as" swaps whose data
  // ownerScopedQuery returns, and must never serve another teacher's cache.
  const fullKey = state.viewAsEmail + "|" + key;
  const now = Date.now();
  const hit = readCache.get(fullKey);
  if (hit && now - hit.t < READ_CACHE_TTL_MS) return hit.promise;
  // Always filter by the viewed owner - even for the super admin. These are
  // notification/count/overview rollups, which the UI already narrows to the
  // viewed owner via ownedByViewAs(); the admin-unfiltered ownerScopedQuery
  // would otherwise READ every teacher's whole account deployment-wide on the
  // admin's own landing (a huge, pointless read-quota drain) only to throw all
  // but their own away. Write-path reads still use ownerScopedQuery directly.
  // Edge: pre-migration docs lacking ownerEmail (isLegacyUnowned) won't match
  // this filter, so they no longer surface in the admin's rollups - acceptable
  // on this long-migrated system; a one-time ownerEmail backfill is the fix if
  // any remain.
  const scoped = query(collection(db, collectionName), where("ownerEmail", "==", state.viewAsEmail), ...wheres);
  const promise = getDocs(scoped);
  // Never let a REJECTED read linger in the cache. getNotifications() runs
  // before loadSubjects() on a fresh page load and populates these same keys;
  // if one of its queries failed, a cached rejected promise would be reused by
  // loadSubjects()'s count rollups and take the whole subject list down with
  // it. Evict on failure so a reuse re-queries instead of re-throwing.
  promise.catch(() => { if (readCache.get(fullKey)?.promise === promise) readCache.delete(fullKey); });
  readCache.set(fullKey, { t: now, promise });
  return promise;
}

function el(id) { return document.getElementById(id); }

// Names arrive with inconsistent casing depending on source (roster
// upload already uppercases on save, but the Google-account-name
// fallback and submissions.studentName don't) - normalize how they
// *display* everywhere, without touching the stored value.
function displayStudentName(name) { return (name || "").toUpperCase(); }

// Word-by-word match, order-independent and punctuation-insensitive, so
// "narvasa lhian" matches a roster name stored as "Narvasa, Lhian M." -
// every typed word just has to appear somewhere in the name.
function matchesNameSearch(name, query) {
  const words = (s) => (s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  const queryWords = words(query);
  if (queryWords.length === 0) return true;
  const nameWords = words(name);
  return queryWords.every((qw) => nameWords.some((nw) => nw.includes(qw)));
}

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

// Canonical production origin. Join links / QR must point here no matter
// which host the teacher generated them from (localhost, a Vercel preview
// URL, or the old github.io copy) - otherwise a link minted off-domain
// leads students to a stale/dead address. Update if the production domain
// ever changes.
const APP_BASE_URL = "https://deped-class-submissions.vercel.app/";

function joinLinkFor(joinCode) {
  return new URL(`student.html?code=${joinCode}`, APP_BASE_URL).href;
}

// Ready-to-paste announcement for a new assignment. The channel students
// actually reach (Messenger group) - complements the EmailJS notify path,
// which misses students with no email. Uses state stashed by openSection().
function buildAssignmentAnnouncement(a) {
  return [
    `📌 New assignment: ${a.title}`,
    `Class: ${state.subjectName || "—"} — ${state.sectionName || "—"}`,
    `Due: ${a.dueDate || "no deadline"}`,
    state.joinCode ? `Open/join here: ${joinLinkFor(state.joinCode)}` : "",
  ].filter(Boolean).join("\n");
}

// Hand the announcement to the native share sheet (phone -> Messenger
// group in one tap); fall back to clipboard, then a plain alert - same
// progressive-fallback pattern as index.html's Copy link button. Never
// throws (a cancelled share sheet rejects, which we swallow).
async function shareAnnouncement(text) {
  if (navigator.share) {
    try { await navigator.share({ text }); return; } catch { /* cancelled or unsupported - fall through */ }
  }
  copyAnnouncement(text);
}

// Always copy, never share sheet - the desktop path, where the native share
// sheet lists only installed desktop apps (no Messenger/Facebook). Teacher
// pastes into Messenger/Facebook in the browser instead.
async function copyAnnouncement(text) {
  try {
    await navigator.clipboard.writeText(text);
    alert("Copied — paste it into Messenger or Facebook.");
  } catch {
    alert(text);
  }
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
  // Read the section's join code first so its joinCodes pointer doc can be
  // removed too - otherwise the code orphans (a dead pointer to a deleted
  // section, and the code stays reserved against genUniqueJoinCode()).
  const secSnap = await getDoc(doc(db, "sections", sectionId));
  const joinCode = secSnap.exists() ? secSnap.data().joinCode : null;
  const assignSnap = await getDocs(query(collection(db, "assignments"), where("sectionId", "==", sectionId)));
  await Promise.all(assignSnap.docs.map((d) => cascadeDeleteAssignment(d.id)));
  await deleteWhere("enrollments", "sectionId", sectionId);
  await deleteDoc(doc(db, "sections", sectionId));
  if (joinCode) await deleteDoc(doc(db, "joinCodes", joinCode)).catch(() => {});
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
    cachedOwnerDocs("sections", "sections"),
    cachedOwnerDocs("assignments", "assignments"),
    cachedOwnerDocs("subs:pending", "submissions", where("status", "==", "pending")),
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
    cachedOwnerDocs("sections", "sections"),
    cachedOwnerDocs("enr:leave", "enrollments", where("leaveRequested", "==", true)),
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
  // Remembers this section applied this list, so future enrollees can be
  // synced back into it automatically - see syncEnrolleesToMasterList().
  await updateDoc(doc(db, "sections", sectionId), { masterListId: listId });

  return { invited: toInvite.length, skippedEnrolled, skippedInvited };
}

// Add-student panel (Show QR / Invite by email / Apply a saved student
// list) - lives inside an opened section (#view-section, #add-student-panel)
// rather than on the section-list card, so it's visible right where a
// teacher looks for it instead of needing to be found before clicking Open.
function renderAddStudentPanel(container, sectionId, section, pendingInvites, masterLists) {
  container.innerHTML = `
    <details style="margin-top:0.5rem;" data-qr-toggle="${sectionId}">
      <summary class="muted" style="cursor:pointer;">Show QR</summary>
      <div style="margin-top:0.5rem;">
        <p class="muted" style="margin:0 0 0.35rem;"><strong>${state.subjectName || "—"}</strong> — ${section.sectionName}</p>
        <div id="qr-${sectionId}" class="qr-code"></div>
        <p class="muted">Scan to join, or share this link:<br>
          <a href="${joinLinkFor(section.joinCode)}" target="_blank" rel="noopener">${joinLinkFor(section.joinCode)}</a></p>
        <button type="button" class="secondary" data-copy-join="${joinLinkFor(section.joinCode)}">Copy join link</button>
        <p class="muted" style="font-size:0.85em;">Tip for students: after scanning, tap "Open in Safari/Chrome" on the banner that pops up — don't use the in-scanner preview, sign-in won't work there.</p>
      </div>
    </details>
    <details style="margin-top:0.5rem;">
      <summary class="muted" style="cursor:pointer;">Invite by email</summary>
      <div style="margin-top:0.5rem;">
        <p class="muted" style="margin:0 0 0.5rem;">Adds a student by their Gmail address — they're enrolled automatically the moment they sign in with that address, no email/click-to-accept step needed. Use this for students who can't reliably use the join code/QR.</p>
        <form class="invite-form">
          <label>Student's Gmail address</label>
          <input class="invite-email" type="email" required placeholder="name@gmail.com" />
          <label>Student's name (as it should appear on your roster)</label>
          ${section.roster?.length ? `
          <select class="invite-name-select">
            ${section.roster.map((r) => (typeof r === "string" ? r : r.name)).map((name) => `<option value="${name}">${name}</option>`).join("")}
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
        <button type="button" class="apply-master-list-btn">Invite everyone in this list</button>` : `
        <p class="muted">No saved lists yet — build one from an already-enrolled section's Enrolled Students page, or add one from Student Lists in the header.</p>`}
        <p class="apply-master-list-message muted"></p>
      </div>
    </details>`;

  // QR draw deferred until the "Show QR" <details> is actually opened -
  // most teachers never open it, so this also skips loading qrcodejs
  // (see loadScriptOnce()) until it's really needed.
  let qrRendered = false;
  container.querySelector("[data-qr-toggle]").addEventListener("toggle", async (e) => {
    if (!e.target.open || qrRendered) return;
    qrRendered = true;
    await loadScriptOnce(QRCODEJS_CDN_URL);
    renderSectionQR(sectionId, section.joinCode, `${state.subjectName || "—"} — ${section.sectionName}`);
  });
  container.querySelectorAll("[data-copy-join]").forEach((b) =>
    b.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(b.dataset.copyJoin);
        const prev = b.textContent;
        b.textContent = "Copied!";
        setTimeout(() => { b.textContent = prev; }, 1500);
      } catch {
        // Clipboard API blocked (insecure context / old browser) - hand
        // the link to a prompt so the teacher can copy it by hand.
        prompt("Copy this join link:", b.dataset.copyJoin);
      }
    }));
  const nameSelect = container.querySelector(".invite-name-select");
  if (nameSelect) {
    const textInput = nameSelect.parentElement.querySelector(".invite-name");
    const sync = () => {
      const isOther = nameSelect.value === "__other__";
      textInput.style.display = isOther ? "" : "none";
      textInput.required = isOther;
      if (isOther) textInput.focus();
    };
    nameSelect.addEventListener("change", sync);
    sync();
  }
  container.querySelector(".invite-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const email = form.querySelector(".invite-email").value.trim().toLowerCase();
    const select = form.querySelector(".invite-name-select");
    const studentName = (select && select.value !== "__other__"
      ? select.value
      : form.querySelector(".invite-name").value).trim();
    const msg = container.querySelector(".invite-message");
    const btn = form.querySelector("button");
    btn.disabled = true;
    try {
      await addDoc(collection(db, "invites"), {
        studentEmail: email,
        studentName,
        subjectId: state.subjectId,
        subjectName: state.subjectName,
        sectionId,
        sectionName: section.sectionName,
        teacherName: state.subjectOwnerName,
        ownerEmail: state.viewAsEmail,
        createdAt: serverTimestamp(),
      });
      msg.textContent = `Invited ${studentName} — they'll join automatically once they sign in with ${email}.`;
      await refreshAddStudentPanel(sectionId, container);
    } catch (err) {
      msg.textContent = "Invite failed: " + err.message;
      btn.disabled = false;
    }
  });
  container.querySelectorAll("[data-cancel-invite]").forEach((b) =>
    b.addEventListener("click", async () => {
      await deleteDoc(doc(db, "invites", b.dataset.cancelInvite));
      await refreshAddStudentPanel(sectionId, container);
    }));
  const applyBtn = container.querySelector(".apply-master-list-btn");
  if (applyBtn) {
    applyBtn.addEventListener("click", async () => {
      const select = applyBtn.parentElement.querySelector(".master-list-select");
      const listId = select.value;
      if (!listId) return;
      const msg = container.querySelector(".apply-master-list-message");
      applyBtn.disabled = true;
      msg.textContent = "Inviting...";
      try {
        const result = await applyMasterListToSection(listId, sectionId, section.sectionName, pendingInvites);
        msg.textContent = `Invited ${result.invited}. Skipped ${result.skippedEnrolled} already enrolled, ${result.skippedInvited} already invited.`;
        await refreshAddStudentPanel(sectionId, container);
      } catch (err) {
        msg.textContent = "Couldn't apply list: " + err.message;
        applyBtn.disabled = false;
      }
    });
  }
}

async function refreshAddStudentPanel(sectionId, container) {
  const section = (await getDoc(doc(db, "sections", sectionId))).data();
  const [invitesBySection, masterLists] = await Promise.all([getPendingInvites(), getMasterLists()]);
  renderAddStudentPanel(container, sectionId, section, invitesBySection.get(sectionId) || [], masterLists);
}

// Keeps a section's linked master list caught up with newly enrolled
// students, so "Build list from section" doesn't need re-running by hand
// every time someone new joins. Never touches an existing list entry -
// same no-clobber rule as buildMasterListFromSection's initial snapshot.
async function syncEnrolleesToMasterList(sectionData, enrollments) {
  if (!sectionData.masterListId) return null;
  const listRef = doc(db, "masterLists", sectionData.masterListId);
  const listSnap = await getDoc(listRef);
  if (!listSnap.exists()) return null;
  const list = listSnap.data();
  const existingEmails = new Set((list.students || []).map((s) => (s.email || "").toLowerCase()));
  const newStudents = [];
  for (const e of enrollments) {
    const email = (e.studentEmail || "").toLowerCase();
    if (!email || existingEmails.has(email)) continue;
    existingEmails.add(email);
    newStudents.push({ name: e.studentName, email, gender: "" });
  }
  if (newStudents.length > 0) {
    await updateDoc(listRef, {
      students: [...(list.students || []), ...newStudents],
      updatedAt: serverTimestamp(),
    });
  }
  return { listName: list.name, synced: newStudents.length };
}

// Pulls current names from live enrollments into a saved master list -
// list entries are snapshots taken when the list was built/synced, so a
// student who later fixed their name (renameStudentEverywhere updates
// enrollments + submissions, never the master list) leaves the list stale.
// Matches by email (the stable key; names change, emails don't); entries
// with no email or no matching enrollment are left as-is.
async function refreshMasterListNames(listId) {
  const enrollSnap = await getDocs(ownerScopedQuery("enrollments"));
  const nameByEmail = new Map();
  enrollSnap.docs.filter((d) => ownedByViewAs(d.data())).forEach((d) => {
    const e = d.data();
    const email = (e.studentEmail || "").toLowerCase();
    if (email && e.studentName) nameByEmail.set(email, e.studentName);
  });
  const list = (await getDoc(doc(db, "masterLists", listId))).data();
  let changed = 0;
  const students = (list.students || []).map((s) => {
    const fresh = nameByEmail.get((s.email || "").toLowerCase());
    if (fresh && fresh !== s.name) { changed++; return { ...s, name: fresh }; }
    return s;
  });
  if (changed > 0) await updateDoc(doc(db, "masterLists", listId), { students, updatedAt: serverTimestamp() });
  return changed;
}

// Order/punctuation/case-insensitive name parts: "MERCADO, NATHANIEL G."
// and "Nathaniel Mercado G" tokenize to the same set. Basis for both dedupe
// name-matching and look-alike flagging below.
function nameTokens(name) {
  return (name || "").replace(/[.,]/g, " ").trim().split(/\s+/).filter(Boolean).map((t) => t.toUpperCase());
}
// Strict signature - every token kept (middle initials stay significant),
// only order/case/punctuation ignored. Two names match only when they carry
// the exact same set of parts. Used for *auto-removal*.
function normalizeName(name) {
  return nameTokens(name).sort().join(" ");
}
// Loose signature for *review flagging only*, never auto-removal: drops
// single-letter tokens (middle initials), so "MERCADO, NATHANIEL G." and
// "Nathaniel Mercado" collapse to one person key. Safe to be loose here
// because the teacher confirms every removal by hand.
function personKey(name) {
  const full = nameTokens(name);
  const trimmed = full.filter((t) => t.length > 1);
  return (trimmed.length ? trimmed : full).sort().join(" ");
}

// Removes only *certain* duplicates - same email (case/space-insensitive),
// or, for blank-email manual entries, the same normalized name - keeping the
// first occurrence. Look-alikes that differ by email or middle initial are
// deliberately left in place for findMasterListSuspects() to surface for
// manual review, so a genuinely distinct student is never silently dropped.
async function dedupeMasterList(listId) {
  const list = (await getDoc(doc(db, "masterLists", listId))).data();
  const seen = new Set();
  const kept = [];
  for (const s of list.students || []) {
    const email = (s.email || "").trim().toLowerCase();
    const key = email ? `email:${email}` : `name:${normalizeName(s.name)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(s);
  }
  const removed = (list.students || []).length - kept.length;
  if (removed > 0) await updateDoc(doc(db, "masterLists", listId), { students: kept, updatedAt: serverTimestamp() });
  return removed;
}

// Groups the (post-dedupe) list by loose person key and returns every group
// with 2+ members - suspected same-person entries that differ by email or
// middle initial, for the teacher to review and prune by hand.
async function findMasterListSuspects(listId) {
  const list = (await getDoc(doc(db, "masterLists", listId))).data();
  const groups = new Map();
  (list.students || []).forEach((s) => {
    const key = personKey(s.name);
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  });
  return [...groups.values()].filter((g) => g.length > 1);
}

// Removes one entry (matched by name + email) from a saved list - backs the
// per-row Remove buttons in the look-alike review panel.
async function removeStudentFromMasterList(listId, name, email) {
  const list = (await getDoc(doc(db, "masterLists", listId))).data();
  const students = list.students || [];
  const idx = students.findIndex((s) => s.name === name && (s.email || "") === (email || ""));
  if (idx === -1) return;
  students.splice(idx, 1);
  await updateDoc(doc(db, "masterLists", listId), { students, updatedAt: serverTimestamp() });
}

let lastNotifications = { submissions: [], leaves: [], totalCount: 0, error: false };

// One combined fetch that resolves ids to display names (unlike
// getPendingCounts()/getLeaveRequestCounts() above, which only need ids
// because they're rendered inside a view that already has that context)
// - this powers the header-wide notification dropdown, which has no
// surrounding context of its own.
async function getNotifications() {
  // Landing entry point: start each refresh with a clean read cache so badges
  // reflect current data, then let the loadSubjects() rollups that follow reuse
  // these same fetches instead of re-scanning the account (see cachedOwnerDocs).
  invalidateReadCache();
  const [subjectsSnap, sectionsSnap, assignSnap, pendingSnap, leaveSnap, joinSnap, redoSnap] = await Promise.all([
    cachedOwnerDocs("subjects", "subjects"),
    cachedOwnerDocs("sections", "sections"),
    cachedOwnerDocs("assignments", "assignments"),
    cachedOwnerDocs("subs:pending", "submissions", where("status", "==", "pending")),
    cachedOwnerDocs("enr:leave", "enrollments", where("leaveRequested", "==", true)),
    cachedOwnerDocs("enr:seen", "enrollments", where("seen", "==", false)),
    cachedOwnerDocs("subs:resubmit", "submissions", where("resubmitRequested", "==", true)),
  ]);

  const subjectNames = new Map(subjectsSnap.docs.map((d) => [d.id, d.data().name]));
  const sections = new Map(sectionsSnap.docs.map((d) => [d.id, d.data()]));
  const assignments = new Map(assignSnap.docs.map((d) => [d.id, d.data()]));

  // Orphan-notification filter: a stray submission/enrollment doc whose
  // parent subject/section/assignment was deleted (old data predating the
  // cascade delete, or a partial cascade) otherwise renders as a dead
  // "(deleted subject) > (deleted section)" row that goes nowhere useful
  // when clicked. Hide any notification whose parent chain is broken.
  // Display-only - the underlying docs are left untouched.
  const sectionAlive = (sectionId) => {
    const s = sections.get(sectionId);
    return !!s && subjectNames.has(s.subjectId);
  };
  const assignmentAlive = (assignmentId) => {
    const a = assignments.get(assignmentId);
    return !!a && sectionAlive(a.sectionId);
  };

  const submissionCounts = new Map();
  pendingSnap.forEach((d) => {
    if (!ownedByViewAs(d.data())) return; // admin's unfiltered submissions query includes every teacher's - narrow to mine/legacy
    const assignmentId = d.data().assignmentId;
    submissionCounts.set(assignmentId, (submissionCounts.get(assignmentId) || 0) + 1);
  });
  const submissions = [...submissionCounts.entries()].filter(([assignmentId]) => assignmentAlive(assignmentId)).map(([assignmentId, count]) => {
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
  const leaves = [...leaveCounts.entries()].filter(([sectionId]) => sectionAlive(sectionId)).map(([sectionId, count]) => {
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
  const joins = [...joinsBySection.entries()].filter(([sectionId]) => sectionAlive(sectionId)).map(([sectionId, students]) => {
    const section = sections.get(sectionId) || {};
    return {
      sectionId,
      subjectId: section.subjectId,
      sectionName: section.sectionName || "(deleted section)",
      subjectName: subjectNames.get(section.subjectId) || "(deleted subject)",
      students,
    };
  });

  // Redo requests - a student asked to reopen a graded submission (see
  // js/student.js's "Request to redo"). Grouped by assignment, same shape as
  // pending submissions above.
  const redoCounts = new Map();
  redoSnap.forEach((d) => {
    if (!ownedByViewAs(d.data())) return; // admin's unfiltered submissions query includes every teacher's - narrow to mine/legacy
    const assignmentId = d.data().assignmentId;
    redoCounts.set(assignmentId, (redoCounts.get(assignmentId) || 0) + 1);
  });
  const redos = [...redoCounts.entries()].filter(([assignmentId]) => assignmentAlive(assignmentId)).map(([assignmentId, count]) => {
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

  const totalCount =
    submissions.reduce((sum, s) => sum + s.count, 0) +
    leaves.reduce((sum, l) => sum + l.count, 0) +
    joins.reduce((sum, j) => sum + j.students.length, 0) +
    redos.reduce((sum, r) => sum + r.count, 0);

  return { submissions, leaves, joins, redos, totalCount };
}

async function refreshNotifications() {
  try {
    const data = await getNotifications();
    lastNotifications = { ...data, error: false, errorDetail: null };
  } catch (err) {
    console.error("notifications load failed (bell badge only):", err);
    lastNotifications = { ...lastNotifications, error: true, errorDetail: err };
  }
  const countEl = el("notif-count");
  countEl.textContent = lastNotifications.totalCount;
  countEl.classList.toggle("hidden", lastNotifications.totalCount === 0);
}

function closeNotifDropdown() {
  el("notif-dropdown").classList.add("hidden");
}

// Header dropdowns (notifications, photo ZIPs, global search) are position:fixed
// and placed from the trigger's rect on open, so they stay fully on-screen no
// matter where the wrapping flex header pushes the trigger. Fixes the old bug
// where a `right:0` panel grew off the left edge once the header wrapped.
// matchWidth: search suggestions span the (wide) search box; bell panels keep
// their natural width, right-aligned to the trigger then clamped to the viewport.
function positionDropdown(anchorEl, dropdownEl, matchWidth = false) {
  const r = anchorEl.getBoundingClientRect();
  const margin = 8;
  dropdownEl.style.position = "fixed";
  dropdownEl.style.top = `${r.bottom + 6}px`;
  dropdownEl.style.right = "auto";
  if (matchWidth) {
    const width = Math.min(r.width, window.innerWidth - 2 * margin);
    dropdownEl.style.width = `${width}px`;
    dropdownEl.style.left = `${Math.max(margin, Math.min(r.left, window.innerWidth - width - margin))}px`;
  } else {
    const width = Math.min(dropdownEl.offsetWidth || 280, window.innerWidth - 2 * margin);
    const left = Math.max(margin, Math.min(r.right - width, window.innerWidth - width - margin));
    dropdownEl.style.left = `${left}px`;
  }
}

function renderNotifDropdown() {
  const { submissions, leaves, joins, redos = [], error } = lastNotifications;
  const dropdown = el("notif-dropdown");

  if (error) {
    dropdown.innerHTML = '<p class="muted" style="padding:0.5rem 0.75rem;">Couldn\'t load notifications.</p>';
    return;
  }
  if (submissions.length === 0 && leaves.length === 0 && joins.length === 0 && redos.length === 0) {
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
  const redoRows = redos.map((r) => `
    <button class="notif-item" data-goto-assignment="${r.subjectId}|${r.sectionId}|${r.assignmentId}">
      ${r.title} <span class="muted">(${r.subjectName} &rsaquo; ${r.sectionName})</span> — ${r.count} redo request${r.count > 1 ? "s" : ""}
    </button>`).join("");

  dropdown.innerHTML =
    (joins.length ? `<div class="notif-group-label">New joins</div>${joinRows}` : "") +
    (redos.length ? `<div class="notif-group-label">Redo requests</div>${redoRows}` : "") +
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
  positionDropdown(el("notif-bell"), dropdown);
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
// Powers the Home dashboard's "Not responding" overview - unlike the
// Records grid (one section at a time, keyed off a manually-set roster)
// this scans every non-archived subject/section the teacher owns and
// flags real enrollments (not a roster or master list) with at least one
// missing submission, so it works even for sections with no roster or
// master list set up at all.
async function getEnrollmentNotRespondingOverview() {
  // Fetch each collection ONCE and compute the overview in memory, instead of
  // the previous per-subject/per-section/per-assignment query fan-out (which
  // fired a submissions query per assignment - an N+1 that ran on every
  // Master-Lists open). subjects/sections/assignments come warm from the
  // landing's read cache; only the two "all" scans (enrollments, submissions)
  // are new. cachedOwnerDocs already scopes every fetch to the viewed owner.
  const [subjSnap, sectSnapAll, assignSnapAll, enrollSnapAll, subSnapAll] = await Promise.all([
    cachedOwnerDocs("subjects", "subjects"),
    cachedOwnerDocs("sections", "sections"),
    cachedOwnerDocs("assignments", "assignments"),
    cachedOwnerDocs("enr:all", "enrollments"),
    cachedOwnerDocs("subs:all", "submissions"),
  ]);

  const subjects = subjSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((s) => ownedByViewAs(s) && !s.archived);

  // sectionId -> [section], subjectId keyed; assignmentId/section maps; and
  // assignmentId -> Set<studentUID> of who has submitted it (owned subs only).
  const sectionsBySubject = new Map();
  sectSnapAll.docs.filter((d) => ownedByViewAs(d.data())).forEach((d) => {
    const s = { id: d.id, ...d.data() };
    if (!sectionsBySubject.has(s.subjectId)) sectionsBySubject.set(s.subjectId, []);
    sectionsBySubject.get(s.subjectId).push(s);
  });
  const assignmentsBySection = new Map();
  assignSnapAll.docs.filter((d) => ownedByViewAs(d.data())).forEach((d) => {
    const a = { id: d.id, ...d.data() };
    if (!assignmentsBySection.has(a.sectionId)) assignmentsBySection.set(a.sectionId, []);
    assignmentsBySection.get(a.sectionId).push(a);
  });
  const enrollmentsBySection = new Map();
  enrollSnapAll.docs.filter((d) => ownedByViewAs(d.data())).forEach((d) => {
    const e = d.data();
    if (!enrollmentsBySection.has(e.sectionId)) enrollmentsBySection.set(e.sectionId, []);
    enrollmentsBySection.get(e.sectionId).push(e);
  });
  const subUIDsByAssignment = new Map();
  subSnapAll.docs.forEach((d) => {
    const sub = d.data();
    if (!ownedByViewAs(sub)) return;
    if (!subUIDsByAssignment.has(sub.assignmentId)) subUIDsByAssignment.set(sub.assignmentId, new Set());
    subUIDsByAssignment.get(sub.assignmentId).add(sub.studentUID);
  });

  const subjectResults = subjects.map((subject) => {
    const sections = sectionsBySubject.get(subject.id) || [];

    const sectionResults = sections.map((section) => {
      const assignments = assignmentsBySection.get(section.id) || [];
      if (assignments.length === 0) return null; // nothing posted yet, nothing to be missing
      const enrollments = enrollmentsBySection.get(section.id) || [];

      const writtenIds = new Set(assignments.filter((a) => a.component === "written").map((a) => a.id));
      const performanceIds = new Set(assignments.filter((a) => a.component === "performance").map((a) => a.id));

      // studentUID -> Set of assignmentIds they submitted, within this section.
      const submittedByStudent = new Map();
      for (const a of assignments) {
        const uids = subUIDsByAssignment.get(a.id);
        if (!uids) continue;
        uids.forEach((uid) => {
          if (!submittedByStudent.has(uid)) submittedByStudent.set(uid, new Set());
          submittedByStudent.get(uid).add(a.id);
        });
      }

      const rows = enrollments
        .map((e) => {
          const submitted = submittedByStudent.get(e.studentUID) || new Set();
          const writtenMissing = [...writtenIds].filter((id) => !submitted.has(id)).length;
          const performanceMissing = [...performanceIds].filter((id) => !submitted.has(id)).length;
          return {
            name: e.studentName,
            email: e.studentEmail || "",
            writtenMissing,
            writtenTotal: writtenIds.size,
            writtenDone: writtenIds.size - writtenMissing,
            performanceMissing,
            performanceTotal: performanceIds.size,
            performanceDone: performanceIds.size - performanceMissing,
          };
        })
        .filter((r) => r.writtenMissing > 0 || r.performanceMissing > 0)
        .sort((a, b) => (b.writtenMissing + b.performanceMissing) - (a.writtenMissing + a.performanceMissing));

      // Class-wide completion for the progress bar: every submission that's
      // in, over every submission expected (enrolled students x graded
      // assignments). Counts the caught-up students too, unlike `rows`
      // (which lists only those still behind).
      const expectedCount = enrollments.length * (writtenIds.size + performanceIds.size);
      let submittedCount = 0;
      enrollments.forEach((e) => {
        const submitted = submittedByStudent.get(e.studentUID) || new Set();
        writtenIds.forEach((id) => { if (submitted.has(id)) submittedCount++; });
        performanceIds.forEach((id) => { if (submitted.has(id)) submittedCount++; });
      });

      return rows.length > 0 ? { sectionId: section.id, sectionName: section.sectionName, rows, enrolledTotal: enrollments.length, submittedCount, expectedCount } : null;
    });

    const filteredSections = sectionResults.filter(Boolean);
    return filteredSections.length > 0 ? { subjectId: subject.id, subjectName: subject.name, sections: filteredSections } : null;
  });

  return subjectResults.filter(Boolean);
}

function renderNotRespondingOverview(data) {
  if (data.length === 0) return '<p class="muted">No missing activity across your classes.</p>';
  return data.map((subj) => `
    <div style="margin-bottom:1rem;">
      <strong>${subj.subjectName}</strong>
      ${subj.sections.map((sec) => {
        const pct = sec.expectedCount ? Math.round((sec.submittedCount / sec.expectedCount) * 100) : 0;
        return `
        <div style="margin-top:0.5rem;">
          <span class="muted">${sec.sectionName} — ${sec.rows.length} behind of ${sec.enrolledTotal} enrolled</span>
          <div class="progress-track"><div class="progress-fill" style="width:${pct}%;"></div></div>
          <div class="muted" style="font-size:0.85em;">${sec.submittedCount}/${sec.expectedCount} submissions in — ${pct}% complete. Table numbers show submitted / total per student.</div>
          <table class="records-grid"><thead><tr><th>Name</th><th>Email</th><th>Written</th><th>Performance</th></tr></thead><tbody>
            ${sec.rows.map((r) => `<tr><td>${r.name}</td><td>${r.email}</td><td>${r.writtenDone}/${r.writtenTotal}</td><td>${r.performanceDone}/${r.performanceTotal}</td></tr>`).join("")}
          </tbody></table>
        </div>`;
      }).join("")}
    </div>`).join("");
}

async function loadSubjects() {
  // Every path back to the Home view calls this - reset the global search
  // box here too, so a stale query/result list from before navigating away
  // doesn't linger on screen until the teacher notices and clears it by hand.
  el("global-student-search").value = "";
  el("global-search-results").innerHTML = "";
  el("global-search-results").classList.add("hidden");
  searchRequestSeq++; // invalidate any in-flight search so it can't repopulate this after the fact
  const showArchived = el("toggle-archived").checked;
  // The subject list must render even if the (non-essential) pending / leave
  // count badges can't load. Fetch subjects on their own; make the two badge
  // rollups best-effort - a denied or errored rollup query only drops the
  // badges, it never blanks the whole dashboard. (This is what used to make a
  // regular teacher's freshly-created subject silently not show: a failed bell
  // query rejected the shared Promise.all here before any subject rendered.)
  const snap = await getDocs(ownerScopedQuery("subjects"));
  const [counts, leaveCounts] = await Promise.all([
    getPendingCounts().catch((err) => { console.error("pending-count rollup failed (badges only):", err); return { byAssignment: new Map(), bySection: new Map(), bySubject: new Map() }; }),
    getLeaveRequestCounts().catch((err) => { console.error("leave-count rollup failed (badges only):", err); return { bySection: new Map(), bySubject: new Map() }; }),
  ]);
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

// Finds anything the teacher owns matching the typed text - subjects,
// sections, assignments, and student activity (submissions) - from the
// Home dashboard, grouped into suggestion-style rows (same look as the
// notification bell's dropdown, see renderNotifDropdown() above). Each
// keystroke fires its own async lookup, and a slower older request can
// resolve after a faster newer one - searchRequestSeq lets a stale response
// recognize it's been superseded and skip rendering instead of clobbering
// the current query's results.
let searchRequestSeq = 0;
const SEARCH_GROUP_LIMIT = 8; // suggestion-style - not a full results page
async function searchGlobally() {
  const queryText = el("global-student-search").value;
  const results = el("global-search-results");
  const requestId = ++searchRequestSeq;
  if (!queryText.trim()) {
    results.innerHTML = "";
    results.classList.add("hidden");
    return;
  }
  results.classList.remove("hidden");
  positionDropdown(el("global-student-search"), results, true);

  const [subjectsSnap, sectionsSnap, assignmentsSnap, submissionsSnap] = await Promise.all([
    getDocs(ownerScopedQuery("subjects")),
    getDocs(ownerScopedQuery("sections")),
    getDocs(ownerScopedQuery("assignments")),
    getDocs(ownerScopedQuery("submissions")),
  ]);
  if (requestId !== searchRequestSeq) return;

  const subjects = subjectsSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter(ownedByViewAs);
  const sections = sectionsSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter(ownedByViewAs);
  const assignments = assignmentsSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter(ownedByViewAs);
  const submissions = submissionsSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter(ownedByViewAs);

  const subjectsById = new Map(subjects.map((s) => [s.id, s]));
  const sectionsById = new Map(sections.map((s) => [s.id, s]));
  const assignmentsById = new Map(assignments.map((a) => [a.id, a]));

  const matchedSubjects = subjects.filter((s) => matchesNameSearch(s.name, queryText)).slice(0, SEARCH_GROUP_LIMIT);
  const matchedSections = sections.filter((s) => matchesNameSearch(s.sectionName, queryText)).slice(0, SEARCH_GROUP_LIMIT);
  const matchedAssignments = assignments.filter((a) => matchesNameSearch(a.title, queryText)).slice(0, SEARCH_GROUP_LIMIT);
  const matchedStudents = submissions.filter((s) => matchesNameSearch(s.studentName, queryText)).slice(0, SEARCH_GROUP_LIMIT);

  if (!matchedSubjects.length && !matchedSections.length && !matchedAssignments.length && !matchedStudents.length) {
    results.innerHTML = `<p class="muted" style="padding:0.5rem 0.75rem;">No matches.</p>`;
    return;
  }

  const subjectRows = matchedSubjects.map((s) => `
    <button class="notif-item" data-jump-subject="${s.id}">${s.name}</button>`).join("");
  const sectionRows = matchedSections.map((sec) => {
    const subj = subjectsById.get(sec.subjectId) || {};
    return `
      <button class="notif-item" data-jump-section="${sec.subjectId || ""}|${sec.id}">
        ${sec.sectionName} <span class="muted">(${subj.name || "—"})</span>
      </button>`;
  }).join("");
  const assignmentRows = matchedAssignments.map((a) => {
    const sec = sectionsById.get(a.sectionId) || {};
    const subj = subjectsById.get(sec.subjectId) || {};
    return `
      <button class="notif-item" data-jump-assignment-only="${sec.subjectId || ""}|${a.sectionId || ""}|${a.id}">
        ${a.title} <span class="muted">(${subj.name || "—"} &rsaquo; ${sec.sectionName || "—"})</span>
      </button>`;
  }).join("");
  const studentRows = matchedStudents.map((m) => {
    const a = assignmentsById.get(m.assignmentId) || {};
    const sec = sectionsById.get(a.sectionId) || {};
    const subj = subjectsById.get(sec.subjectId) || {};
    return `
      <button class="notif-item" data-jump-student="${sec.subjectId || ""}|${a.sectionId || ""}|${m.assignmentId}">
        ${displayStudentName(m.studentName)} <span class="status-${m.status}">— ${m.status}</span>
        <div class="muted">${subj.name || "—"} &rsaquo; ${sec.sectionName || "—"} &rsaquo; ${a.title || "—"}</div>
      </button>`;
  }).join("");

  results.innerHTML =
    (matchedSubjects.length ? `<div class="notif-group-label">Subjects</div>${subjectRows}` : "") +
    (matchedSections.length ? `<div class="notif-group-label">Sections</div>${sectionRows}` : "") +
    (matchedAssignments.length ? `<div class="notif-group-label">Assignments</div>${assignmentRows}` : "") +
    (matchedStudents.length ? `<div class="notif-group-label">Students</div>${studentRows}` : "");

  results.querySelectorAll("[data-jump-subject]").forEach((b) =>
    b.addEventListener("click", () => openSubject(b.dataset.jumpSubject)));

  results.querySelectorAll("[data-jump-section]").forEach((b) =>
    b.addEventListener("click", async () => {
      const [subjectId, sectionId] = b.dataset.jumpSection.split("|");
      if (!subjectId) { alert("Can't open this - its subject was deleted."); return; }
      await openSubject(subjectId);
      await openSection(sectionId);
    }));

  results.querySelectorAll("[data-jump-assignment-only]").forEach((b) =>
    b.addEventListener("click", async () => {
      const [subjectId, sectionId, assignmentId] = b.dataset.jumpAssignmentOnly.split("|");
      if (!subjectId || !sectionId) { alert("Can't open this - its section or subject was deleted."); return; }
      await goToAssignment(subjectId, sectionId, assignmentId);
    }));

  results.querySelectorAll("[data-jump-student]").forEach((b) =>
    b.addEventListener("click", async () => {
      const [subjectId, sectionId, assignmentId] = b.dataset.jumpStudent.split("|");
      if (!subjectId || !sectionId) { alert("Can't open this - its section or subject was deleted."); return; }
      await openSubject(subjectId);
      await openSection(sectionId);
      highlightStudentName = queryText;
      await openAssignment(assignmentId);
    }));
}
el("global-student-search").addEventListener("input", searchGlobally);

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
  const [snap, counts, leaveCounts] = await Promise.all([
    getDocs(q), getPendingCounts(), getLeaveRequestCounts(),
  ]);
  const list = el("sections-list");
  list.innerHTML = "";
  const sectionNames = new Map(); // id -> name, for the delete-confirm prompt below
  snap.forEach((d) => {
    const s = d.data();
    sectionNames.set(d.id, s.sectionName);
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
      </div>`;
    list.appendChild(row);
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

// Pick a join code not already taken by an existing joinCodes pointer doc.
// genJoinCode() has no uniqueness guarantee on its own, and the code is the
// joinCodes doc id, so a collision would make one section un-joinable.
async function genUniqueJoinCode() {
  for (let i = 0; i < 8; i++) {
    const code = genJoinCode();
    if (!(await getDoc(doc(db, "joinCodes", code))).exists()) return code;
  }
  // Astronomically unlikely after 8 tries; fall through with a longer code.
  return genJoinCode() + genJoinCode().slice(0, 2);
}

el("add-section-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const joinCode = await genUniqueJoinCode();
  const ref = await addDoc(collection(db, "sections"), {
    subjectId: state.subjectId,
    sectionName: el("section-name").value.trim(),
    joinCode,
    ownerEmail: state.viewAsEmail,
  });
  // Pointer doc so students resolve this code by get() instead of listing the
  // whole sections collection (see firestore.rules joinCodes + sections split).
  // Best-effort: if the joinCodes rules aren't deployed yet (or a transient
  // error), the section is still created and the admin backfill / student
  // fallback query cover it - don't fail section creation over the pointer.
  try {
    await setDoc(doc(db, "joinCodes", joinCode), { sectionId: ref.id, ownerEmail: state.viewAsEmail });
  } catch (_) { /* pointer is best-effort; backfill + join fallback cover it */ }
  alert("Section added.");
  e.target.reset();
  loadSections();
});

// One-time admin migration: create a joinCodes pointer for every EXISTING
// section (new sections self-register above). Run once after deploy, before
// locking sections read. Idempotent - safe to re-run. Admin only (button is in
// the admin-only Settings block); relies on isSuperAdmin reading all sections.
el("migrate-joincodes-btn").addEventListener("click", async () => {
  const btn = el("migrate-joincodes-btn");
  const msg = el("migrate-joincodes-message");
  btn.disabled = true;
  msg.textContent = "Migrating...";
  try {
    const snap = await getDocs(collection(db, "sections"));
    let created = 0, noCode = 0;
    const seen = new Map(); // joinCode -> sectionId, to catch shared-code collisions
    const collisions = [];
    for (const d of snap.docs) {
      const s = d.data();
      const code = s.joinCode;
      if (!code) { noCode++; continue; }
      if (seen.has(code) && seen.get(code) !== d.id) { collisions.push(code); continue; }
      seen.set(code, d.id);
      await setDoc(doc(db, "joinCodes", code), { sectionId: d.id, ownerEmail: s.ownerEmail || ADMIN_EMAIL });
      created++;
    }
    msg.textContent = `Done. ${created} join code(s) migrated`
      + (noCode ? `, ${noCode} section(s) had no code` : "")
      + (collisions.length
          ? `. COLLISIONS - these codes are shared by 2+ sections and need a manual code change: ${collisions.join(", ")}`
          : ". No collisions.");
  } catch (err) {
    msg.textContent = "Migration failed: " + err.message;
  } finally {
    btn.disabled = false;
  }
});

// ---------- enrolled students (subject-wide, all its sections) ----------
// onlySectionId scopes the list to one section (called from view-section);
// omitted, it's subject-wide across all that subject's sections (called
// from view-subject) - same table either way, just a different source query
// and back-button target.
let enrolledBackView = "view-subject";
let enrolledSectionId = null; // set below when this is a single-section view - lets #build-master-list-btn know what to build from
async function openEnrolled(onlySectionId) {
  let sectionMap, titleText, sectionData;
  if (onlySectionId) {
    sectionData = (await getDoc(doc(db, "sections", onlySectionId))).data();
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

  let masterListNote = "";
  let masterListLinkControl = "";
  if (onlySectionId) {
    const syncResult = await syncEnrolleesToMasterList(sectionData, rows);
    if (syncResult && syncResult.synced > 0) {
      masterListNote = `<p class="muted">Synced ${syncResult.synced} new student${syncResult.synced === 1 ? "" : "s"} to master list "${syncResult.listName}".</p>`;
    }
    const lists = await getMasterLists();
    masterListLinkControl = `
      <div class="card">
        <label>Linked master list</label>
        <select id="master-list-link-select">
          <option value="">— None (unlinked) —</option>
          ${lists.map((l) => `<option value="${l.id}" ${l.id === sectionData.masterListId ? "selected" : ""}>${l.name}</option>`).join("")}
        </select>
        <p class="muted">Students who join this section are added to the linked list automatically. Change or clear it here anytime.</p>
        ${masterListNote}
      </div>`;
  }

  // Super admin only: open a read-only preview of what this student sees on
  // their own dashboard (js/student.js's ?asStudentUID= view). Regular teachers
  // never see this control.
  const canViewAsStudent = currentUser && isSuperAdmin(currentUser.email);
  list.innerHTML = masterListLinkControl + (rows.length
    ? `<table class="records-grid"><thead><tr><th>#</th><th>Name</th><th>Gmail</th><th>Section</th><th></th></tr></thead><tbody>
        ${rows.map((r, i) => `<tr><td>${i + 1}</td><td id="enroll-name-${r.id}">${displayStudentName(r.studentName)}${r.leaveRequested ? ' <span class="status-pending">(leave requested)</span>' : ""}</td><td>${r.studentEmail || ""}</td><td>${sectionMap.get(r.sectionId) || ""}</td><td>
          <button class="secondary" data-edit-enrollment="${r.id}" data-uid="${r.studentUID}" data-raw="${r.studentName}">Edit name</button>
          ${canViewAsStudent ? `<button class="secondary" data-view-as="${r.studentUID}" data-vemail="${r.studentEmail || ""}" data-vname="${r.studentName || ""}" title="Open this student's page (read-only)">View as</button>` : ""}
          <button class="danger icon" data-remove-enrollment="${r.id}" data-leave-requested="${!!r.leaveRequested}" title="Remove" aria-label="Remove enrollment">×</button>
        </td></tr>`).join("")}
      </tbody></table>`
    : '<p class="muted">No students enrolled yet.</p>');

  list.querySelectorAll("[data-view-as]").forEach((b) =>
    b.addEventListener("click", () => {
      const url = `student.html?asStudentUID=${encodeURIComponent(b.dataset.viewAs)}` +
        `&asStudentEmail=${encodeURIComponent(b.dataset.vemail)}` +
        `&asStudentName=${encodeURIComponent(b.dataset.vname)}`;
      window.open(url, "_blank", "noopener");
    }));

  const linkSelect = el("master-list-link-select");
  if (linkSelect) {
    linkSelect.addEventListener("change", async () => {
      const newListId = linkSelect.value || null;
      await updateDoc(doc(db, "sections", onlySectionId), { masterListId: newListId });
      alert(newListId ? "Linked to that master list." : "Unlinked.");
      openEnrolled(onlySectionId);
    });
  }

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
    const listRef = await addDoc(collection(db, "masterLists"), {
      ownerEmail: state.viewAsEmail,
      name: trimmed,
      students: candidates.map((e) => ({ name: e.studentName, email: e.studentEmail.toLowerCase(), gender: "" })),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    // Links this section to the list it was just built from, so future
    // enrollees sync back into it automatically - see syncEnrolleesToMasterList().
    await updateDoc(doc(db, "sections", sectionId), { masterListId: listRef.id });
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
  // Kept on state so loadAssignments() can build a shareable announcement
  // (title + class + due + join link) without re-fetching the section.
  state.joinCode = section.joinCode;
  state.sectionName = section.sectionName;
  // Managed, ordered topics for this section (groups the student outline).
  state.topics = Array.isArray(section.topics) ? section.topics.slice() : [];
  renderTopicsPanel();
  refreshLessonSelects();

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

  // Fired off without blocking the section from opening - invites/master-list
  // reads are extra round-trips on top of the section doc itself, and
  // gating show("view-section") on them made "Open" feel frozen on slow
  // connections. state.sectionId guard drops a stale response if the
  // teacher already navigated to a different section before this resolves.
  el("add-student-panel").innerHTML = '<p class="muted">Loading…</p>';
  Promise.all([getPendingInvites(), getMasterLists()])
    .then(([invitesBySection, masterLists]) => {
      if (state.sectionId !== sectionId) return;
      renderAddStudentPanel(el("add-student-panel"), sectionId, section, invitesBySection.get(sectionId) || [], masterLists);
    })
    .catch((err) => {
      if (state.sectionId !== sectionId) return;
      el("add-student-panel").innerHTML = `<p class="muted">Couldn't load: ${err.message}</p>`;
    });
}

// ---------- managed, reorderable topics (per section) ----------
// Topics live as an ordered string[] on the section doc (state.topics). They
// group a post in the student's course outline: a post's topic is stored in
// its `lesson` field (unchanged, so legacy free-text lessons still work), and
// the section's ordered topics array is what sequences the outline. No new
// collection and no firestore.rules change - a section update is already
// owner-scoped.
function escAttr(s) { return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

// Options for a topic <select>: a "no topic" default, every managed topic,
// and (so an edit never loses a legacy value) the current value if unlisted.
function topicOptionsHtml(current) {
  const cur = current || "";
  const names = state.topics.slice();
  if (cur && !names.includes(cur)) names.push(cur);
  return `<option value="">— No topic (General) —</option>` +
    names.map((t) => `<option value="${escAttr(t)}"${t === cur ? " selected" : ""}>${escAttr(t)}</option>`).join("");
}
function refreshLessonSelects() {
  const c = el("assignment-lesson"); if (c) c.innerHTML = topicOptionsHtml(c.value);
  const e = el("edit-assignment-lesson"); if (e) e.innerHTML = topicOptionsHtml(e.value);
}

async function saveTopics() {
  await updateDoc(doc(db, "sections", state.sectionId), { topics: state.topics });
  renderTopicsPanel();
  refreshLessonSelects();
}

function renderTopicsPanel() {
  const panel = el("topics-panel");
  if (!panel) return;
  if (state.topics.length === 0) {
    panel.innerHTML = '<p class="muted">No topics yet. Add one below — posts without a topic fall under "General".</p>';
    return;
  }
  panel.innerHTML = state.topics.map((t, i) => `
    <div class="topic-row">
      <span class="topic-name">${escAttr(t)}</span>
      <span class="topic-actions">
        <button type="button" class="secondary" data-topic-up="${i}"${i === 0 ? " disabled" : ""} title="Move up" aria-label="Move up">&#8593;</button>
        <button type="button" class="secondary" data-topic-down="${i}"${i === state.topics.length - 1 ? " disabled" : ""} title="Move down" aria-label="Move down">&#8595;</button>
        <button type="button" class="secondary" data-topic-rename="${i}">Rename</button>
        <button type="button" class="danger icon" data-topic-del="${i}" title="Remove topic" aria-label="Remove topic">&times;</button>
      </span>
    </div>`).join("");
  panel.querySelectorAll("[data-topic-up]").forEach((b) => b.addEventListener("click", () => moveTopic(+b.dataset.topicUp, -1)));
  panel.querySelectorAll("[data-topic-down]").forEach((b) => b.addEventListener("click", () => moveTopic(+b.dataset.topicDown, 1)));
  panel.querySelectorAll("[data-topic-rename]").forEach((b) => b.addEventListener("click", () => renameTopic(+b.dataset.topicRename)));
  panel.querySelectorAll("[data-topic-del]").forEach((b) => b.addEventListener("click", () => deleteTopic(+b.dataset.topicDel)));
}

function moveTopic(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= state.topics.length) return;
  [state.topics[i], state.topics[j]] = [state.topics[j], state.topics[i]];
  saveTopics().then(() => loadAssignments());
}

async function deleteTopic(i) {
  const name = state.topics[i];
  if (!confirm(`Remove the topic "${name}" from the ordered list? Posts under it keep the label and still show — they just lose the managed order.`)) return;
  state.topics.splice(i, 1);
  await saveTopics();
}

async function renameTopic(i) {
  const oldName = state.topics[i];
  const next = prompt(`Rename topic "${oldName}" to:`, oldName);
  if (next === null) return;
  const newName = next.trim();
  if (!newName || newName === oldName) return;
  if (state.topics.includes(newName)) { alert("A topic with that name already exists."); return; }
  state.topics[i] = newName;
  await saveTopics();
  // Repoint every post that was under the old topic name to the new one.
  const snap = await getDocs(query(collection(db, "assignments"), where("sectionId", "==", state.sectionId)));
  const targets = snap.docs.filter((d) => ownedByViewAs(d.data()) && (d.data().lesson || "") === oldName);
  await Promise.all(targets.map((d) => updateDoc(doc(db, "assignments", d.id), { lesson: newName })));
  loadAssignments();
}

async function addTopicInline(selectEl) {
  const name = (prompt("New topic name:") || "").trim();
  if (!name) return;
  if (!state.topics.includes(name)) { state.topics.push(name); await saveTopics(); }
  selectEl.value = name;
}

el("add-topic-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = el("new-topic-name").value.trim();
  if (!name) return;
  if (state.topics.includes(name)) { alert("That topic already exists."); return; }
  state.topics.push(name);
  el("new-topic-name").value = "";
  await saveTopics();
});
el("assignment-lesson-add").addEventListener("click", () => addTopicInline(el("assignment-lesson")));
el("edit-assignment-lesson-add").addEventListener("click", () => addTopicInline(el("edit-assignment-lesson")));

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
  // Materials aren't graded activities - keep them out of the Written/
  // Performance points overview.
  renderActivitiesSummary(snap.docs.map((d) => d.data()).filter((a) => a.type !== "material"));
  const list = el("assignments-list");
  list.innerHTML = "";
  const assignmentTitles = new Map(); // id -> title, for the delete-confirm prompt below
  const assignmentData = new Map();   // id -> full data, for the Share-to-group button
  snap.forEach((d) => {
    const a = d.data();
    assignmentTitles.set(d.id, a.title);
    assignmentData.set(d.id, a);
    const row = document.createElement("div");
    row.className = "card";
    if (a.type === "material") {
      // Read-only material: no due/points/pending/submissions - just the
      // content and Open/Delete.
      row.innerHTML = `
        <strong>${a.title}</strong> <span class="status-ai-drafted">Material</span>
        ${a.instructions ? `<p class="muted">${a.instructions}</p>` : ""}
        ${a.instructionsLink ? `<div class="muted"><a href="${a.instructionsLink}" target="_blank" rel="noopener">Material file</a></div>` : ""}
        <div style="margin-top:0.5rem;">
          <button data-open="${d.id}">Open</button>
          <button class="danger icon" data-delete-assignment="${d.id}" title="Delete material" aria-label="Delete material">×</button>
        </div>`;
    } else {
      row.innerHTML = `
        <strong>${a.title}</strong> <span class="muted">due ${a.dueDate || "no date"}</span>
        ${pendingBadge(counts.byAssignment.get(d.id))}
        ${a.instructions ? `<p class="muted">${a.instructions}</p>` : ""}
        ${a.instructionsLink ? `<div class="muted"><a href="${a.instructionsLink}" target="_blank" rel="noopener">Instructions file</a></div>` : ""}
        ${a.uploadFolderLink ? `<div class="muted"><a href="${a.uploadFolderLink}" target="_blank" rel="noopener">Upload folder</a></div>` : ""}
        <div class="muted">Allowed: ${a.allowedFileTypes} — ${a.totalPoints} points</div>
        <div style="margin-top:0.5rem;">
          <button data-open="${d.id}">Open submissions</button>
          <button class="secondary" data-share="${d.id}">&#128227; Share to group</button>
          <button class="secondary" data-copy="${d.id}">&#10697; Copy</button>
          <button class="danger icon" data-delete-assignment="${d.id}" title="Delete assignment" aria-label="Delete assignment">×</button>
        </div>`;
    }
    list.appendChild(row);
  });
  list.querySelectorAll("[data-open]").forEach((b) =>
    b.addEventListener("click", () => openAssignment(b.dataset.open)));
  list.querySelectorAll("[data-share]").forEach((b) =>
    b.addEventListener("click", () => shareAnnouncement(buildAssignmentAnnouncement(assignmentData.get(b.dataset.share)))));
  list.querySelectorAll("[data-copy]").forEach((b) =>
    b.addEventListener("click", () => copyAnnouncement(buildAssignmentAnnouncement(assignmentData.get(b.dataset.copy)))));
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

// Pick-type-first create flow (Google Classroom-style): choosing a type
// reveals the form with only the fields that type needs, so it's not a wall
// of inputs. A Material is read-only reference content - no points, no due
// date, no submissions - so it hides every graded-only field.
function setCreateType(type) {
  const form = el("add-assignment-form");
  const isAssignment = type !== "material";
  form.dataset.type = isAssignment ? "assignment" : "material";
  el("create-type-choice").classList.add("hidden");
  form.classList.remove("hidden");
  form.querySelectorAll(".assignment-only").forEach((n) => n.classList.toggle("hidden", !isAssignment));
  // A hidden `required` field silently blocks form submit - only require
  // points for a graded assignment.
  el("assignment-total-points").required = isAssignment;
  el("create-type-label").textContent = isAssignment ? "Assignment" : "Material";
  el("create-submit-btn").textContent = isAssignment ? "Add assignment" : "Add material";
}
function resetCreateType() {
  const form = el("add-assignment-form");
  form.reset();
  form.classList.add("hidden");
  el("create-type-choice").classList.remove("hidden");
}
document.querySelectorAll("[data-create-type]").forEach((b) =>
  b.addEventListener("click", () => setCreateType(b.dataset.createType)));
el("create-type-change").addEventListener("click", resetCreateType);

el("add-assignment-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  const type = e.target.dataset.type === "material" ? "material" : "assignment";
  const title = el("assignment-title").value.trim();
  const dueDate = type === "assignment" ? el("assignment-due").value : "";
  const base = {
    subjectId: state.subjectId,
    sectionId: state.sectionId,
    title,
    type,
    lesson: el("assignment-lesson").value.trim(),
    instructions: el("assignment-instructions").value.trim(),
    instructionsLink: el("assignment-instructions-link").value.trim(),
    createdAt: Date.now(),
    ownerEmail: state.viewAsEmail,
  };
  // A material stores only the fields above; graded fields are omitted, which
  // is what makes every submission/gradebook path skip it automatically.
  const payload = type === "material" ? base : {
    ...base,
    uploadFolderLink: el("assignment-upload-link").value.trim(),
    component: el("assignment-component").value,
    dueDate,
    allowedFileTypes: el("assignment-filetype").value,
    totalPoints: Number(el("assignment-total-points").value) || 0,
    rubricReferenceLink: el("assignment-rubric-link").value.trim(),
  };
  await addDoc(collection(db, "assignments"), payload);
  resetCreateType();
  loadAssignments();
  if (type === "material") { alert("Material added."); return; }
  await notifyOnAssignmentCreate(title, dueDate);
});

// Bulk-set one due date across all Written (or all Performance) assignments
// in the open section - so a whole batch closes on the same day without
// editing each assignment. Per-component because sections run written and
// performance tasks on different deadlines.
el("bulk-due-apply").addEventListener("click", async () => {
  const date = el("bulk-due-date").value;
  const component = el("bulk-due-component").value;
  const statusEl = el("bulk-due-status");
  statusEl.classList.remove("hidden");
  if (!date) { statusEl.textContent = "Pick a due date first."; return; }

  const snap = await getDocs(query(collection(db, "assignments"), where("sectionId", "==", state.sectionId)));
  const targets = snap.docs.filter((d) => d.data().component === component && ownedByViewAs(d.data()));
  const label = component === "written" ? "Written" : "Performance Task";
  if (targets.length === 0) { statusEl.textContent = `No ${label} assignments in this section.`; return; }
  if (!confirm(`Set due date to ${date} for ${targets.length} ${label} assignment(s) in this section?`)) return;

  statusEl.textContent = "Applying...";
  await Promise.all(targets.map((d) => updateDoc(doc(db, "assignments", d.id), { dueDate: date })));
  statusEl.textContent = `Set ${date} on ${targets.length} ${label} assignment(s).`;
  loadAssignments();
});

// Assignments have no separate draft/publish step - creating one *is*
// releasing it - so this is the release notify point. Silently does
// nothing if the teacher hasn't saved an EmailJS config in Settings.
async function notifyOnAssignmentCreate(title, dueDate) {
  if (!getEmailConfig().serviceId) { alert("Assignment added."); return; }

  const enrollSnap = await getDocs(ownerScopedQuery("enrollments", where("sectionId", "==", state.sectionId)));
  const students = enrollSnap.docs
    .filter((d) => ownedByViewAs(d.data()))
    .map((d) => ({ name: d.data().studentName, email: d.data().studentEmail || "" }));

  if (students.length === 0) { alert("Assignment added."); return; }
  if (!confirm(`Assignment added. Notify ${students.length} enrolled student(s) by email?`)) return;

  const { sent, failed } = await notifySection({
    students,
    subjectName: state.subjectName || "",
    sectionName: el("section-view-name").textContent || "",
    assignmentTitle: title,
    dueDate,
  });
  alert(`Notified: ${sent} sent${failed ? `, ${failed} failed` : ""}.`);
}

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
  const isMaterial = data.type === "material";
  el("assignment-view-title").textContent = data.title;
  el("edit-assignment-title").value = data.title || "";
  el("edit-assignment-lesson").innerHTML = topicOptionsHtml(data.lesson || "");
  el("edit-assignment-instructions").value = data.instructions || "";
  el("edit-assignment-instructions-link").value = data.instructionsLink || "";
  el("edit-assignment-upload-link").value = data.uploadFolderLink || "";
  el("edit-assignment-component").value = data.component || "written";
  el("edit-assignment-due").value = data.dueDate || "";
  el("edit-assignment-filetype").value = data.allowedFileTypes || "document";
  el("edit-assignment-total-points").value = data.totalPoints ?? "";
  el("edit-assignment-rubric-link").value = data.rubricReferenceLink || "";
  // A material's edit form hides the graded-only fields, and points must not
  // stay `required` (a hidden required field blocks submit).
  const editForm = el("edit-assignment-form");
  editForm.dataset.type = isMaterial ? "material" : "assignment";
  editForm.querySelectorAll(".assignment-only").forEach((n) => n.classList.toggle("hidden", isMaterial));
  el("edit-assignment-total-points").required = !isMaterial;
  renderAssignmentContext(data);
  show("view-assignment");
  if (isMaterial) {
    // A material has no submissions - show the read-only content only and
    // hide the whole grading UI.
    el("scores-summary").innerHTML = "";
    el("images-gallery").innerHTML = "";
    el("submission-filter").classList.add("hidden");
    el("submission-filter-label").classList.add("hidden");
    el("submissions-list").innerHTML = '<p class="muted">This is a material — students read it, there is nothing to grade.</p>';
  } else {
    el("submission-filter").classList.remove("hidden");
    el("submission-filter-label").classList.remove("hidden");
    loadSubmissions();
  }
}

el("edit-assignment-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const assignmentId = state.assignmentId;
  const isMaterial = e.target.dataset.type === "material";
  const base = {
    title: el("edit-assignment-title").value.trim(),
    lesson: el("edit-assignment-lesson").value.trim(),
    instructions: el("edit-assignment-instructions").value.trim(),
    instructionsLink: el("edit-assignment-instructions-link").value.trim(),
  };
  const payload = isMaterial ? base : {
    ...base,
    uploadFolderLink: el("edit-assignment-upload-link").value.trim(),
    component: el("edit-assignment-component").value,
    dueDate: el("edit-assignment-due").value,
    allowedFileTypes: el("edit-assignment-filetype").value,
    totalPoints: Number(el("edit-assignment-total-points").value) || 0,
    rubricReferenceLink: el("edit-assignment-rubric-link").value.trim(),
  };
  await updateDoc(doc(db, "assignments", assignmentId), payload);
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
    await loadScriptOnce(JSZIP_CDN_URL);
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
  // Text is sized first exactly as before (fit against a fixed baseline
  // radius, shrinking if too long); the badge is then shrunk to the
  // smallest radius that still fits that already-sized text, so a short
  // title/section/date no longer sits inside a badge padded out to the old
  // fixed size - long text still gets the full-size badge it always did.
  const CHORD_FACTOR = 0.85;
  const chordAt = (r, dy) => 2 * Math.sqrt(Math.max(r * r - dy * dy, 0)) * CHORD_FACTOR;
  const fitText = (text, maxWidth, startSize, weight) => {
    let size = startSize;
    ctx.font = `${weight} ${size}px 'Source Serif 4', Georgia, serif`;
    while (ctx.measureText(text).width > maxWidth && size > 10) {
      size -= 1;
      ctx.font = `${weight} ${size}px 'Source Serif 4', Georgia, serif`;
    }
    return size;
  };

  const scale = Math.min(W, H);
  const maxRadius = scale * 0.20; // baseline used to size text, same as the old fixed radius
  const minRadius = scale * 0.09; // floor so the badge never collapses for near-empty text

  const titleSize = fitText(title || "", chordAt(maxRadius, -maxRadius * 0.35), Math.round(maxRadius * 0.22), "bold");
  ctx.font = `bold ${titleSize}px 'Source Serif 4', Georgia, serif`;
  const titleW = ctx.measureText(title || "").width;

  const sectionSize = fitText(sectionName || "", chordAt(maxRadius, 0), Math.round(maxRadius * 0.14), "normal");
  ctx.font = `${sectionSize}px 'Source Serif 4', Georgia, serif`;
  const sectionW = ctx.measureText(sectionName || "").width;

  const dateSize = fitText(dateLabel || "", chordAt(maxRadius, maxRadius * 0.35), Math.round(maxRadius * 0.11), "normal");
  ctx.font = `${dateSize}px 'Source Serif 4', Georgia, serif`;
  const dateW = ctx.measureText(dateLabel || "").width;

  // Solves the chord-width formula (width <= 2*sqrt(r^2 - dy^2)*factor, with
  // dy expressed as a fraction of r) for the smallest radius that fits `w`.
  const radiusForWidth = (w, dyFrac) =>
    w <= 0 ? 0 : w / (2 * CHORD_FACTOR * Math.sqrt(Math.max(1 - dyFrac * dyFrac, 0.01)));
  const stackedHeight = (titleSize + sectionSize + dateSize) * 1.1;
  const radius = Math.min(Math.max(Math.max(
    radiusForWidth(titleW, 0.35),
    radiusForWidth(sectionW, 0),
    radiusForWidth(dateW, 0.35),
    stackedHeight / 1.3
  ), minRadius), maxRadius);

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

  ctx.fillStyle = "#002045";
  ctx.font = `bold ${titleSize}px 'Source Serif 4', Georgia, serif`;
  ctx.fillText(title || "", bcx, bcy - radius * 0.28);

  ctx.font = `${sectionSize}px 'Source Serif 4', Georgia, serif`;
  ctx.fillText(sectionName || "", bcx, bcy + 2);

  ctx.fillStyle = "#4a5568";
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
    generateOfficialAccomplishmentReport(context, canvas, e.target));
}

// ---------- official DepEd template report ----------
// Clones the real "Individual Daily Log and Accomplishment Report" template
// (assets/accomplishment-report-official.docx - a tokenized, single-activity
// copy of the actual government form the teacher submits) - patches its raw
// word/document.xml text and swaps one placeholder image's bytes, so every
// original font/seal/table border survives untouched. See
// .claude/Skills/deped-accomplishment-report for the separate, multi-date,
// agent-driven version of this same template - that one is for combining
// several activity dates into one submission; this one is the single-
// activity, in-app equivalent tied to one assignment's collage.
const OFFICIAL_REPORT_TEMPLATE_URL = "assets/accomplishment-report-official.docx";

function escapeXmlText(s) {
  return String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

function formatLongDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function formatLongDateWithWeekday(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const withWeekday = new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  return withWeekday.replace(/^(\w+), (.*)$/, "$2 ($1)");
}

async function buildOfficialReportDocxBlob(tokens, collageArrayBuffer, collageWidth, collageHeight) {
  await loadScriptOnce(JSZIP_CDN_URL);
  const templateBuffer = await (await fetch(OFFICIAL_REPORT_TEMPLATE_URL)).arrayBuffer();
  const zip = await JSZip.loadAsync(templateBuffer);

  const EMU_PER_INCH = 914400;
  const imgCx = Math.round(5 * EMU_PER_INCH);
  const imgCy = Math.round(imgCx * (collageHeight / collageWidth));

  let xml = await zip.file("word/document.xml").async("string");
  for (const [key, value] of Object.entries({ ...tokens, IMG_CX: imgCx, IMG_CY: imgCy })) {
    xml = xml.split(`{{${key}}}`).join(escapeXmlText(value));
  }
  zip.file("word/document.xml", xml);
  zip.file("word/media/image4.png", collageArrayBuffer); // the template's one placeholder photo slot

  return zip.generateAsync({ type: "blob" });
}

async function generateOfficialAccomplishmentReport(context, canvas, buttonEl) {
  buttonEl.disabled = true;
  const original = buttonEl.textContent;
  buttonEl.textContent = "Generating...";
  try {
    const fromDate = el("report-date-from").value;
    const toDate = el("report-date-to").value;
    const dateCovered = fromDate && toDate && fromDate !== toDate
      ? `${formatLongDate(fromDate)} to ${formatLongDate(toDate)}`
      : formatLongDate(fromDate || toDate);
    const rowDate = formatLongDateWithWeekday(fromDate || toDate);

    const collageBlob = await canvasToBlob(canvas);
    const collageArrayBuffer = await collageBlob.arrayBuffer();
    const blob = await buildOfficialReportDocxBlob({
      EMPLOYEE_NAME: el("report-employee-name").value,
      DATE_COVERED: dateCovered,
      ARRANGEMENT: el("report-arrangement").value,
      ROW_DATE: rowDate,
      ROW_TIME: `Time: ${el("report-time").value}`,
      ROW_ACCOMPLISHMENTS: el("report-description").value,
      MOV_DATE: dateCovered,
      SUBMITTED_BY_NAME: el("report-submitted-name").value,
      SUBMITTED_BY_TITLE: el("report-submitted-title").value,
      VERIFIED_BY_NAME: el("report-verified-name").value,
      VERIFIED_BY_TITLE: el("report-verified-title").value,
      APPROVED_BY_NAME: el("report-approved-name").value,
      APPROVED_BY_TITLE: el("report-approved-title").value,
      SUBMITTED_DATE: formatLongDate(new Date().toISOString().slice(0, 10)),
    }, collageArrayBuffer, canvas.width, canvas.height);

    const title = el("report-title").value || context.assignmentTitle;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${title.replace(/[/\\:*?"<>|]/g, "-")}-DepEd-report.docx`;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (err) {
    alert("Couldn't build the official report: " + err.message);
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
        <details style="margin-top:0.75rem;">
          <summary class="muted" style="cursor:pointer;">Report settings</summary>
          <div style="margin-top:0.5rem;">
            <label>Employee name</label>
            <input id="report-employee-name" value="IAN JOSEPH F. GALUTIRA" />
            <label>Arrangement</label>
            <input id="report-arrangement" value="Work-from-Home" />
            <label>Time</label>
            <input id="report-time" value="7:30 AM - 4:30 PM" />
            <label>Submitted by (name / title)</label>
            <div style="display:flex; gap:0.5rem;">
              <input id="report-submitted-name" value="IAN JOSEPH F. GALUTIRA" />
              <input id="report-submitted-title" value="Teacher II" />
            </div>
            <label>Verified by (name / title)</label>
            <div style="display:flex; gap:0.5rem;">
              <input id="report-verified-name" value="MIGUEL V. CACHO, PhD" />
              <input id="report-verified-title" value="Head Teacher III/OIC, SHS" />
            </div>
            <label>Approved by (name / title)</label>
            <div style="display:flex; gap:0.5rem;">
              <input id="report-approved-name" value="HAZEL O. MARIANO, PhD" />
              <input id="report-approved-title" value="Principal IV" />
            </div>
          </div>
        </details>
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
  positionDropdown(el("photos-bell"), dropdown);
  try {
    renderPhotosDropdown(await getPhotoAssignments());
  } catch (err) {
    dropdown.innerHTML = '<p class="muted" style="padding:0.5rem 0.75rem;">Couldn\'t load photo submissions.</p>';
  }
});
document.addEventListener("click", (e) => {
  if (!e.target.closest("#photos-bell, #photos-dropdown")) el("photos-dropdown").classList.add("hidden");
});

// Set right before openAssignment() when arriving via the Home dashboard's
// global student search, so the matching row gets scrolled to/highlighted
// once - cleared right after use so a later, normal visit to the same
// assignment doesn't keep highlighting it.
let highlightStudentName = "";

async function loadSubmissions() {
  const filter = el("submission-filter").value;
  const highlight = highlightStudentName;
  highlightStudentName = "";
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
    if (highlight && matchesNameSearch(s.studentName, highlight)) row.dataset.searchHighlight = "true";
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
      ${s.resubmitRequested ? ' <span class="status-pending">redo requested</span>' : ""}
      ${linkBlock}
      <div id="detail-${d.id}"></div>
      <div style="margin-top:0.5rem;">
        ${AI_CHECK_ENABLED ? `<button data-ai="${d.id}">Run AI Check</button>` : ""}
        ${s.resubmitRequested ? `<button data-allow-redo="${d.id}">Allow redo</button>` : ""}
        <button class="secondary" data-review="${d.id}">Review / Grade</button>
        <button class="danger" data-delete-sub="${d.id}">Delete</button>
      </div>`;
    list.appendChild(row);
  });
  const highlighted = list.querySelector('[data-search-highlight="true"]');
  if (highlighted) highlighted.scrollIntoView({ behavior: "smooth", block: "center" });
  if (AI_CHECK_ENABLED) {
    list.querySelectorAll("[data-ai]").forEach((b) =>
      b.addEventListener("click", () => runAiCheck(b.dataset.ai)));
  }
  list.querySelectorAll("[data-review]").forEach((b) =>
    b.addEventListener("click", () => openReview(b.dataset.review)));
  // Grant a student's redo request: reopen the graded submission for editing
  // (status -> "returned", the same reopened state as "Return for revision")
  // and clear the request flag. The old finalGrade is deliberately kept - it
  // stays the student's current grade until the redone work is re-graded.
  list.querySelectorAll("[data-allow-redo]").forEach((b) =>
    b.addEventListener("click", async () => {
      const ok = confirm("Reopen this graded assignment so the student can redo it? Their current grade stays until you re-grade the new work.");
      if (!ok) return;
      b.disabled = true;
      await updateDoc(doc(db, "submissions", b.dataset.allowRedo), {
        status: "returned",
        resubmitRequested: false,
        returnedAt: Date.now(),
      });
      alert("Reopened — the student can now edit and resubmit.");
      loadSubmissions();
      refreshNotifications();
    }));
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
    await loadScriptOnce(XLSX_CDN_URL);
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
  el("not-responding-overview").innerHTML = '<p class="muted">Checking activity status...</p>';
  getEnrollmentNotRespondingOverview().then((data) => {
    el("not-responding-overview").innerHTML = renderNotRespondingOverview(data);
  });
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
          <button class="secondary" data-refresh-master-list="${l.id}">Refresh names</button>
          <button class="secondary" data-dedupe-master-list="${l.id}">Remove duplicates</button>
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

  container.querySelectorAll("[data-refresh-master-list]").forEach((b) =>
    b.addEventListener("click", async () => {
      b.disabled = true;
      const changed = await refreshMasterListNames(b.dataset.refreshMasterList);
      alert(changed > 0 ? `Refreshed ${changed} name${changed === 1 ? "" : "s"}.` : "All names already up to date.");
      loadMasterLists();
    }));

  container.querySelectorAll("[data-dedupe-master-list]").forEach((b) =>
    b.addEventListener("click", async () => {
      if (!confirm("Remove exact duplicates (same email, or same name when no email)? Keeps the first of each. Look-alikes with a different email or middle initial are flagged for you to review, not auto-removed.")) return;
      b.disabled = true;
      const listId = b.dataset.dedupeMasterList;
      const removed = await dedupeMasterList(listId);
      const suspects = await findMasterListSuspects(listId);
      if (suspects.length) {
        renderMasterListSuspects(listId, suspects, removed);
      } else {
        alert(removed > 0 ? `Removed ${removed} duplicate${removed === 1 ? "" : "s"}. No look-alikes to review.` : "No duplicates found.");
        loadMasterLists();
      }
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

// Renders the suspected-duplicate review panel into the list's students
// container: each look-alike group with a per-row Remove. Re-queries after
// every removal so groups stay accurate; closes back to the full list once
// nothing ambiguous remains or the teacher hits Done.
function renderMasterListSuspects(listId, groups, removedCount) {
  const container = el(`master-list-students-${listId}`);
  container.dataset.open = "true";
  const intro = removedCount > 0 ? `Removed ${removedCount} exact duplicate${removedCount === 1 ? "" : "s"}. ` : "";
  container.innerHTML = `
    <p class="muted" style="margin-top:0.5rem;">${intro}Possible same-person entries below (different email or middle initial) — <strong>not</strong> auto-removed. Remove the ones you don't want; keep the rest.</p>
    ${groups.map((g, gi) => `
      <table class="records-grid"><thead><tr><th>#</th><th>Name</th><th>Email</th><th></th></tr></thead><tbody>
        ${g.map((s, i) => `<tr><td>${i + 1}</td><td>${s.name}</td><td>${s.email || '<span class="muted">(no email)</span>'}</td><td>
          <button type="button" class="secondary" data-remove-suspect="${gi}|${i}">Remove</button></td></tr>`).join("")}
      </tbody></table>${gi < groups.length - 1 ? '<hr style="margin:0.75rem 0;" />' : ""}`).join("")}
    <button type="button" id="suspects-done-${listId}" style="margin-top:0.5rem;">Done</button>`;

  container.querySelectorAll("[data-remove-suspect]").forEach((b) =>
    b.addEventListener("click", async () => {
      const [gi, i] = b.dataset.removeSuspect.split("|").map(Number);
      const s = groups[gi][i];
      b.disabled = true;
      await removeStudentFromMasterList(listId, s.name, s.email);
      const next = await findMasterListSuspects(listId);
      if (next.length) renderMasterListSuspects(listId, next, 0);
      else { container.innerHTML = ""; container.dataset.open = "false"; loadMasterLists(); }
    }));

  el(`suspects-done-${listId}`).addEventListener("click", () => {
    container.innerHTML = "";
    container.dataset.open = "false";
    loadMasterLists();
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
  const roster = (section.roster || []).map((r) =>
    typeof r === "string" ? { name: r.toUpperCase(), gender: "" } : { ...r, name: r.name.toUpperCase() });

  if (roster.length === 0) {
    container.innerHTML = `<p class="muted">No roster set for this section yet - go back and use "Set Roster" first.</p>`;
    return;
  }

  const assignSnap = await getDocs(query(collection(db, "assignments"), where("sectionId", "==", state.sectionId)));
  // Materials are read-only reference content with no submissions - never a
  // graded gradebook column, and they must not inflate the "missing" count.
  const assignments = assignSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((a) => a.type !== "material");

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

  // Exact string match misses students whose enrollment name is a
  // reordered/shortened version of the roster name (e.g. enrollment
  // "Hannah De Leon" vs roster "De Leon, Hannah May O.") - reuse the
  // same fuzzy word match already used for the Home dashboard search.
  // Resolved once here (not per-row) so unmatched enrollments/roster
  // names can be surfaced in the fix-names panel below, instead of the
  // match result being thrown away after each row renders.
  roster.forEach((r) => {
    r.enrollment = enrollments.find((en) =>
      matchesNameSearch(en.studentName, r.name) || matchesNameSearch(r.name, en.studentName)) || null;
  });
  const unmatchedEnrollments = enrollments.filter((en) => !roster.some((r) => r.enrollment === en));
  const unmatchedRosterNames = roster.filter((r) => !r.enrollment).map((r) => r.name);

  function renderStudentRow(r) {
    const name = r.name;
    const enrollment = r.enrollment;
    let missing = 0;
    const cells = orderedAssignments.map((a) => {
      if (!enrollment) { missing++; return `<td class="muted">Not joined</td>`; }
      const sub = submissionsByAssignment[a.id].get(enrollment.studentUID);
      if (!sub) { missing++; return `<td class="muted">No submission</td>`; }
      if (sub.status === "published") {
        return `<td>${sub.finalGrade?.score ?? 0}/${a.totalPoints}</td>`;
      }
      return `<td class="status-${sub.status}">${sub.status}</td>`;
    }).join("");
    const missingCell = `<td><span class="status-${missing > 0 ? "returned" : "published"}">${missing}/${orderedAssignments.length}</span></td>`;
    return `<tr><td>${name}</td>${missingCell}${cells}</tr>`;
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
        const header = `<tr class="gender-group"><td colspan="${orderedAssignments.length + 2}">${g.label}</td></tr>`;
        return header + g.students.map(renderStudentRow).join("");
      }).join("")
    : roster.map(renderStudentRow).join("");

  // Students show as "Not joined" in the grid above when their enrollment
  // name fuzzy-matched nothing on the roster - their submissions are safe
  // (joined by studentUID, untouched by this), only the display match
  // failed. Let the teacher fix many at once instead of hunting each one
  // down in Enrolled Students.
  const unmatchedPanel = unmatchedEnrollments.length === 0 ? "" : `
    <div class="card">
      <p><strong>${unmatchedEnrollments.length} enrolled student${unmatchedEnrollments.length === 1 ? "" : "s"} not matching a roster name.</strong>
      Their submissions are safe - pick or type their roster name to fix the match.</p>
      <table class="records-grid">
        <thead><tr><th>Enrolled as</th><th>Gmail</th><th>Roster name</th><th></th></tr></thead>
        <tbody>
          ${unmatchedEnrollments.map((en, i) => `
            <tr>
              <td>${displayStudentName(en.studentName)}</td>
              <td>${en.studentEmail || ""}</td>
              <td>
                <select id="unmatched-select-${i}" style="width:auto; display:inline-block;">
                  <option value="">— pick roster name —</option>
                  ${unmatchedRosterNames.map((n) => `<option value="${n}">${n}</option>`).join("")}
                </select>
                <input id="unmatched-input-${i}" placeholder="or type name" style="width:auto; display:inline-block;" />
              </td>
              <td><button class="secondary" data-fix-unmatched="${i}" data-uid="${en.studentUID}">Fix</button></td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`;

  container.innerHTML = unmatchedPanel + `
    <table class="records-grid">
      <thead>
        <tr><th colspan="2"></th>${groupHeaderCells}</tr>
        <tr><th>Student</th><th>Missing</th>${titleHeaderCells}</tr>
      </thead>
      <tbody>${bodyRows}</tbody>
    </table>`;

  container.querySelectorAll("[data-fix-unmatched]").forEach((b) =>
    b.addEventListener("click", async () => {
      const i = b.dataset.fixUnmatched;
      const select = el(`unmatched-select-${i}`);
      const input = el(`unmatched-input-${i}`);
      const name = (input.value.trim() || select.value).trim();
      if (!name) { alert("Pick or type a roster name first."); return; }
      await renameStudentEverywhere(b.dataset.uid, name);
      loadRecords();
    }));
}

// ---------- nav ----------
function show(viewId) {
  ["view-overview", "view-subjects", "view-subject", "view-enrolled", "view-section", "view-assignment", "view-records", "view-master-lists"].forEach((v) => {
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
    await loadSubjects(); // awaited so a real failure reaches guardPage's catch (showConnectionError) instead of silently leaving an empty list
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

// Mobile sidebar drawer: the topbar hamburger opens it, the scrim or any
// nav tap closes it. On desktop the sidebar is always shown, so these are
// no-ops there (the toggle button and scrim are display:none above 640px).
el("sidebar-toggle").addEventListener("click", () => document.body.classList.toggle("sidebar-open"));
el("sidebar-scrim").addEventListener("click", () => document.body.classList.remove("sidebar-open"));
document.querySelector(".sidebar-nav").addEventListener("click", (e) => {
  if (e.target.closest("button")) document.body.classList.remove("sidebar-open");
});
el("back-to-subjects").addEventListener("click", () => { show("view-subjects"); loadSubjects(); });
el("back-to-subject").addEventListener("click", () => show("view-subject"));
el("back-to-section").addEventListener("click", () => show("view-section"));
el("back-to-section-from-records").addEventListener("click", () => show("view-section"));
el("sign-out").addEventListener("click", signOutUser);
wireOpenInChromeButtons(el("assignment-context"));

// ---------- settings (Gemini key + EmailJS config, kept in localStorage only) ----------
el("settings-form").addEventListener("submit", (e) => {
  e.preventDefault();
  if (AI_CHECK_ENABLED) setGeminiKey(el("gemini-key").value);
  saveEmailConfig({
    serviceId: el("emailjs-service-id").value,
    templateId: el("emailjs-template-id").value,
    publicKey: el("emailjs-public-key").value,
  });
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
  // "My Classes" is the signed-in admin's OWN email (not a hardcoded one) so
  // the picker resolves correctly for whichever super admin is signed in.
  const self = currentUser.email;
  const emails = snap.docs.map((d) => d.data().email).filter((e) => e !== self).sort();
  picker.innerHTML =
    `<option value="${self}">My Classes</option>` +
    emails.map((email) => `<option value="${email}">View as: ${email}</option>`).join("");
  picker.value = state.viewAsEmail;
  picker.classList.remove("hidden");
}

// Switch which teacher the admin is acting as, then land on their classes.
// Shared by the "view as" picker and the Overview's per-teacher Open button
// so both stay in sync (the picker's value is updated too).
function switchToTeacher(email) {
  state.viewAsEmail = email;
  const picker = el("view-as-picker");
  if (picker) picker.value = email;
  show("view-subjects");
  loadSubjects();
  refreshNotifications();
}

el("view-as-picker").addEventListener("change", (e) => switchToTeacher(e.target.value));

// ---------- admin: system overview (super admin only) ----------
// Every teacher + every student across the whole site, on one page. Reads
// each collection ONCE, unfiltered (firestore.rules lets the super admin do
// this - isSuperAdmin() short-circuits every list/read rule), and groups in
// memory - same fetch-once-compute-in-memory shape as
// getEnrollmentNotRespondingOverview(), never a query per teacher. Opt-in
// (runs only when Overview is opened) and cached for the session so
// re-opening doesn't re-scan the whole deployment - Refresh forces a re-read.
let overviewCache = null; // { teacherRows, studentRows }

function ownerOf(data) {
  // Pre-multi-tenant docs have no ownerEmail - they belong to the super admin
  // (mirrors firestore.rules' isLegacyUnowned).
  return data.ownerEmail || ADMIN_EMAIL;
}

async function buildOverviewData() {
  const [teachersSnap, subjSnap, sectSnap, enrollSnap, subSnap] = await Promise.all([
    getDocs(collection(db, "teachers")),
    getDocs(collection(db, "subjects")),
    getDocs(collection(db, "sections")),
    getDocs(collection(db, "enrollments")),
    getDocs(collection(db, "submissions")),
  ]);

  const sectionMap = new Map(); // sectionId -> { name, subjectId }
  sectSnap.docs.forEach((d) => sectionMap.set(d.id, { name: d.data().name || "", subjectId: d.data().subjectId }));
  const subjectMap = new Map(); // subjectId -> name
  subjSnap.docs.forEach((d) => subjectMap.set(d.id, d.data().name || ""));

  // Per-teacher tallies, keyed by owner email. Union of the teachers
  // allowlist + the super admin + any owner actually seen in the data.
  const owners = new Map(); // email -> { subjects, sections, students:Set, pending }
  const ensure = (email) => {
    if (!owners.has(email)) owners.set(email, { subjects: 0, sections: 0, students: new Set(), pending: 0 });
    return owners.get(email);
  };
  ensure(ADMIN_EMAIL);        // primary admin / legacy-doc owner
  ensure(currentUser.email);  // the signed-in admin (may be a second super admin)
  teachersSnap.docs.forEach((d) => ensure(d.data().email));
  subjSnap.docs.forEach((d) => ensure(ownerOf(d.data())).subjects++);
  sectSnap.docs.forEach((d) => ensure(ownerOf(d.data())).sections++);
  subSnap.docs.forEach((d) => { if (d.data().status === "pending") ensure(ownerOf(d.data())).pending++; });

  const studentRows = [];
  enrollSnap.docs.forEach((d) => {
    const e = d.data();
    const owner = ownerOf(e);
    ensure(owner).students.add(e.studentUID);
    const sect = sectionMap.get(e.sectionId);
    studentRows.push({
      name: e.studentName || "",
      email: e.studentEmail || "",
      teacher: owner,
      section: sect ? sect.name : "",
      subject: sect ? (subjectMap.get(sect.subjectId) || "") : "",
      uid: e.studentUID || "",
    });
  });

  const teacherRows = [...owners.entries()]
    .map(([email, t]) => ({ email, subjects: t.subjects, sections: t.sections, students: t.students.size, pending: t.pending }))
    // Admin ("My Classes") first, then teachers alphabetically.
    .sort((a, b) => (a.email === ADMIN_EMAIL ? -1 : b.email === ADMIN_EMAIL ? 1 : a.email.localeCompare(b.email)));

  studentRows.sort((a, b) => displayStudentName(a.name).localeCompare(displayStudentName(b.name)));
  return { teacherRows, studentRows };
}

function renderOverviewTeachers(teacherRows) {
  el("overview-teachers").innerHTML = teacherRows.map((t) => {
    const label = t.email === currentUser.email ? "My Classes (you)" : t.email;
    return `<div class="overview-teacher-card">
      <div class="overview-teacher-head">
        <strong>${label}</strong>
        <button class="secondary" data-open-teacher="${t.email}">Open</button>
      </div>
      <div class="overview-stats">
        <span><b>${t.subjects}</b> subjects</span>
        <span><b>${t.sections}</b> sections</span>
        <span><b>${t.students}</b> students</span>
        <span>${t.pending ? `<span class="status-pending">${t.pending} pending</span>` : '<span class="muted">0 pending</span>'}</span>
      </div>
    </div>`;
  }).join("");

  el("overview-teachers").querySelectorAll("[data-open-teacher]").forEach((b) =>
    b.addEventListener("click", () => switchToTeacher(b.dataset.openTeacher)));
}

function renderOverviewStudents(studentRows) {
  const q = el("overview-student-search").value.trim().toLowerCase();
  const words = q.split(/\s+/).filter(Boolean);
  const rows = words.length
    ? studentRows.filter((r) => {
        const hay = `${r.name} ${r.email} ${r.teacher} ${r.section} ${r.subject}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      })
    : studentRows;

  el("overview-students-count").textContent =
    `${rows.length} student${rows.length === 1 ? "" : "s"}${words.length ? ` (of ${studentRows.length})` : ""}`;

  el("overview-students").innerHTML = rows.length
    ? `<table class="records-grid"><thead><tr><th>#</th><th>Name</th><th>Gmail</th><th>Teacher</th><th>Class</th><th></th></tr></thead><tbody>
        ${rows.map((r, i) => `<tr>
          <td>${i + 1}</td>
          <td>${displayStudentName(r.name)}</td>
          <td>${r.email}</td>
          <td>${r.teacher === currentUser.email ? "You" : r.teacher}</td>
          <td>${r.section}${r.subject ? ` <span class="muted">(${r.subject})</span>` : ""}</td>
          <td><button class="secondary" data-view-as="${r.uid}" data-vemail="${r.email}" data-vname="${r.name}" title="Open this student's page (read-only)">View as</button></td>
        </tr>`).join("")}
      </tbody></table>`
    : '<p class="muted">No students match that search.</p>';

  el("overview-students").querySelectorAll("[data-view-as]").forEach((b) =>
    b.addEventListener("click", () => {
      const url = `student.html?asStudentUID=${encodeURIComponent(b.dataset.viewAs)}` +
        `&asStudentEmail=${encodeURIComponent(b.dataset.vemail)}` +
        `&asStudentName=${encodeURIComponent(b.dataset.vname)}`;
      window.open(url, "_blank", "noopener");
    }));
}

async function openOverview(force) {
  show("view-overview");
  if (force || !overviewCache) {
    el("overview-teachers").innerHTML = '<p class="muted">Loading&hellip;</p>';
    el("overview-students").innerHTML = "";
    el("overview-students-count").textContent = "";
    try {
      overviewCache = await buildOverviewData();
    } catch (err) {
      el("overview-teachers").innerHTML = '<p class="muted">Could not load the overview. Please try Refresh.</p>';
      console.error("Overview load failed:", err);
      return;
    }
  }
  renderOverviewTeachers(overviewCache.teacherRows);
  renderOverviewStudents(overviewCache.studentRows);
}

el("go-overview").addEventListener("click", () => openOverview(false));
el("overview-refresh").addEventListener("click", () => openOverview(true));
el("back-from-overview").addEventListener("click", () => { show("view-subjects"); loadSubjects(); });
el("overview-student-search").addEventListener("input", () => {
  if (overviewCache) renderOverviewStudents(overviewCache.studentRows);
});

// ---------- init ----------
// Turn a failed initial load (most importantly a Firestore free-tier quota
// hit, code "resource-exhausted") into a plain message instead of a silent
// blank dashboard that reads as broken/lost data. The data is untouched - the
// read just couldn't complete right now.
function showConnectionError(err) {
  const code = err && err.code;
  const friendly = code === "resource-exhausted"
    ? "The system is very busy right now. Please try again in a few minutes — your data is safe."
    : code === "unavailable"
    ? "Can't reach the server. Check your internet connection, then refresh this page."
    : "Something went wrong loading your dashboard. Please refresh this page and try again.";
  let banner = document.getElementById("conn-error");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "conn-error";
    banner.className = "card";
    banner.style.cssText = "background:#fee2e2; border-color:#b91c1c; color:#7f1d1d; white-space:pre-wrap;";
    const host = document.querySelector("main") || document.body;
    host.insertBefore(banner, host.firstChild);
  }
  banner.textContent = friendly + debugSuffix(err);
  console.error("Initial load failed:", err);
}

// Add ?debug=1 to the dashboard URL to read the raw Firestore error (code +
// message) right on the page - lets a phone with no dev-tools console still
// surface the real reason a load failed. Off by default so real teachers never
// see raw error text.
const DEBUG_MODE = new URLSearchParams(location.search).has("debug");
function debugSuffix(err) {
  if (!DEBUG_MODE || !err) return "";
  return `\n\n[debug] ${err.code || err.name || "error"}: ${err.message || err}`;
}

// Surface an otherwise-swallowed error (e.g. the notification bell rollups,
// which are best-effort and never crash the page) as an on-screen banner, but
// ONLY under ?debug=1. This is the phone-friendly way to capture which query
// is actually being denied for a granted teacher.
function showDebugBanner(err) {
  if (!DEBUG_MODE || !err) return;
  let banner = document.getElementById("debug-error");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "debug-error";
    banner.className = "card";
    banner.style.cssText = "background:#fef9c3; border-color:#a16207; color:#713f12; white-space:pre-wrap;";
    const host = document.querySelector("main") || document.body;
    host.insertBefore(banner, host.firstChild);
  }
  banner.textContent = `[debug] a background query failed (badges only):${debugSuffix(err)}`;
}

guardPage("teacher").then(async (user) => {
  if (!user) return;
  currentUser = user;
  state.viewAsEmail = user.email;
  // Header account: Google profile photo when available, else a circle with
  // the email initial; real display name beside it; full email on hover.
  const em = el("teacher-email");
  if (user.photoURL) {
    em.innerHTML = `<img src="${user.photoURL}" alt="" referrerpolicy="no-referrer" />`;
    em.classList.add("has-photo");
  } else {
    em.textContent = (user.email[0] || "?").toUpperCase();
  }
  em.title = user.email;
  el("account-name").textContent = user.displayName || user.email;
  const isAdmin = isSuperAdmin(user.email);
  // Small role pill next to the account circle - same page serves both
  // regular teachers and the super admin, so it's otherwise not obvious
  // at a glance which one a given signed-in session is.
  const roleBadge = el("role-badge");
  roleBadge.textContent = isAdmin ? "Admin" : "Teacher";
  roleBadge.className = isAdmin ? "status-returned" : "status-published";
  if (AI_CHECK_ENABLED) {
    el("gemini-key").value = getGeminiKey();
    el("gemini-settings-section").classList.remove("hidden");
  } else {
    const aiOption = el("submission-filter").querySelector('option[value="ai-drafted"]');
    if (aiOption) aiOption.hidden = true;
  }
  const emailConfig = getEmailConfig();
  el("emailjs-service-id").value = emailConfig.serviceId;
  el("emailjs-template-id").value = emailConfig.templateId;
  el("emailjs-public-key").value = emailConfig.publicKey;
  if (isAdmin) {
    el("admin-teachers-section").classList.remove("hidden");
    el("go-overview").classList.remove("hidden");
    loadTeachers();
    renderViewAsPicker();
  }
  try {
    await refreshNotifications();
    showDebugBanner(lastNotifications.errorDetail); // ?debug=1 only: reveal a swallowed bell-query error on-screen
    await restoreNavState();
  } catch (err) {
    showConnectionError(err);
  }
});
