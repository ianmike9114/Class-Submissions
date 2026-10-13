// Shared helpers for the emulator-backed user-flow tests (flows.spec.js).
// Everything here talks ONLY to the local Firebase emulators (project
// demo-lms-e2e); production hosts are aborted as a second safety net.

import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";
import { readFileSync } from "node:fs";

export const PROJECT = "demo-lms-e2e";
const PROD_HOSTS = ["firestore.googleapis.com", "identitytoolkit.googleapis.com", "securetoken.googleapis.com"];

let testEnv;
export async function testEnvironment() {
  if (!testEnv) {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT,
      firestore: { host: "127.0.0.1", port: 8080, rules: readFileSync("firestore.rules", "utf8") },
    });
  }
  return testEnv;
}

// Grant a teacher account (what the super admin does from Settings).
export async function seedTeacher(email) {
  const env = await testEnvironment();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "teachers", email), { email, addedAt: Date.now() });
  });
}

export async function resetData() {
  const env = await testEnvironment();
  await env.clearFirestore();
  await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/accounts`, { method: "DELETE" });
}

export async function blockProduction(page) {
  await page.route("**/*", (route) => {
    const host = new URL(route.request().url()).hostname;
    return PROD_HOSTS.includes(host) ? route.abort() : route.continue();
  });
}

export function trackPageErrors(page) {
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

// Signs in through the Auth emulator with a fake (unsigned) Google token -
// the emulator accepts it - then lets index.html's own onAuthStateChanged
// route to the right dashboard, exactly like a real sign-in.
export async function signIn(page, email, name, path = "/index.html") {
  const sep = path.includes("?") ? "&" : "?";
  await page.goto(`${path}${sep}emu=1`);
  await page.waitForFunction(() => !!document.getElementById("signin-prompt"));
  await page.evaluate(async ({ email, name }) => {
    const { auth } = await import("/js/firebase-config.js");
    const m = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");
    const token = JSON.stringify({ sub: "uid-" + email.replace(/\W/g, ""), email, email_verified: true, name });
    await m.signInWithCredential(auth, m.GoogleAuthProvider.credential(token));
  }, { email, name });
}
