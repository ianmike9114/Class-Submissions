// End-to-end user flows against the LOCAL Firebase emulators (never
// production). Run with `npm run e2e:flows` - firebase emulators:exec starts
// Auth + Firestore for project demo-lms-e2e, then Playwright drives the real
// pages with ?emu=1 (js/firebase-config.js connects to the emulators only on
// localhost). Sign-in uses the Auth emulator's fake Google tokens.

import { test, expect } from "@playwright/test";
import { seedTeacher, resetData, blockProduction, trackPageErrors, signIn } from "./helpers.js";

const TEACHER = "teacher.one@test.com";
const TEACHER2 = "teacher.two@test.com";
const STUDENT = "juan.student@test.com";

test.describe.configure({ mode: "serial" });
// Multi-page flows (two signed-in users, several screens) need more than
// Playwright's 30s default.
test.setTimeout(90000);

test.beforeAll(async () => {
  await resetData();
  await seedTeacher(TEACHER);
  await seedTeacher(TEACHER2);
});

test.beforeEach(async ({ page }) => {
  await blockProduction(page);
  page.on("dialog", (d) => { if (d.type() === "alert") console.log("[alert]", d.message()); d.accept(); });
  page.on("console", (m) => { if (m.type() === "error") console.log("[console]", m.text().slice(0, 200)); });
});

let joinCode = "";

test("teacher creates a subject, section and assignment", async ({ page }) => {
  const errors = trackPageErrors(page);
  await signIn(page, TEACHER, "Teacher One");
  await page.waitForURL(/teacher\.html/);

  await page.locator("#view-subjects summary", { hasText: "Add subject" }).click();
  await page.fill("#subject-name", "E2E Philosophy");
  await page.selectOption("#subject-grade", "Grade 12");
  await page.fill("#subject-year", "2026-2027");
  await page.locator("#add-subject-form button[type=submit]").click();
  await page.locator("#subjects-list [data-open]").first().click();

  await page.fill("#section-name", "Section E2E");
  await page.locator("#add-section-form button[type=submit]").click();
  const codeEl = page.locator("#sections-list code").first();
  await expect(codeEl).toHaveText(/\S+/);
  joinCode = (await codeEl.textContent()).trim();
  await page.locator("#sections-list [data-open]").first().click();

  await page.locator("#view-section summary", { hasText: "Create" }).click();
  await page.locator('[data-create-type="assignment"]').click();
  await page.fill("#assignment-title", "E2E Essay");
  await page.fill("#assignment-total-points", "10");
  await page.locator("#create-submit-btn").click();
  await expect(page.locator("#assignments-list")).toContainText("E2E Essay");
  expect(errors, errors.join(" | ")).toEqual([]);
});

test("student joins with the code and the teacher approves", async ({ page }) => {
  const errors = trackPageErrors(page);
  await signIn(page, STUDENT, "Juan Dela Cruz", `/index.html?code=${joinCode}`);
  await page.waitForURL(/student\.html/);
  await expect(page.locator("#waiting-approval")).toBeVisible({ timeout: 15000 });

  const tpage = await page.context().browser().newPage();
  await blockProduction(tpage);
  tpage.on("dialog", (d) => d.accept());
  await signIn(tpage, TEACHER, "Teacher One");
  await tpage.waitForURL(/teacher\.html/);
  await tpage.locator("#subjects-list [data-open]").first().click();
  await tpage.locator("#open-enrolled").click();
  await tpage.locator("[data-approve-enrollment]").first().click();
  await expect(tpage.locator("[data-approve-enrollment]")).toHaveCount(0);
  await tpage.close();
  expect(errors, errors.join(" | ")).toEqual([]);
});

test("student submits, teacher grades, student sees the score", async ({ page }) => {
  const errors = trackPageErrors(page);
  await signIn(page, STUDENT, "Juan Dela Cruz");
  await page.waitForURL(/student\.html/);
  await page.locator('.outline-item[data-title="E2E Essay"]').first().click();
  const form = page.locator(".submit-form").first();
  await form.locator(".submission-link").fill("https://docs.google.com/document/d/e2eTestDoc/edit");
  await form.locator("button[type=submit]").click();
  await expect(page.locator("body")).toContainText(/submitted|pending|waiting/i);

  const tpage = await page.context().browser().newPage();
  await blockProduction(tpage);
  tpage.on("dialog", (d) => d.accept());
  await signIn(tpage, TEACHER, "Teacher One");
  await tpage.waitForURL(/teacher\.html/);
  await tpage.locator("#subjects-list [data-open]").first().click();
  await tpage.locator("#sections-list [data-open]").first().click();
  await tpage.locator("#assignments-list [data-open]").first().click();
  await tpage.locator("[data-review]").first().click();
  await tpage.locator('input[id^="score-"]').fill("9");
  await expect(tpage.locator("#notif-count")).toHaveText("1");
  await tpage.locator("[data-publish]").click();
  // Re-rendered from memory with the published score patched in, and the bell
  // drops locally - no re-read of the class (see subsMemo / resolvedLocally).
  await expect(tpage.locator("#submissions-list")).toContainText(/published/i);
  await expect(tpage.locator("#notif-count")).toBeHidden();
  // Home still renders with the cached structure + missing-work rollup.
  await tpage.locator("#go-home").click();
  await expect(tpage.locator("#subjects-list")).toContainText("E2E Philosophy");
  await tpage.close();

  await page.reload();
  // A subject whose work is all graded starts collapsed in the outline.
  const item = page.locator('.outline-item[data-title="E2E Essay"]').first();
  await page.locator(".outline-subject > summary").first().click();
  await item.click();
  await expect(page.locator("body")).toContainText("9 / 10");
  expect(errors, errors.join(" | ")).toEqual([]);
});

test("student's cached assignment list picks up a teacher edit on reload", async ({ page }) => {
  const errors = trackPageErrors(page);
  await signIn(page, STUDENT, "Juan Dela Cruz");
  await page.waitForURL(/student\.html/);
  await expect(page.locator('.outline-item[data-title="E2E Essay"]').first()).toBeAttached();
  // The dashboard load stored this class's assignments in localStorage.
  expect(await page.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith("lms.asgCache.")))).toBe(true);

  const tpage = await page.context().browser().newPage();
  await blockProduction(tpage);
  tpage.on("dialog", (d) => d.accept());
  await signIn(tpage, TEACHER, "Teacher One");
  await tpage.waitForURL(/teacher\.html/);
  await tpage.locator("#subjects-list [data-open]").first().click();
  await tpage.locator("#sections-list [data-open]").first().click();
  await tpage.locator("#assignments-list [data-open]").first().click();
  await tpage.locator("#view-assignment summary", { hasText: "Edit assignment" }).click();
  await tpage.fill("#edit-assignment-title", "E2E Essay v2");
  await tpage.locator("#edit-assignment-form button[type=submit]").click();
  await expect(tpage.locator("#assignment-view-title")).toHaveText("E2E Essay v2");
  await tpage.close();

  // touchSection() bumped the section's assignmentsVersion, so the cache refetches.
  await page.reload();
  await expect(page.locator('.outline-item[data-title="E2E Essay v2"]').first()).toBeAttached();
  await expect(page.locator('.outline-item[data-title="E2E Essay"]')).toHaveCount(0);

  // Add + delete reach the warm cache too (per-assignment delta path).
  const t2 = await page.context().browser().newPage();
  await blockProduction(t2);
  t2.on("dialog", (d) => d.accept());
  await signIn(t2, TEACHER, "Teacher One");
  await t2.waitForURL(/teacher\.html/);
  await t2.locator("#subjects-list [data-open]").first().click();
  await t2.locator("#sections-list [data-open]").first().click();
  await t2.locator("#view-section summary", { hasText: "Create" }).click();
  await t2.locator('[data-create-type="assignment"]').click();
  await t2.fill("#assignment-title", "E2E Temp");
  await t2.fill("#assignment-total-points", "5");
  await t2.locator("#create-submit-btn").click();
  await expect(t2.locator("#assignments-list")).toContainText("E2E Temp");
  await page.reload();
  await expect(page.locator('.outline-item[data-title="E2E Temp"]').first()).toBeAttached();
  await expect(page.locator('.outline-item[data-title="E2E Essay v2"]').first()).toBeAttached();

  const tempRow = t2.locator(".assign-row", { hasText: "E2E Temp" }).first();
  await tempRow.locator("details.menu > summary").click();
  t2.removeAllListeners("dialog");
  t2.on("dialog", (d) => (d.type() === "prompt" ? d.accept("E2E Temp") : d.accept()));
  await tempRow.locator("[data-delete-assignment]").click();
  await expect(t2.locator("#assignments-list")).not.toContainText("E2E Temp");
  await t2.close();
  await page.reload();
  await expect(page.locator('.outline-item[data-title="E2E Essay v2"]').first()).toBeAttached();
  await expect(page.locator('.outline-item[data-title="E2E Temp"]')).toHaveCount(0);
  expect(errors, errors.join(" | ")).toEqual([]);
});

test("quiz with a question bank:student gets 5 of 6, teacher sees score out of 5", async ({ page }) => {
  const errors = trackPageErrors(page);
  const tpage = await page.context().browser().newPage();
  await blockProduction(tpage);
  tpage.on("dialog", (d) => d.accept());
  await signIn(tpage, TEACHER, "Teacher One");
  await tpage.waitForURL(/teacher\.html/);
  await tpage.locator("#subjects-list [data-open]").first().click();
  await tpage.locator("#sections-list [data-open]").first().click();
  await tpage.locator("#view-section summary", { hasText: "Create" }).click();
  await tpage.locator('[data-create-type="quiz"]').click();
  await tpage.fill("#assignment-title", "E2E Quiz");
  const builder = tpage.locator("#assignment-quiz-builder");
  for (let i = 0; i < 6; i++) {
    await builder.locator(".qb-add").click();
    const item = builder.locator(".qb-item").nth(i);
    await item.locator("select.qb-type").selectOption("tf");
    await builder.locator(".qb-item").nth(i).locator('textarea[data-f="prompt"]').fill(`Statement number ${i + 1} is true.`);
  }
  await builder.locator(".qb-draw").selectOption("5");
  await tpage.locator("#create-submit-btn").click();
  await expect(tpage.locator("#assignments-list")).toContainText("E2E Quiz");

  await signIn(page, STUDENT, "Juan Dela Cruz");
  await page.waitForURL(/student\.html/);
  await page.locator("#tab-quizzes").click();
  await page.locator("[data-start-quiz]").first().click();
  await expect(page.locator(".quiz-progress-text")).toHaveText("Item 1 of 5");
  // Full-screen gate (browsers that support element full screen).
  const gate = page.locator(".quiz-fs-gate");
  if (await gate.isVisible()) {
    await gate.locator(".quiz-fs-btn").click();
    await expect(gate).toBeHidden();
  }
  for (let i = 0; i < 5; i++) {
    await page.locator('.quiz-choice[data-val="true"]').click();
    await page.locator(".quiz-next").click();
  }
  await expect(page.locator(".quiz-overlay")).toHaveCount(0, { timeout: 15000 });

  await tpage.close();
  const rpage = await page.context().browser().newPage();
  await blockProduction(rpage);
  await signIn(rpage, TEACHER, "Teacher One");
  await rpage.waitForURL(/teacher\.html/);
  await rpage.locator("#subjects-list [data-open]").first().click();
  await rpage.locator("#sections-list [data-open]").first().click();
  await rpage.locator('#assignments-list [data-open]', { hasText: /results/i }).first().click();
  await expect(rpage.locator("#submissions-list")).toContainText("/ 5");
  await rpage.close();
  expect(errors, errors.join(" | ")).toEqual([]);
});

test("a submission made on one device shows on the student's other device", async ({ page }) => {
  const errors = trackPageErrors(page);
  // Teacher adds a second assignment.
  const tpage = await page.context().browser().newPage();
  await blockProduction(tpage);
  tpage.on("dialog", (d) => d.accept());
  await signIn(tpage, TEACHER, "Teacher One");
  await tpage.waitForURL(/teacher\.html/);
  await tpage.locator("#subjects-list [data-open]").first().click();
  await tpage.locator("#sections-list [data-open]").first().click();
  await tpage.locator("#view-section summary", { hasText: "Create" }).click();
  await tpage.locator('[data-create-type="assignment"]').click();
  await tpage.fill("#assignment-title", "E2E Essay 2");
  await tpage.fill("#assignment-total-points", "10");
  await tpage.locator("#create-submit-btn").click();
  await expect(tpage.locator("#assignments-list")).toContainText("E2E Essay 2");
  await tpage.close();

  // "Phone" (this page) and "PC" (another browser context) both load - warm caches.
  await signIn(page, STUDENT, "Juan Dela Cruz");
  await page.waitForURL(/student\.html/);
  const pc = await page.context().browser().newPage();
  await blockProduction(pc);
  pc.on("dialog", (d) => d.accept());
  await signIn(pc, STUDENT, "Juan Dela Cruz");
  await pc.waitForURL(/student\.html/);
  await expect(pc.locator('.outline-item[data-title="E2E Essay 2"]').first()).toBeAttached();
  await expect(pc.locator('.outline-item[data-title="E2E Essay 2"]').first()).not.toContainText("Submitted");

  // Submit on the "phone".
  await page.locator('.outline-item[data-title="E2E Essay 2"]').first().click();
  const form = page.locator('.card[data-title="E2E Essay 2"] .submit-form').first();
  await form.locator(".submission-link").fill("https://docs.google.com/document/d/e2eSecondDoc/edit");
  await form.locator("button[type=submit]").click();
  await expect(page.locator('.outline-item[data-title="E2E Essay 2"]').first()).toContainText("Submitted");

  // The "PC" picks it up on reload via enrollment.subsVersion.
  await pc.reload();
  await expect(pc.locator('.outline-item[data-title="E2E Essay 2"]').first()).toContainText("Submitted");
  await pc.close();
  expect(errors, errors.join(" | ")).toEqual([]);
});

test("quiz builder spreads multiple-choice answers over A-D", async ({ page }) => {
  const errors = trackPageErrors(page);
  await signIn(page, TEACHER, "Teacher One");
  await page.waitForURL(/teacher\.html/);
  await page.locator("#subjects-list [data-open]").first().click();
  await page.locator("#sections-list [data-open]").first().click();
  await page.locator("#view-section summary", { hasText: "Create" }).click();
  await page.locator('[data-create-type="quiz"]').click();
  const builder = page.locator("#assignment-quiz-builder");
  for (let i = 0; i < 8; i++) {
    await builder.locator(".qb-add").click();
    const item = builder.locator(".qb-item").nth(i);
    await item.locator('textarea[data-f="prompt"]').fill(`Question ${i + 1}?`);
    for (const [c, text] of ["right", "wrong one", "wrong two", "wrong three"].entries()) {
      await item.locator(`input[data-f="choice"][data-c="${c}"]`).fill(text);
    }
    await item.locator('input[data-f="mc-answer"][value="0"]').check();
  }
  await expect(builder.locator(".qb-pattern-warn")).toContainText("8 of 8");
  await builder.locator(".qb-spread").click();
  await expect(builder.locator(".qb-pattern-warn")).toBeHidden();
  const picked = await builder.locator(".qb-item").evaluateAll((items) => items.map((li) => {
    const ans = li.querySelector('input[data-f="mc-answer"]:checked').value;
    return { ans, text: li.querySelector(`input[data-f="choice"][data-c="${ans}"]`).value };
  }));
  expect(new Set(picked.map((p) => p.ans)).size).toBeGreaterThan(1);
  expect(picked.every((p) => p.text === "right")).toBe(true);
  expect(errors, errors.join(" | ")).toEqual([]);
});

test("Android app without Play Services signs in with a pasted email link", async ({ browser }) => {
  // The app's WebView user agent carries ClassSubmissionsApp/ (isLmsApp()).
  // No Capacitor here, so the native Google picker fails - like a phone
  // without Google Play Services - and the email-link panel must open.
  const ctx = await browser.newContext({ userAgent: "Mozilla/5.0 (Linux; Android 13) Chrome/120 Mobile ClassSubmissionsApp/1" });
  const page = await ctx.newPage();
  await blockProduction(page);
  const errors = trackPageErrors(page);
  const email = "app.student@test.com";
  await page.goto("/index.html?emu=1");
  await page.locator("#app-google-signin").click();
  await expect(page.locator("#app-email-link")).toBeVisible();
  await page.locator("#app-email-input").fill(email);
  await page.locator("#app-email-send").click();
  await expect(page.locator("#app-email-status")).toContainText("Link sent");
  const res = await fetch("http://127.0.0.1:9099/emulator/v1/projects/demo-lms-e2e/oobCodes");
  const link = (await res.json()).oobCodes.filter((c) => c.email === email && c.requestType === "EMAIL_SIGNIN").pop().oobLink;
  await expect(page.locator("#app-step2")).toBeVisible();
  // Pasting a real link signs in on its own (no extra tap).
  await page.locator("#app-link-paste").fill(link);
  await page.waitForURL(/student\.html/);
  expect(errors, errors.join(" | ")).toEqual([]);
  await ctx.close();
});

test("another teacher can't see the first teacher's subject", async ({ page }) => {
  await signIn(page, TEACHER2, "Teacher Two");
  await page.waitForURL(/teacher\.html/);
  await page.waitForTimeout(2000);
  await expect(page.locator("#subjects-list")).not.toContainText("E2E Philosophy");
});
