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
    // Chrome is enforcing FedCM for Identity Services on a staged rollout -
    // without this, the classic flow breaks with a Google-hosted "Service
    // Not Allowed" error for whichever users have already been migrated,
    // while others are unaffected until their own rollout hits. Opting in
    // explicitly avoids depending on the rollout timing.
    use_fedcm_for_prompt: true,
    use_fedcm_for_button: true,
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
        if (expectedRole) window.location.href = "index.html";
        resolve(null);
        return;
      }
      const role = (await isTeacherEmail(user.email)) ? "teacher" : "student";
      if (expectedRole && role !== expectedRole) {
        window.location.href = role === "teacher" ? "teacher.html" : "student.html";
        return;
      }
      resolve(user);
    });
  });
}
