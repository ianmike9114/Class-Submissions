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
  await tpage.locator("[data-publish]").click();
  await expect(tpage.locator("#submissions-list")).toContainText(/published/i);
  await tpage.close();

  await page.reload();
  // A subject whose work is all graded starts collapsed in the outline.
  const item = page.locator('.outline-item[data-title="E2E Essay"]').first();
  await page.locator(".outline-subject > summary").first().click();
  await item.click();
  await expect(page.locator("body")).toContainText("9 / 10");
  expect(errors, errors.join(" | ")).toEqual([]);
});

test("quiz with a question bank: student gets 5 of 6, teacher sees score out of 5", async ({ page }) => {
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

test("another teacher can't see the first teacher's subject", async ({ page }) => {
  await signIn(page, TEACHER2, "Teacher Two");
  await page.waitForURL(/teacher\.html/);
  await page.waitForTimeout(2000);
  await expect(page.locator("#subjects-list")).not.toContainText("E2E Philosophy");
});
