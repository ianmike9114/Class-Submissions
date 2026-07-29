import { auth, TEACHER_EMAIL, GOOGLE_CLIENT_ID } from "./firebase-config.js";
import {
  GoogleAuthProvider,
  signInWithCredential,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// Uses Google Identity Services directly (the accounts.google.com/gsi/client
// script tag on index.html) instead of Firebase's signInWithPopup/Redirect.
// Both of those route through a cross-domain hop (your site -> Firebase's
// *.firebaseapp.com authDomain -> Google -> back) that modern browsers'
// third-party storage partitioning silently breaks with zero error, on
// Edge/Brave/Safari alike. GIS talks to Google directly from this page, so
// there's no cross-domain handoff to break - then the resulting ID token is
// handed to Firebase via signInWithCredential (no redirect involved).
//
// Call once, on page load, on any page with a <div id="google-signin-button">.
// onSignInError receives an Error if the Firebase credential exchange fails.
export function initGoogleSignIn(buttonElementId, onSignInError) {
  window.google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: async (response) => {
      try {
        const credential = GoogleAuthProvider.credential(response.credential);
        await signInWithCredential(auth, credential);
      } catch (e) {
        onSignInError?.(e);
      }
    },
  });
  window.google.accounts.id.renderButton(document.getElementById(buttonElementId), {
    theme: "outline",
    size: "large",
  });
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
