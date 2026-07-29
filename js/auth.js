import { auth, TEACHER_EMAIL } from "./firebase-config.js";
import {
  GoogleAuthProvider,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const provider = new GoogleAuthProvider();

// Redirect flow, not popup: popups need browser storage to hand state back
// to the opening page, which mobile Safari and several mobile browsers
// block or restrict ("Unable to save initial state"). Redirect just
// navigates away and back, works everywhere popups don't.
export function signIn() {
  return signInWithRedirect(auth, provider);
}

// Call once on index.html load to surface any error from a redirect
// sign-in attempt (e.g. popup-era code would have caught this via the
// signInWithPopup promise rejection - redirect needs this instead).
export function checkRedirectResult() {
  return getRedirectResult(auth);
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
