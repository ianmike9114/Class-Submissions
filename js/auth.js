import { auth, TEACHER_EMAIL } from "./firebase-config.js";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const provider = new GoogleAuthProvider();

export function signIn() {
  return signInWithPopup(auth, provider);
}

export function signOutUser() {
  return signOut(auth);
}

export function isTeacherEmail(email) {
  return email === TEACHER_EMAIL;
}

// Call on any page that requires a signed-in user. Redirects to the correct
// dashboard if the user is on the wrong page, or back to index if signed out.
export function guardPage(expectedRole) {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, (user) => {
      if (!user) {
        if (expectedRole) window.location.href = "index.html";
        resolve(null);
        return;
      }
      const role = isTeacherEmail(user.email) ? "teacher" : "student";
      if (expectedRole && role !== expectedRole) {
        window.location.href = role === "teacher" ? "teacher.html" : "student.html";
        return;
      }
      resolve(user);
    });
  });
}
