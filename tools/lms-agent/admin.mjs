// Shared admin init. Every other script goes through this file.
// The Admin SDK BYPASSES firestore.rules, so the owner lock below is the only guard:
// assertOwned() must be called for every doc a script reads to act on or writes.
import { readFileSync } from "node:fs";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const owner = (process.env.LMS_OWNER_EMAIL || "").trim().toLowerCase();
if (!owner) {
  throw new Error("LMS_OWNER_EMAIL is not set. Set it to the teacher email whose data these scripts may touch.");
}
export const OWNER_EMAIL = owner;

if (!getApps().length) {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    // Local emulator: no key, no live project.
    initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-lms-agent" });
  } else {
    const keyPath = process.env.LMS_ADMIN_KEY;
    if (!keyPath) {
      throw new Error("LMS_ADMIN_KEY is not set. Set it to the path of your Firebase service-account JSON (kept outside any repo).");
    }
    let key;
    try {
      key = JSON.parse(readFileSync(keyPath, "utf8"));
    } catch (err) {
      throw new Error(`Could not read the service-account file at LMS_ADMIN_KEY (${err.code || "parse error"}).`);
    }
    initializeApp({ credential: cert(key) });
  }
}

export const db = getFirestore();
export { FieldValue };

// Throws unless the doc belongs to OWNER_EMAIL. `what` is a label for the error.
export function assertOwned(docData, what = "document") {
  const email = String(docData?.ownerEmail || "").trim().toLowerCase();
  if (!docData || email !== OWNER_EMAIL) {
    throw new Error(`Refusing: ${what} is not owned by ${OWNER_EMAIL}.`);
  }
  return docData;
}

export { parseArgs, isMain } from "./cli.mjs";
