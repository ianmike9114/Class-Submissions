// Get these values from Firebase Console → Project Settings → General → Your apps → SDK setup.
// Safe to be public in a static site - firestore.rules is the real gatekeeper.
// No Storage, no Cloud Functions here on purpose: both require the paid Blaze
// plan just to exist, even at zero usage. This app stays on the free Spark
// plan by using links (Drive/YouTube/Gist) instead of file uploads, and
// calling Gemini directly from the browser (see js/gemini.js).
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB4Xz-u22jxEgipf9tc3RuRo4VIzphJcDI",
  authDomain: "simple-lms-40950.firebaseapp.com",
  projectId: "simple-lms-40950",
  storageBucket: "simple-lms-40950.firebasestorage.app",
  messagingSenderId: "1077801155399",
  appId: "1:1077801155399:web:9a2c0d728da9a4a9dbaa62",
};

// The permanent super admins - each can act as any teacher, manage the
// /teachers allowlist (see js/auth.js's isTeacherEmail()), and see/edit any
// teacher's data. The SAME list must be kept in sync in firestore.rules'
// isSuperAdmin() (the real gatekeeper). ADMIN_EMAIL stays the PRIMARY admin
// and doubles as the owner of any pre-multi-tenant "legacy" docs that have
// no ownerEmail field - do not repurpose it; add additional admins to
// SUPER_ADMINS instead.
export const ADMIN_EMAIL = "galutira.ianjoseph.f@gmail.com";
export const SUPER_ADMINS = [
  ADMIN_EMAIL,
  "ckraigpc@gmail.com",
];
// Role gate: is this signed-in email a super admin? Case-insensitive, since
// Google tokens can vary casing. Use this for every "is admin" check in the
// app; keep ADMIN_EMAIL only where the ORIGINAL owner identity matters.
export function isSuperAdmin(email) {
  return !!email && SUPER_ADMINS.some((a) => a.toLowerCase() === email.toLowerCase());
}

// Google OAuth Web Client ID (NOT the same as apiKey above). Firebase
// auto-creates one when you enable Google Sign-In: Firebase Console ->
// Authentication -> Sign-in method -> Google row -> Web SDK configuration
// -> "Web client ID" (ends in .apps.googleusercontent.com). Used directly
// by Google Identity Services (js/auth.js), bypassing Firebase's own
// signInWithRedirect/signInWithPopup - both route through a cross-domain
// hop (your site -> *.firebaseapp.com -> accounts.google.com -> back) that
// modern browsers' third-party storage partitioning silently breaks with
// no error, on Edge/Brave/Safari alike. This avoids that hop entirely.
export const GOOGLE_CLIENT_ID = "1077801155399-94fs3d8c4k1guh7h0tg77j8gg3lbthtv.apps.googleusercontent.com";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Explicit instead of relying on the SDK's implicit default - guarantees
// the session survives a browser restart (IndexedDB-backed) instead of
// silently falling back to a weaker persistence mode in some environments,
// which showed up as teachers/students having to sign in again every time.
setPersistence(auth, browserLocalPersistence);
