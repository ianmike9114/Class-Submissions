// Get these values from Firebase Console → Project Settings → General → Your apps → SDK setup.
// Safe to be public in a static site - Firestore/Storage/Functions rules are the real gatekeepers.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

const firebaseConfig = {
  apiKey: "AIzaSyB4Xz-u22jxEgipf9tc3RuRo4VIzphJcDI",
  authDomain: "simple-lms-40950.firebaseapp.com",
  projectId: "simple-lms-40950",
  storageBucket: "simple-lms-40950.firebasestorage.app",
  messagingSenderId: "1077801155399",
  appId: "1:1077801155399:web:9a2c0d728da9a4a9dbaa62",
};

// Also update this in firestore.rules and storage.rules (both files hardcode it too).
export const TEACHER_EMAIL = "galutira.ianjoseph.f@gmail.com";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);
