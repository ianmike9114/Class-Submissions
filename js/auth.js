import { auth, db, ADMIN_EMAIL, GOOGLE_CLIENT_ID } from "./firebase-config.js";
import {
  GoogleAuthProvider,
  signInWithCredential,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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
    // use_fedcm_for_button was on to pre-empt Chrome's staged FedCM rollout,
    // but Brave's engine doesn't implement the FedCM API at all -
    // navigator.credentials.get() throws NotSupportedError internally
    // inside Google's own client library, with no fallback, so the button
    // silently does nothing on click. Safe to leave off: this app never
    // calls accounts.id.prompt() (One Tap), so the flag only ever affected
    // renderButton() below - no other code path depends on it.
  });
  window.google.accounts.id.renderButton(document.getElementById(buttonElementId), {
    theme: "outline",
    size: "large",
  });
}

export function signOutUser() {
  return signOut(auth);
}

// Super admin is always a teacher; anyone else needs a granted /teachers/
// {email} doc (added by the super admin from teacher.html's Settings panel).
export async function isTeacherEmail(email) {
  if (email === ADMIN_EMAIL) return true;
  const snap = await getDoc(doc(db, "teachers", email.toLowerCase()));
  return snap.exists();
}

// Call on any page that requires a signed-in user. Redirects to the correct
// dashboard if the user is on the wrong page, or back to index if signed out.
export function guardPage(expectedRole) {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        // Preserve any query string (e.g. a join ?code=) across the sign-in
        // hop - a bare redirect used to drop it, which was harmless while
        // sessionStorage (js/student.js) covered the same-browser case, but
        // silently lost the code for good once a student escapes an in-app
        // browser (Messenger etc.) into a genuinely different browser with
        // its own separate sessionStorage.
        if (expectedRole) window.location.href = "index.html" + location.search;
        resolve(null);
        return;
      }
      const role = (await isTeacherEmail(user.email)) ? "teacher" : "student";
      if (expectedRole && role !== expectedRole) {
        window.location.href = (role === "teacher" ? "teacher.html" : "student.html") + location.search;
        return;
      }
      resolve(user);
    });
  });
}
