// Production smoke - runs against the LIVE site after each deploy and daily.
// Strictly read-only: nothing signs in, and every request to Firestore,
// Firebase Auth, Groq or Gemini is aborted, so a run costs zero Spark quota
// and can't read or write any teacher/student data. It only proves the
// deployed pages, their versioned assets and the sign-in screen work.

import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const BLOCKED_HOSTS = [
  "firestore.googleapis.com",
  "identitytoolkit.googleapis.com",
  "securetoken.googleapis.com",
  "api.groq.com",
  "generativelanguage.googleapis.com",
];

let blocked = 0;
test.beforeEach(async ({ page }) => {
  await page.route("**/*", (route) => {
    const host = new URL(route.request().url()).hostname;
    if (BLOCKED_HOSTS.includes(host)) { blocked++; return route.abort(); }
    return route.continue();
  });
});
test.afterAll(() => {
  console.log(`Aborted ${blocked} Firestore/Auth/AI request(s) - production data untouched.`);
});

function trackPageErrors(page) {
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

test("login page reaches the signed-out sign-in screen", async ({ page }) => {
  const errors = trackPageErrors(page);
  await page.goto("/index.html");
  await expect(page.locator("h1")).toHaveText("Class Submissions");
  await expect(page.locator("#signin-prompt")).toBeVisible({ timeout: 15000 });
  // Google's button renders, or the app's own slow-network message shows.
  await expect
    .poll(async () => (await page.locator("#google-signin-button > *").count()) > 0
      || (await page.locator("#error").isVisible()), { timeout: 15000 })
    .toBe(true);
  expect(errors, `uncaught page errors: ${errors.join(" | ")}`).toEqual([]);
});

for (const pageName of ["student.html", "teacher.html"]) {
  test(`${pageName} signed out redirects to the login page`, async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.goto(`/${pageName}`);
    await page.waitForURL(/index\.html/, { timeout: 20000 });
    expect(errors, `uncaught page errors: ${errors.join(" | ")}`).toEqual([]);
  });
}

test("versioned assets, service worker, manifest and icons are served", async ({ request }) => {
  const paths = new Set(["/sw.js", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"]);
  for (const html of ["index.html", "student.html", "teacher.html"]) {
    const body = await (await request.get(`/${html}`)).text();
    for (const m of body.matchAll(/(?:src|href)="\/?((?:js|css)\/[^"]+\?v=\d+)"/g)) paths.add("/" + m[1]);
  }
  for (const p of paths) {
    const res = await request.get(p);
    expect(res.status(), `${p} -> ${res.status()}`).toBe(200);
  }
});

test("deployed ?v= cache-busters match this commit (no stale deploy)", async ({ request }) => {
  for (const html of ["index.html", "student.html", "teacher.html"]) {
    const local = readFileSync(html, "utf8");
    const live = await (await request.get(`/${html}`)).text();
    const versions = (s) => [...s.matchAll(/[\w./-]+\.(?:js|css)\?v=\d+/g)].map((m) => m[0]).sort();
    expect(versions(live), `${html} on the live site differs from the repo`).toEqual(versions(local));
  }
});
