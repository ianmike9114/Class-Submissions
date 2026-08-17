import { db, ADMIN_EMAIL } from "./firebase-config.js";
import { guardPage, signOutUser } from "./auth.js";
import {
  collection, addDoc, setDoc, doc, deleteDoc, getDoc, getDocs, updateDoc, query, where, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { toEmbedUrl, openInChromeButton, wireOpenInChromeButtons } from "./embed.js";

let currentUser = null;
function el(id) { return document.getElementById(id); }

// Names arrive with inconsistent casing depending on source (roster
// upload already uppercases on save, but the Google-account-name
// fallback doesn't) - normalize how they *display*, without touching
// the stored value.
function displayStudentName(name) { return (name || "").toUpperCase(); }

// Stash immediately at module load: guardPage() below may redirect a signed-
// out student to index.html for Google Sign-In before this page gets a
// second chance to read the query string - sessionStorage survives that
// same-tab navigation, a plain URL param wouldn't.
const _urlJoinCode = new URLSearchParams(location.search).get("code");
if (_urlJoinCode) sessionStorage.setItem("pendingJoinCode", _urlJoinCode.trim().toUpperCase());

// Runs once guardPage() resolves with a signed-in user - either already
// signed in when they scanned, or just back from index.html's sign-in.
// One-tap join: fills #join-code and submits the existing join-form
// handler, which already handles "already enrolled"/the name-picker.
function applyPendingJoinCode() {
  const code = sessionStorage.getItem("pendingJoinCode");
  if (!code) return;
  sessionStorage.removeItem("pendingJoinCode");
  history.replaceState(null, "", location.pathname);
  el("join-code").value = code;
  el("join-form").requestSubmit();
}

// ---------- join a class ----------
// If the section already has a roster (Set Roster, teacher side), the
// student picks their real name from it instead of trusting whatever
// Google display name shows - keeps studentName exactly matching the
// roster spelling everywhere it's later compared (Records grid, Enrolled
// Students list). No roster yet -> falls back to the old Google-name flow.
let pendingJoin = null; // { sectionDoc, section, subject } while a name picker is open

// Firestore calls that stall on a bad connection never resolve or reject on
// their own, so `await` just hangs forever with no error - the button sits
// on "Joining..." with zero feedback. Races against a timeout so a stalled
// request surfaces a message instead.
function withTimeout(promise, ms = 12000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Taking too long - check your connection and try again.")), ms)),
  ]);
}

async function enroll(sectionId, section, subject, studentName) {
  // Deterministic ID (one section + one student = one doc, always) instead
  // of addDoc's random ID - the "already enrolled?" checks above this call
  // are a query-then-write race (two tabs, a double-click before the button
  // disables), so without this a slipped-through second write could create
  // a real duplicate enrollment. With a fixed ID it can only ever overwrite
  // the same doc - and firestore.rules' student-update rule only allows
  // touching studentName/leaveRequested, so a same-student overwrite from a
  // second race loser gets cleanly rejected instead of corrupting data.
  await setDoc(doc(db, "enrollments", `${sectionId}_${currentUser.uid}`), {
    studentUID: currentUser.uid,
    studentName,
    studentEmail: currentUser.email,
    subjectId: section.subjectId,
    subjectName: subject.name,
    teacherName: subject.ownerName || "—",
    sectionId,
    sectionName: section.sectionName,
    // Sections created before multi-teacher support have no ownerEmail -
    // those belong to the super admin (the one teacher that existed then).
    ownerEmail: section.ownerEmail || ADMIN_EMAIL,
    // Powers the teacher's notification bell "new joins" bucket - flipped
    // to true once they've seen it (js/teacher.js). Missing on every
    // enrollment made before this field existed, which is fine: a query for
    // seen==false only ever matches docs that have the field, so old
    // enrollments are implicitly "already seen" with no backfill needed.
    seen: false,
    joinedAt: serverTimestamp(),
  });
}

// Auto-join for students the teacher invited by Gmail (js/teacher.js's
// "Invite by email", no email-click-to-accept step) - runs once per
// sign-in, before loadEverything() so a newly-created enrollment shows up
// on the very first render. Each invite doc is consumed (deleted) whether
// or not it resulted in a new enrollment, so a stale/duplicate invite
// can't linger and re-fire.
async function applyPendingInvites() {
  const snap = await getDocs(query(collection(db, "invites"), where("studentEmail", "==", currentUser.email.toLowerCase())));
  for (const inviteDoc of snap.docs) {
    const invite = inviteDoc.data();
    const already = await getDocs(query(
      collection(db, "enrollments"),
      where("studentUID", "==", currentUser.uid),
      where("sectionId", "==", invite.sectionId)
    ));
    if (already.empty) {
      await enroll(
        invite.sectionId,
        { subjectId: invite.subjectId, sectionName: invite.sectionName, ownerEmail: invite.ownerEmail },
        { name: invite.subjectName, ownerName: invite.teacherName },
        invite.studentName
      );
    }
    await deleteDoc(doc(db, "invites", inviteDoc.id));
  }
}

async function renderNamePicker() {
  const { section } = pendingJoin;
  // Older sections saved a plain string[] roster before gender tracking
  // existed - normalize both shapes to plain names here.
  const rosterNames = section.roster.map((r) => (typeof r === "string" ? r : r.name));
  const container = el("join-name-picker");

  container.innerHTML = `
    <label>Which name is yours?</label>
    <select id="join-name-select">
      ${rosterNames.map((name) => `<option value="${name}">${name}</option>`).join("")}
    </select>
    <button type="button" id="join-name-confirm">This is me</button>
    <p id="join-name-message" class="muted"></p>`;

  el("join-name-confirm").addEventListener("click", async () => {
    const chosen = el("join-name-select").value;
    const btn = el("join-name-confirm");
    btn.disabled = true;
    try {
      const sectionName = pendingJoin.section.sectionName;
      await enroll(pendingJoin.sectionDoc.id, pendingJoin.section, pendingJoin.subject, chosen);
      pendingJoin = null;
      el("join-form").reset();
      container.innerHTML = "";
      el("join-message").textContent = `Joined ${sectionName} as ${chosen}!`;
      await loadEverything();
      el("assignments-list").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      el("join-name-message").textContent = "Join failed: " + err.message;
      btn.disabled = false;
    }
  });
}

el("join-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const code = el("join-code").value.trim().toUpperCase();
  const msg = el("join-message");
  const btn = e.target.querySelector("button");
  msg.textContent = "";
  el("join-name-picker").innerHTML = "";

  if (!currentUser) {
    msg.textContent = "Still loading your account - wait a moment and try again.";
    return;
  }

  btn.disabled = true;
  btn.textContent = "Joining...";
  try {
    await withTimeout((async () => {
      msg.textContent = "Looking up class code...";
      const q = query(collection(db, "sections"), where("joinCode", "==", code));
      const snap = await getDocs(q);
      if (snap.empty) {
        msg.textContent = "No class found with that code.";
        return;
      }
      const sectionDoc = snap.docs[0];
      const section = sectionDoc.data();

      msg.textContent = "Checking your enrollment...";
      const already = await getDocs(query(
        collection(db, "enrollments"),
        where("sectionId", "==", sectionDoc.id),
        where("studentUID", "==", currentUser.uid)
      ));
      if (!already.empty) {
        msg.textContent = "You're already enrolled in this class.";
        return;
      }

      msg.textContent = "Loading class details...";
      const subject = (await getDoc(doc(db, "subjects", section.subjectId))).data();

      if (!section.roster || section.roster.length === 0) {
        msg.textContent = "Joining...";
        await enroll(sectionDoc.id, section, subject, currentUser.displayName || currentUser.email);
        e.target.reset();
        msg.textContent = `Joined ${section.sectionName}!`;
        await loadEverything();
        el("assignments-list").scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }

      pendingJoin = { sectionDoc, section, subject };
      msg.textContent = "";
      await renderNamePicker();
    })());
  } catch (err) {
    msg.textContent = "Join failed: " + err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = "Join";
  }
});

// ---------- load classes + assignments + submissions ----------
// Client-side "New assignment" flagging - a per-section map of the last
// time this browser saw the section's assignments. Purely localStorage: no
// Firestore write, no rules change, no quota cost (per-device is fine for a
// visual nicety). Assignments carry a numeric createdAt (Date.now()), so an
// assignment newer than the stored timestamp is "New" until the next visit.
const ASSIGN_SEEN_KEY = "assignmentsSeen";
function getAssignmentsSeen() {
  try { return JSON.parse(localStorage.getItem(ASSIGN_SEEN_KEY)) || {}; }
  catch { return {}; }
}
function saveAssignmentsSeen(map) {
  try { localStorage.setItem(ASSIGN_SEEN_KEY, JSON.stringify(map)); } catch { /* storage full/blocked - badge is optional */ }
}

async function loadEverything() {
  const enrollSnap = await getDocs(
    query(collection(db, "enrollments"), where("studentUID", "==", currentUser.uid))
  );
  const enrollments = enrollSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const classesList = el("classes-list");
  classesList.innerHTML = enrollments.length
    ? enrollments.map((en) => `
        <span class="card" style="display:inline-block; margin-right:0.5rem;">
          ${en.subjectName} — ${en.sectionName} (<span id="my-name-${en.id}">${displayStudentName(en.studentName)}</span>)
          <br><span class="muted" style="font-size:0.85em;">Teacher: ${en.teacherName || "—"}</span>
          <button type="button" class="secondary" data-edit-my-name="${en.id}" data-raw="${en.studentName}" style="margin-left:0.4rem;">Edit name</button>
          <button type="button" class="secondary" data-toggle-leave="${en.id}" data-current="${!!en.leaveRequested}" style="margin-left:0.4rem;">${en.leaveRequested ? "Cancel leave request" : "Request to leave"}</button>
          ${en.leaveRequested ? '<span class="status-pending"> — leave requested</span>' : ""}
        </span>`).join("")
    : '<p class="muted">Not joined to any class yet.</p>';

  classesList.querySelectorAll("[data-edit-my-name]").forEach((b) =>
    b.addEventListener("click", () => {
      const enrollmentId = b.dataset.editMyName;
      const nameEl = el(`my-name-${enrollmentId}`);
      const current = b.dataset.raw;
      nameEl.innerHTML = `<input id="edit-my-name-input-${enrollmentId}" value="${current}" style="width:auto; display:inline-block; margin-bottom:0;" />`;
      const input = el(`edit-my-name-input-${enrollmentId}`);
      input.focus();
      input.select();
      let saved = false;
      const save = async () => {
        if (saved) return;
        saved = true;
        const name = input.value.trim();
        try {
          if (name && name !== current) {
            await updateDoc(doc(db, "enrollments", enrollmentId), { studentName: name });
            alert("Saved.");
          }
        } catch (err) {
          alert("Couldn't save name: " + err.message);
        }
        loadEverything();
      };
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") save(); });
      input.addEventListener("blur", save);
    }));

  // Flag-only - a student can never delete their own enrollment (firestore.rules
  // keeps delete teacher-only), just request/cancel. Confirm only on the
  // outbound request (it notifies the teacher); cancelling is instant, since
  // undoing a flag shouldn't be harder than setting it.
  classesList.querySelectorAll("[data-toggle-leave]").forEach((b) =>
    b.addEventListener("click", async () => {
      const enrollmentId = b.dataset.toggleLeave;
      const next = b.dataset.current !== "true";
      if (next) {
        const ok = confirm("Send a request to leave this class? Your teacher will see it and can remove you.");
        if (!ok) return;
      }
      b.disabled = true;
      try {
        await updateDoc(doc(db, "enrollments", enrollmentId), { leaveRequested: next });
        alert(next ? "Leave request sent." : "Leave request cancelled.");
      } catch (err) {
        alert("Couldn't update leave request: " + err.message);
      }
      loadEverything();
    }));

  const sectionIds = enrollments.map((en) => en.sectionId);
  const list = el("assignments-list");
  list.innerHTML = "";
  if (sectionIds.length === 0) return;

  // Firestore 'in' queries cap at 30 - fine for a solo class-load use case.
  const assignSnap = await getDocs(
    query(collection(db, "assignments"), where("sectionId", "in", sectionIds.slice(0, 30)))
  );

  // Group by subject so a student in multiple classes can tell which
  // assignment belongs to which - a flat list gave no such signal.
  const sectionToSubject = new Map(enrollments.map((en) => [en.sectionId, en.subjectName]));
  const subjectOrder = [...new Set(enrollments.map((en) => en.subjectName))];
  const assignmentsBySubject = new Map(subjectOrder.map((name) => [name, []]));
  for (const aDoc of assignSnap.docs) {
    const subjectName = sectionToSubject.get(aDoc.data().sectionId) || "Other";
    if (!assignmentsBySubject.has(subjectName)) assignmentsBySubject.set(subjectName, []);
    assignmentsBySubject.get(subjectName).push(aDoc);
    assignmentsById.set(aDoc.id, aDoc.data());
  }

  // Fetch every assignment's own-submission lookup in parallel rather than
  // one at a time - each assignment card used to wait on the previous
  // one's round-trip before it could even start rendering.
  const allADocs = [...assignmentsBySubject.values()].flat();
  const subDocsByAssignment = new Map(await Promise.all(allADocs.map(async (aDoc) => [
    aDoc.id,
    (await getDocs(
      query(collection(db, "submissions"),
        where("assignmentId", "==", aDoc.id),
        where("studentUID", "==", currentUser.uid))
    )).docs[0],
  ])));

  const seen = getAssignmentsSeen();

  for (const [subjectName, aDocs] of assignmentsBySubject) {
    if (aDocs.length === 0) continue;
    const heading = document.createElement("h3");
    heading.textContent = subjectName;
    list.appendChild(heading);

    for (const aDoc of aDocs) {
      const a = aDoc.data();
      const subDoc = subDocsByAssignment.get(aDoc.id);
      // "New" only when this section has a known last-seen baseline (so a
      // student's first-ever load doesn't flag every assignment) and the
      // assignment was created after it.
      const isNew = a.createdAt && seen[a.sectionId] != null && a.createdAt > seen[a.sectionId];

      const row = document.createElement("div");
      row.className = "card";

      if (!subDoc) {
        const instructionsEmbed = a.instructionsLink ? toEmbedUrl(a.instructionsLink) : null;
        const instructionsFileBlock = a.instructionsLink
          ? (instructionsEmbed
            ? `<iframe src="${instructionsEmbed}" class="submission-preview"></iframe>`
            : `<div class="muted"><a href="${a.instructionsLink}" target="_blank" rel="noopener">Instructions file</a>${openInChromeButton(a.instructionsLink)}</div>`)
          : "";
        const uploadFolderBlock = a.uploadFolderLink
          ? `<div class="muted"><a href="${a.uploadFolderLink}" target="_blank" rel="noopener">Upload here (large files, e.g. video)</a>${openInChromeButton(a.uploadFolderLink)}</div>`
          : "";
        row.innerHTML = `
          <strong>${a.title}</strong> <span class="muted">due ${a.dueDate || "no date"}</span>
          ${isNew ? '<span class="status-pending"> New</span>' : ""}
          ${a.instructions ? `<p>${a.instructions}</p>` : ""}
          ${instructionsFileBlock}
          ${uploadFolderBlock}
          <div class="muted">Type: ${a.allowedFileTypes}</div>
          <div class="muted">Total points: ${a.totalPoints}</div>
          ${renderSubmitForm(aDoc.id, a.allowedFileTypes)}`;
      } else {
        const s = subDoc.data();
        const statusLabel = s.status === "published" ? "Graded"
          : s.status === "returned" ? "Returned — please revise and resubmit"
          : "Submitted, pending review";
        const actionsBlock = s.status === "published"
          ? renderResult(s, a)
          : `<div style="margin-top:0.5rem;">
               <button type="button" class="secondary" data-edit-submission="${subDoc.id}">Edit submission</button>
               <button type="button" class="danger" data-remove-submission="${subDoc.id}">Remove submission</button>
             </div>
             <div data-edit-container="${subDoc.id}"></div>`;
        row.innerHTML = `
          <strong>${a.title}</strong>
          <span class="status-${s.status}"> — ${statusLabel}</span>
          ${s.status === "returned" && s.finalGrade?.feedback ? `<p class="muted">Teacher note: ${s.finalGrade.feedback}</p>` : ""}
          ${actionsBlock}`;
      }
      list.appendChild(row);

      // Only while pending/returned - once graded (published), the
      // submission is immutable from the student's side (firestore.rules
      // enforces this too, not just hidden here).
      if (subDoc && subDoc.data().status !== "published") {
        const removeBtn = row.querySelector("[data-remove-submission]");
        if (removeBtn) {
          removeBtn.addEventListener("click", async () => {
            const ok = confirm("Remove this submission? You'll be able to resubmit afterward. This can't be undone.");
            if (!ok) return;
            removeBtn.disabled = true;
            try {
              await deleteDoc(doc(db, "submissions", subDoc.id));
              alert("Removed — you can resubmit now.");
              loadEverything();
            } catch (err) {
              alert("Couldn't remove submission: " + err.message);
              removeBtn.disabled = false;
            }
          });
        }

        const editBtn = row.querySelector("[data-edit-submission]");
        const editContainer = row.querySelector("[data-edit-container]");
        if (editBtn && editContainer) {
          editBtn.addEventListener("click", () => {
            if (editContainer.dataset.open === "true") return;
            const s = subDoc.data();
            // Legacy submissions saved before multi-page support have a
            // single photoData string instead of photoPages[] - fall back
            // so editing/re-saving one doesn't silently drop that photo.
            const existingPhotos = s.photoPages || (s.photoData ? [s.photoData] : []);
            pendingPhotos.set(aDoc.id, [...existingPhotos]);
            editContainer.innerHTML = renderSubmitForm(aDoc.id, a.allowedFileTypes, {
              id: subDoc.id,
              link: s.link || "",
              photoPages: existingPhotos,
            });
            editContainer.dataset.open = "true";
            editBtn.disabled = true;
            renderPhotoThumbs(aDoc.id);
            wireSubmitForm(editContainer.querySelector(".submit-form"));
            const photoInput = editContainer.querySelector(".submission-photo");
            if (photoInput) wirePhotoInput(photoInput);
            editContainer.querySelector("[data-cancel-edit]")?.addEventListener("click", () => {
              editContainer.innerHTML = "";
              editContainer.dataset.open = "false";
              editBtn.disabled = false;
              pendingPhotos.delete(aDoc.id);
            });
          });
        }
      }
    }
  }

  // Mark every section shown this load as seen "now", so this visit's
  // assignments won't read as New next time (and first-seen sections get a
  // baseline). Written after the render loop so the isNew checks above still
  // compare against the previous visit's timestamps.
  for (const sectionId of new Set(allADocs.map((d) => d.data().sectionId))) {
    seen[sectionId] = Date.now();
  }
  saveAssignmentsSeen(seen);

  attachSubmitHandlers();
}

// Submissions graded before this session's switch to single-score grading
// have the old finalGrade.scorePerCriterion shape (no .score), and their
// assignment predates totalPoints entirely - show a plain "Graded" instead
// of "undefined / undefined" for those.
function renderResult(s, a) {
  const hasScore = s.finalGrade?.score !== undefined && a?.totalPoints !== undefined;
  const scoreLine = hasScore ? `${s.finalGrade.score} / ${a.totalPoints}` : "Graded";
  return `<div class="card"><p><strong>${scoreLine}</strong></p><p>${s.finalGrade?.feedback || ""}</p></div>`;
}

const LINK_HINTS = {
  document: "Paste a Google Doc/PDF link, shared as \"anyone with the link can view\"",
  code: "Paste a CodePen link if it fits (single HTML/CSS/JS page - your teacher can see it run live), or a GitHub Gist link for anything else",
  image: "Paste a Drive or Google Slides link, shared as \"anyone with the link can view\"",
  video: "Paste a YouTube link (unlisted is fine)",
};

// Multiple photos share one Firestore document's 1MiB cap, so each photo
// gets a slice of it - MAX_PHOTOS * PER_PHOTO_MAX_LEN (10 * 100,000 =
// 1,000,000 chars) stays under the 1,048,576-byte doc cap with ~48KB left
// for the submission doc's other (tiny string) fields.
const MAX_PHOTOS = 10;
const PER_PHOTO_MAX_LEN = 100000;

function renderSubmitForm(assignmentId, type, prefill = null) {
  const photoBlock = (type === "image" || type === "document") ? `
      <label>Or take/upload photos (up to ${MAX_PHOTOS} pages - select several at once in order, or add one at a time)</label>
      <input type="file" accept="image/*" multiple class="submission-photo" data-assignment="${assignmentId}" />
      <div class="photo-thumbs" data-thumbs="${assignmentId}"></div>
      <p class="muted">Each photo is compressed and saved directly - skip the link above if you use this. For full-quality photos, check if your teacher gave a shared folder link in the Instructions above - upload there instead and paste that file's link.</p>` : "";
  // prefill: { id, link, photoPages } - present only when editing an
  // existing submission in place, never on the normal blank first-submit form.
  const submissionAttr = prefill ? ` data-submission="${prefill.id}"` : "";
  const linkValue = prefill?.link ? ` value="${String(prefill.link).replace(/"/g, "&quot;")}"` : "";
  const cancelBtn = prefill ? ` <button type="button" class="secondary" data-cancel-edit>Cancel</button>` : "";
  return `
    <form class="submit-form" data-assignment="${assignmentId}"${submissionAttr}>
      <label>Submission link</label>
      <input type="url" class="submission-link" placeholder="https://..."${linkValue} />
      <p class="muted">${LINK_HINTS[type] || "Paste a shareable link"}</p>
      ${photoBlock}
      <button type="submit">${prefill ? "Save changes" : "Submit"}</button>${cancelBtn}
    </form>`;
}

// Resizes/compresses a photo client-side so it fits in a Firestore document
// (1MiB doc cap) - there's no Storage in this app, the photo is saved
// straight into the submission doc as a base64 data URL. Shrinks dimensions
// first, then quality, until the encoded string is comfortably under maxLen.
function compressImage(file, maxLen = PER_PHOTO_MAX_LEN) {
  const MAX_DATA_URL_LEN = maxLen;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read that photo."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Couldn't read that photo."));
      img.onload = () => {
        let { width, height } = img;
        const maxDim = 1280;
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);

        let quality = 0.8;
        let dataUrl = canvas.toDataURL("image/jpeg", quality);
        while (dataUrl.length > MAX_DATA_URL_LEN && quality > 0.3) {
          quality -= 0.1;
          dataUrl = canvas.toDataURL("image/jpeg", quality);
        }
        if (dataUrl.length > MAX_DATA_URL_LEN) {
          reject(new Error("Photo is too large even after compression - try a simpler/lighter shot."));
          return;
        }
        resolve(dataUrl);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// assignmentId -> string[] of already-compressed photo data URLs, in the
// order the student added them (i.e. page order).
const pendingPhotos = new Map();

// assignmentId -> assignment data, refreshed every loadEverything() - lets
// the submit-form handler below (wired up once, reused across renders) look
// up an assignment's ownerEmail without a re-fetch at submit time.
const assignmentsById = new Map();

function renderPhotoThumbs(assignmentId) {
  const container = document.querySelector(`[data-thumbs="${assignmentId}"]`);
  if (!container) return;
  const photos = pendingPhotos.get(assignmentId) || [];
  container.innerHTML = photos.map((src, i) => `
    <div class="photo-thumb">
      <img src="${src}" />
      <button type="button" data-remove-photo="${i}">x</button>
    </div>`).join("");
  container.querySelectorAll("[data-remove-photo]").forEach((b) =>
    b.addEventListener("click", () => {
      photos.splice(Number(b.dataset.removePhoto), 1);
      renderPhotoThumbs(assignmentId);
    }));
}

function wirePhotoInput(input) {
  input.addEventListener("change", async () => {
    const assignmentId = input.dataset.assignment;
    const files = [...input.files];
    input.value = ""; // let the same input capture more pages next
    if (files.length === 0) return;

    const photos = pendingPhotos.get(assignmentId) || [];
    pendingPhotos.set(assignmentId, photos);

    const remaining = MAX_PHOTOS - photos.length;
    if (remaining <= 0) {
      alert(`Up to ${MAX_PHOTOS} pages only - remove one first if you need to swap.`);
      return;
    }
    const toAdd = files.slice(0, remaining);
    if (files.length > toAdd.length) {
      alert(`Only adding ${toAdd.length} of the ${files.length} you picked - up to ${MAX_PHOTOS} pages total.`);
    }

    // One at a time (not Promise.all) so pages land in the order picked,
    // and a bad photo partway through doesn't block the rest.
    for (const file of toAdd) {
      try {
        const dataUrl = await compressImage(file);
        photos.push(dataUrl);
        renderPhotoThumbs(assignmentId);
      } catch (err) {
        alert(err.message);
      }
    }
  });
}

function wireSubmitForm(form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const assignmentId = form.dataset.assignment;
    const submissionId = form.dataset.submission || null; // present -> editing an existing doc in place
    const btn = form.querySelector("button");
    const originalLabel = btn.textContent;
    const link = form.querySelector(".submission-link").value.trim();
    const photoPages = pendingPhotos.get(assignmentId) || [];

    if (!link && photoPages.length === 0) {
      alert("Add a link or take a photo first.");
      return;
    }

    btn.disabled = true;
    btn.textContent = submissionId ? "Saving..." : "Submitting...";

    try {
      if (submissionId) {
        // Editing re-queues it for review - always writes status back to
        // "pending", which also clears the "returned" teacher-note state
        // on the card, and refreshes submittedAt.
        await updateDoc(doc(db, "submissions", submissionId), {
          link,
          photoPages,
          status: "pending",
          submittedAt: Date.now(),
        });
      } else {
        // Assignments created before multi-teacher support have no
        // ownerEmail - those belong to the super admin (the one teacher
        // that existed then).
        const assignmentOwnerEmail = assignmentsById.get(assignmentId)?.ownerEmail || ADMIN_EMAIL;
        await addDoc(collection(db, "submissions"), {
          assignmentId,
          studentUID: currentUser.uid,
          studentName: currentUser.displayName || currentUser.email,
          link,
          photoPages,
          status: "pending",
          submittedAt: Date.now(),
          ownerEmail: assignmentOwnerEmail,
        });
      }
      pendingPhotos.delete(assignmentId);
      alert(submissionId ? "Saved — resubmitted for review." : "Submitted!");
      loadEverything();
    } catch (err) {
      alert((submissionId ? "Save failed: " : "Submit failed: ") + err.message);
      btn.disabled = false;
      btn.textContent = originalLabel;
    }
  });
}

function attachSubmitHandlers() {
  document.querySelectorAll(".submission-photo").forEach(wirePhotoInput);
  document.querySelectorAll(".submit-form").forEach(wireSubmitForm);
}

el("sign-out").addEventListener("click", signOutUser);
wireOpenInChromeButtons(el("assignments-list"));

// ---------- init ----------
guardPage("student").then(async (user) => {
  if (!user) return;
  currentUser = user;
  el("student-email").textContent = user.email;
  await applyPendingInvites();
  loadEverything();
  applyPendingJoinCode();
});
