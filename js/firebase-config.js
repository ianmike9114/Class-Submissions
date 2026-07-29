// Get these values from Firebase Console → Project Settings → General → Your apps → SDK setup.
// Safe to be public in a static site - Firestore/Storage/Functions rules are the real gatekeepers.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

const firebaseConfig = {
  apiKey: "REPLACE-ME",
  authDomain: "REPLACE-ME.firebaseapp.com",
  projectId: "REPLACE-ME",
  storageBucket: "REPLACE-ME.appspot.com",
  messagingSenderId: "REPLACE-ME",
  appId: "REPLACE-ME",
};

// Also update this in firestore.rules and storage.rules (both files hardcode it too).
export const TEACHER_EMAIL = "REPLACE-WITH-TEACHER-GMAIL@gmail.com";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);
