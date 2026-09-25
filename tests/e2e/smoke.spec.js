// Smoke tests: the three real pages load, their ES modules parse and run, and
// the login screen reaches its signed-out state - all WITHOUT touching
// production. We abort every request to the production Firebase data/auth
// backends, so the run can never read or write real teacher/student data.
// (Firebase SDK code on gstatic and the Google Identity widget are left
// reachable so module init behaves normally; only the prod data planes are
// blocked.)
//
// This is a render/wiring smoke, not a full flow. Functional + security
// coverage of the actual rules lives in `npm run test:rules`.

import { test, expect } from "@playwright/test";

const PROD_BACKENDS = [
  "firestore.googleapis.com",
  "firestore.googleapis.com:443",
  "identitytoolkit.googleapis.com",
  "securetoken.googleapis.com",
];

test.beforeEach(async ({ page }) => {
  // Guarantee no production data/auth traffic during the smoke.
  await page.route("**/*", (route) => {
    const host = new URL(route.request().url()).hostname;
    if (PROD_BACKENDS.some((b) => host === b.split(":")[0])) {
      return route.abort();
    }
    return route.continue();
  });
});

// Collects uncaught page errors so a module that throws on load fails the test.
function trackPageErrors(page) {
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

test("login page loads, reaches signed-out state, no uncaught errors", async ({ page }) => {
  const errors = trackPageErrors(page);
  await page.goto("/index.html");

  await expect(page.locator("h1")).toHaveText("Class Submissions");
  // The page starts on "Checking your sign-in…" then, once Firebase reports no
  // user, reveals the sign-in prompt. The page GUARANTEES this reveal by a 5s
  // fallback timer (index.html) even if auth-init is slow; on a mobile UA that
  // init runs slower, so the reveal can land right at ~5s. Wait longer than the
  // app's own 5s fallback here, or the assertion races that timer and flakes.
  await expect(page.locator("#signin-prompt")).toBeVisible({ timeout: 10000 });
  await expect(page.locator("#auth-checking")).toBeHidden();

  expect(errors, `uncaught page errors: ${errors.join(" | ")}`).toEqual([]);
});

test("student page loads its module without uncaught errors", async ({ page }) => {
  const errors = trackPageErrors(page);
  await page.goto("/student.html");
  // We don't assert signed-in UI (no session); we assert the page shell parsed
  // and the module didn't throw on load.
  await expect(page).toHaveTitle(/.+/);
  expect(errors, `uncaught page errors: ${errors.join(" | ")}`).toEqual([]);
});

test("teacher page loads its module without uncaught errors", async ({ page }) => {
  const errors = trackPageErrors(page);
  await page.goto("/teacher.html");
  await expect(page).toHaveTitle(/.+/);
  expect(errors, `uncaught page errors: ${errors.join(" | ")}`).toEqual([]);
});
