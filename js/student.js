import { db, ADMIN_EMAIL } from "./firebase-config.js";
import { guardPage, signOutUser } from "./auth.js";
import {
  collection, addDoc, doc, deleteDoc, getDoc, getDocs, updateDoc, query, where, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { toEmbedUrl, openInChromeButton, wireOpenInChromeButtons } from "./embed.js";

let currentUser = null;
function el(id) { return document.getElementById(id); }

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
  await addDoc(collection(db, "enrollments"), {
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

async function claimedNames(sectionId) {
  const snap = await getDocs(query(collection(db, "enrollments"), where("sectionId", "==", sectionId)));
  return new Set(snap.docs.map((d) => (d.data().studentName || "").toLowerCase()));
}

async function renderNamePicker() {
  const { sectionDoc, section } = pendingJoin;
  const claimed = await claimedNames(sectionDoc.id);
  // Older sections saved a plain string[] roster before gender tracking
  // existed - normalize both shapes to plain names here.
  const rosterNames = section.roster.map((r) => (typeof r === "string" ? r : r.name));
  const available = rosterNames.filter((name) => !claimed.has(name.toLowerCase()));
  const container = el("join-name-picker");

  if (available.length === 0) {
    container.innerHTML = '<p class="muted">All roster names for this class are already claimed. Ask your teacher to check the Enrolled Students list.</p>';
    return;
  }

  container.innerHTML = `
    <label>Which name is yours?</label>
    <select id="join-name-select">
      ${available.map((name) => `<option value="${name}">${name}</option>`).join("")}
    </select>
    <button type="button" id="join-name-confirm">This is me</button>
    <p id="join-name-message" class="muted"></p>`;

  el("join-name-confirm").addEventListener("click", async () => {
    const chosen = el("join-name-select").value;
    const btn = el("join-name-confirm");
    btn.disabled = true;
    try {
      const stillClaimed = await claimedNames(pendingJoin.sectionDoc.id);
      if (stillClaimed.has(chosen.toLowerCase())) {
        el("join-name-message").textContent = "That name was just taken - pick another.";
        renderNamePicker();
        return;
      }
      const sectionName = pendingJoin.section.sectionName;
      await enroll(pendingJoin.sectionDoc.id, pendingJoin.section, pendingJoin.subject, chosen);
      pendingJoin = null;
      el("join-form").reset();
      container.innerHTML = "";
      el("join-message").textContent = `Joined ${sectionName} as ${chosen}!`;
      loadEverything();
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
      const q = query(collection(db, "sections"), where("joinCode", "==", code));
      const snap = await getDocs(q);
      if (snap.empty) {
        msg.textContent = "No class found with that code.";
        return;
      }
      const sectionDoc = snap.docs[0];
      const section = sectionDoc.data();

      const already = await getDocs(query(
        collection(db, "enrollments"),
        where("sectionId", "==", sectionDoc.id),
        where("studentUID", "==", currentUser.uid)
      ));
      if (!already.empty) {
        msg.textContent = "You're already enrolled in this class.";
        return;
      }

      const subject = (await getDoc(doc(db, "subjects", section.subjectId))).data();

      if (!section.roster || section.roster.length === 0) {
        await enroll(sectionDoc.id, section, subject, currentUser.displayName || currentUser.email);
        e.target.reset();
        msg.textContent = `Joined ${section.sectionName}!`;
        loadEverything();
        return;
      }

      pendingJoin = { sectionDoc, section, subject };
      renderNamePicker();
    })());
  } catch (err) {
    msg.textContent = "Join failed: " + err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = "Join";
  }
});

// ---------- load classes + assignments + submissions ----------
async function loadEverything() {
  const enrollSnap = await getDocs(
    query(collection(db, "enrollments"), where("studentUID", "==", currentUser.uid))
  );
  const enrollments = enrollSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const classesList = el("classes-list");
  classesList.innerHTML = enrollments.length
    ? enrollments.map((en) => `
        <span class="card" style="display:inline-block; margin-right:0.5rem;">
          ${en.subjectName} — ${en.sectionName} (<span id="my-name-${en.id}">${en.studentName}</span>)
          <br><span class="muted" style="font-size:0.85em;">Teacher: ${en.teacherName || "—"}</span>
          <button type="button" class="secondary" data-edit-my-name="${en.id}" style="margin-left:0.4rem;">Edit name</button>
          <button type="button" class="secondary" data-toggle-leave="${en.id}" data-current="${!!en.leaveRequested}" style="margin-left:0.4rem;">${en.leaveRequested ? "Cancel leave request" : "Request to leave"}</button>
          ${en.leaveRequested ? '<span class="status-pending"> — leave requested</span>' : ""}
        </span>`).join("")
    : '<p class="muted">Not joined to any class yet.</p>';

  classesList.querySelectorAll("[data-edit-my-name]").forEach((b) =>
    b.addEventListener("click", () => {
      const enrollmentId = b.dataset.editMyName;
      const nameEl = el(`my-name-${enrollmentId}`);
      const current = nameEl.textContent;
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

  for (const [subjectName, aDocs] of assignmentsBySubject) {
    if (aDocs.length === 0) continue;
    const heading = document.createElement("h3");
    heading.textContent = subjectName;
    list.appendChild(heading);

    for (const aDoc of aDocs) {
      const a = aDoc.data();
      const subDoc = (await getDocs(
        query(collection(db, "submissions"),
          where("assignmentId", "==", aDoc.id),
          where("studentUID", "==", currentUser.uid))
      )).docs[0];

      const row = document.createElement("div");
      row.className = "card";

      if (!subDoc) {
        const instructionsEmbed = a.instructionsLink ? toEmbedUrl(a.instructionsLink) : null;
        const instructionsFileBlock = a.instructionsLink
          ? (instructionsEmbed
            ? `<iframe src="${instructionsEmbed}" class="submission-preview"></iframe>`
            : `<div class="muted"><a href="${a.instructionsLink}" target="_blank" rel="noopener">Instructions file</a>${openInChromeButton(a.instructionsLink)}</div>`)
          : "";
        row.innerHTML = `
          <strong>${a.title}</strong> <span class="muted">due ${a.dueDate || "no date"}</span>
          ${a.instructions ? `<p>${a.instructions}</p>` : ""}
          ${instructionsFileBlock}
          <div class="muted">Type: ${a.allowedFileTypes}</div>
          <div class="muted">Total points: ${a.totalPoints}</div>
          ${renderSubmitForm(aDoc.id, a.allowedFileTypes)}`;
      } else {
        const s = subDoc.data();
        row.innerHTML = `
          <strong>${a.title}</strong>
          <span class="status-${s.status}"> — ${s.status === "published" ? "Graded" : "Submitted, pending review"}</span>
          ${s.status === "published" ? renderResult(s, a) : `<div style="margin-top:0.5rem;"><button type="button" class="danger" data-remove-submission="${subDoc.id}">Remove submission</button></div>`}`;
      }
      list.appendChild(row);

      // Only while pending - once graded (published), the submission is
      // immutable from the student's side (firestore.rules enforces this too,
      // not just hidden here).
      if (subDoc && subDoc.data().status !== "published") {
        const removeBtn = row.querySelector("[data-remove-submission]");
        if (removeBtn) {
          removeBtn.addEventListener("click", async () => {
            const ok = confirm("Remove this submission? You'll be able to resubmit afterward. This can't be undone.");
            if (!ok) return;
            removeBtn.disabled = true;
            try {
              await deleteDoc(doc(db, "submissions", subDoc.id));
              loadEverything();
            } catch (err) {
              alert("Couldn't remove submission: " + err.message);
              removeBtn.disabled = false;
            }
          });
        }
      }
    }
  }
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

function renderSubmitForm(assignmentId, type) {
  const photoBlock = (type === "image" || type === "document") ? `
      <label>Or take/upload photos (up to ${MAX_PHOTOS} pages - add one at a time for back-to-back work)</label>
      <input type="file" accept="image/*" class="submission-photo" data-assignment="${assignmentId}" />
      <div class="photo-thumbs" data-thumbs="${assignmentId}"></div>
      <p class="muted">Each photo is compressed and saved directly - skip the link above if you use this. For full-quality photos, check if your teacher gave a shared folder link in the Instructions above - upload there instead and paste that file's link.</p>` : "";
  return `
    <form class="submit-form" data-assignment="${assignmentId}">
      <label>Submission link</label>
      <input type="url" class="submission-link" placeholder="https://..." />
      <p class="muted">${LINK_HINTS[type] || "Paste a shareable link"}</p>
      ${photoBlock}
      <button type="submit">Submit</button>
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

function attachSubmitHandlers() {
  document.querySelectorAll(".submission-photo").forEach((input) => {
    input.addEventListener("change", async () => {
      const assignmentId = input.dataset.assignment;
      const file = input.files[0];
      input.value = ""; // let the same input capture another page next
      if (!file) return;

      const photos = pendingPhotos.get(assignmentId) || [];
      if (photos.length >= MAX_PHOTOS) {
        alert(`Up to ${MAX_PHOTOS} pages only - remove one first if you need to swap.`);
        return;
      }
      try {
        const dataUrl = await compressImage(file);
        photos.push(dataUrl);
        pendingPhotos.set(assignmentId, photos);
        renderPhotoThumbs(assignmentId);
      } catch (err) {
        alert(err.message);
      }
    });
  });

  document.querySelectorAll(".submit-form").forEach((form) => {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const assignmentId = form.dataset.assignment;
      const btn = form.querySelector("button");
      const link = form.querySelector(".submission-link").value.trim();
      const photoPages = pendingPhotos.get(assignmentId) || [];

      if (!link && photoPages.length === 0) {
        alert("Add a link or take a photo first.");
        return;
      }

      btn.disabled = true;
      btn.textContent = "Submitting...";

      try {
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
        pendingPhotos.delete(assignmentId);
        loadEverything();
      } catch (err) {
        alert("Submit failed: " + err.message);
        btn.disabled = false;
        btn.textContent = "Submit";
      }
    });
  });
}

el("sign-out").addEventListener("click", signOutUser);
wireOpenInChromeButtons(el("assignments-list"));

// ---------- init ----------
guardPage("student").then((user) => {
  if (!user) return;
  currentUser = user;
  el("student-email").textContent = user.email;
  loadEverything();
  applyPendingJoinCode();
});
