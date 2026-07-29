import { db, storage } from "./firebase-config.js";
import { guardPage, signOutUser } from "./auth.js";
import {
  collection, addDoc, doc, getDoc, getDocs, query, where,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  ref, uploadBytes, getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

let currentUser = null;
function el(id) { return document.getElementById(id); }

// ---------- join a class ----------
el("join-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const code = el("join-code").value.trim().toUpperCase();
  const msg = el("join-message");
  msg.textContent = "";

  const q = query(collection(db, "sections"), where("joinCode", "==", code));
  const snap = await getDocs(q);
  if (snap.empty) {
    msg.textContent = "No class found with that code.";
    return;
  }
  const sectionDoc = snap.docs[0];
  const section = sectionDoc.data();
  const subject = (await getDoc(doc(db, "subjects", section.subjectId))).data();

  await addDoc(collection(db, "enrollments"), {
    studentUID: currentUser.uid,
    studentName: currentUser.displayName || currentUser.email,
    subjectId: section.subjectId,
    subjectName: subject.name,
    sectionId: sectionDoc.id,
    sectionName: section.sectionName,
  });
  e.target.reset();
  loadEverything();
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

  for (const aDoc of assignSnap.docs) {
    const a = aDoc.data();
    const subDoc = (await getDocs(
      query(collection(db, "submissions"),
        where("assignmentId", "==", aDoc.id),
        where("studentUID", "==", currentUser.uid))
    )).docs[0];

    const row = document.createElement("div");
    row.className = "card";

    if (!subDoc) {
      row.innerHTML = `
        <strong>${a.title}</strong> <span class="muted">due ${a.dueDate || "no date"}</span>
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

function renderSubmitForm(assignmentId, type) {
  if (type === "video") {
    return `
      <form class="submit-form" data-assignment="${assignmentId}" data-kind="video">
        <label>Video link (YouTube unlisted or Google Drive)</label>
        <input type="url" class="video-link" required placeholder="https://..." />
        <button type="submit">Submit</button>
      </form>`;
  }
  return `
    <form class="submit-form" data-assignment="${assignmentId}" data-kind="file">
      <label>File</label>
      <input type="file" class="file-input" required />
      <button type="submit">Submit</button>
    </form>`;
}

function attachSubmitHandlers() {
  document.querySelectorAll(".submit-form").forEach((form) => {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const assignmentId = form.dataset.assignment;
      const kind = form.dataset.kind;
      const btn = form.querySelector("button");
      btn.disabled = true;
      btn.textContent = "Submitting...";

      const base = {
        assignmentId,
        studentUID: currentUser.uid,
        studentName: currentUser.displayName || currentUser.email,
        status: "pending",
        submittedAt: Date.now(),
      };

      try {
        if (kind === "video") {
          base.videoLink = form.querySelector(".video-link").value.trim();
        } else {
          const file = form.querySelector(".file-input").files[0];
          const path = `submissions/${currentUser.uid}/${assignmentId}/${file.name}`;
          const storageRef = ref(storage, path);
          await uploadBytes(storageRef, file);
          base.fileURL = await getDownloadURL(storageRef);
          base.fileName = file.name;
        }
        await addDoc(collection(db, "submissions"), base);
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
