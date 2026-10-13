import base from "./playwright.config.js";

// User-flow tests (tests/e2e/flows.spec.js) against the local Firebase
// emulators. `npm run e2e:flows` wraps this in firebase emulators:exec.
// Desktop only and one worker: the flows share emulator state in order.
export default {
  ...base,
  testIgnore: [],
  testMatch: ["**/flows.spec.js"],
  workers: 1,
  fullyParallel: false,
  projects: base.projects.filter((p) => p.name === "chromium"),
};
