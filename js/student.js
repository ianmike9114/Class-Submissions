import { db } from "./firebase-config.js";
import { guardPage, signOutUser } from "./auth.js";
import {
  collection, addDoc, doc, getDoc, getDocs, query, where,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { toEmbedUrl } from "./embed.js";

let currentUser = null;
function el(id) { return document.getElementById(id); }

// ---------- join a class ----------
// If the section already has a roster (Set Roster, teacher side), the
// student picks their real name from it instead of trusting whatever
// Google display name shows - keeps studentName exactly matching the
// roster spelling everywhere it's later compared (Records grid, Enrolled
// Students list). No roster yet -> falls back to the old Google-name flow.
let pendingJoin = null; // { sectionDoc, section, subject } while a name picker is open

async function enroll(sectionId, section, subject, studentName) {
  await addDoc(collection(db, "enrollments"), {
    studentUID: currentUser.uid,
    studentName,
    studentEmail: currentUser.email,
    subjectId: section.subjectId,
    subjectName: subject.name,
    sectionId,
    sectionName: section.sectionName,
  });
}

async function claimedNames(sectionId) {
  const snap = await getDocs(query(collection(db, "enrollments"), where("sectionId", "==", sectionId)));
  return new Set(snap.docs.map((d) => (d.data().studentName || "").toLowerCase()));
}

async function renderNamePicker() {
  const { sectionDoc, section } = pendingJoin;
  const claimed = await claimedNames(sectionDoc.id);
  const available = section.roster.filter((name) => !claimed.has(name.toLowerCase()));
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
  const enrollments = enrollSnap.docs.map((d) => d.data());

  const classesList = el("classes-list");
  classesList.innerHTML = enrollments.length
    ? enrollments.map((en) => `<span class="card" style="display:inline-block; margin-right:0.5rem;">${en.subjectName} — ${en.sectionName}</span>`).join("")
    : '<p class="muted">Not joined to any class yet.</p>';

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
            : `<div class="muted"><a href="${a.instructionsLink}" target="_blank" rel="noopener">Instructions file</a></div>`)
          : "";
        row.innerHTML = `
          <strong>${a.title}</strong> <span class="muted">due ${a.dueDate || "no date"}</span>
          ${a.instructions ? `<p>${a.instructions}</p>` : ""}
          ${instructionsFileBlock}
          <div class="muted">Type: ${a.allowedFileTypes}</div>
          <div>${renderRubric(a.rubric)}</div>
          ${renderSubmitForm(aDoc.id, a.allowedFileTypes)}`;
      } else {
        const s = subDoc.data();
        row.innerHTML = `
          <strong>${a.title}</strong>
          <span class="status-${s.status}"> — ${s.status === "published" ? "Graded" : "Submitted, pending review"}</span>
          ${s.status === "published" ? renderResult(s) : ""}`;
      }
      list.appendChild(row);
    }
  }
  attachSubmitHandlers();
}

function renderRubric(rubric) {
  return `<ul class="muted">${rubric.map((r) => `<li>${r.criterion} (${r.maxPoints} pts)</li>`).join("")}</ul>`;
}

function renderResult(s) {
  const rows = Object.entries(s.finalGrade.scorePerCriterion)
    .map(([k, v]) => `<li>${k}: ${v}</li>`).join("");
  return `<div class="card"><ul>${rows}</ul><p>${s.finalGrade.feedback || ""}</p></div>`;
}

const LINK_HINTS = {
  document: "Paste a Google Doc/PDF link, shared as \"anyone with the link can view\"",
  code: "Paste a CodePen link if it fits (single HTML/CSS/JS page - your teacher can see it run live), or a GitHub Gist link for anything else",
  image: "Paste a Drive or Google Slides link, shared as \"anyone with the link can view\"",
  video: "Paste a YouTube link (unlisted is fine)",
};

function renderSubmitForm(assignmentId, type) {
  const photoBlock = (type === "image" || type === "document") ? `
      <label>Or take/upload a photo</label>
      <input type="file" accept="image/*" capture="environment" class="submission-photo" />
      <img class="photo-preview hidden" />
      <p class="muted">Photo is compressed and saved directly - skip the link above if you use this. For full-quality photos, check if your teacher gave a shared folder link in the Instructions above - upload there instead and paste that file's link.</p>` : "";
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
// first, then quality, until the encoded string is comfortably under the cap.
function compressImage(file) {
  const MAX_DATA_URL_LEN = 700000;
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

function attachSubmitHandlers() {
  document.querySelectorAll(".submission-photo").forEach((input) => {
    input.addEventListener("change", async () => {
      const file = input.files[0];
      const preview = input.parentElement.querySelector(".photo-preview");
      if (!file) return;
      delete input.dataset.compressed;
      preview.classList.add("hidden");
      try {
        const dataUrl = await compressImage(file);
        input.dataset.compressed = dataUrl;
        preview.src = dataUrl;
        preview.classList.remove("hidden");
      } catch (err) {
        alert(err.message);
        input.value = "";
      }
    });
  });

  document.querySelectorAll(".submit-form").forEach((form) => {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const assignmentId = form.dataset.assignment;
      const btn = form.querySelector("button");
      const link = form.querySelector(".submission-link").value.trim();
      const photoInput = form.querySelector(".submission-photo");
      const photoData = photoInput?.dataset.compressed || "";

      if (!link && !photoData) {
        alert("Add a link or take a photo first.");
        return;
      }

      btn.disabled = true;
      btn.textContent = "Submitting...";

      try {
        await addDoc(collection(db, "submissions"), {
          assignmentId,
          studentUID: currentUser.uid,
          studentName: currentUser.displayName || currentUser.email,
          link,
          photoData,
          status: "pending",
          submittedAt: Date.now(),
        });
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

// ---------- init ----------
guardPage("student").then((user) => {
  if (!user) return;
  currentUser = user;
  el("student-email").textContent = user.email;
  loadEverything();
});
