// Direct browser -> EmailJS calls. No backend, no Cloud Function - keeps the
// whole app on Firebase's free Spark plan, same reasoning as js/gemini.js.
//
// EmailJS service/template/public key are typed once into the teacher's
// Settings box and kept in localStorage only - never written to any file,
// never committed to git, and never loaded on student.html.

const STORAGE_KEY = "emailjsConfig";
const SDK_URL = "https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.js";

let sdkPromise = null;

export function getEmailConfig() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { serviceId: "", templateId: "", publicKey: "" };
  } catch {
    return { serviceId: "", templateId: "", publicKey: "" };
  }
}

export function saveEmailConfig(config) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    serviceId: config.serviceId.trim(),
    templateId: config.templateId.trim(),
    publicKey: config.publicKey.trim(),
  }));
}

function loadSdk() {
  if (!sdkPromise) sdkPromise = import(SDK_URL);
  return sdkPromise;
}

// students: [{ name, email }]. One send per student so a bad address can't
// abort the rest of the batch - returns counts, never throws.
export async function notifySection({ students, subjectName, sectionName, assignmentTitle, dueDate }) {
  const { serviceId, templateId, publicKey } = getEmailConfig();
  if (!serviceId || !templateId || !publicKey) return { sent: 0, failed: 0, skipped: true };

  const emailjs = (await loadSdk()).default;
  let sent = 0;
  let failed = 0;
  for (const student of students) {
    if (!student.email) { failed++; continue; }
    try {
      await emailjs.send(serviceId, templateId, {
        to_email: student.email,
        to_name: student.name,
        subject_name: subjectName,
        section_name: sectionName,
        assignment_title: assignmentTitle,
        due_date: dueDate || "",
      }, publicKey);
      sent++;
    } catch (err) {
      console.error("notify: failed to email", student.email, err);
      failed++;
    }
  }
  return { sent, failed, skipped: false };
}
