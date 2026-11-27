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

test("an open student page shows new work live, without a reload", async ({ page }) => {
  const errors = trackPageErrors(page);
  await signIn(page, STUDENT, "Juan Dela Cruz");
  await page.waitForURL(/student\.html/);
  await expect(page.locator('.outline-item[data-title="E2E Essay v2"]').first()).toBeAttached();

  // Teacher posts while the student's page stays open (no reload, no Refresh).
  const t = await page.context().browser().newPage();
  await blockProduction(t);
  t.on("dialog", (d) => (d.type() === "prompt" ? d.accept("E2E Live") : d.accept()));
  await signIn(t, TEACHER, "Teacher One");
  await t.waitForURL(/teacher\.html/);
  await t.locator("#subjects-list [data-open]").first().click();
  await t.locator("#sections-list [data-open]").first().click();
  await t.locator("#view-section summary", { hasText: "Create" }).click();
  await t.locator('[data-create-type="assignment"]').click();
  await t.fill("#assignment-title", "E2E Live");
  await t.fill("#assignment-total-points", "5");
  await t.locator("#create-submit-btn").click();
  await expect(t.locator("#assignments-list")).toContainText("E2E Live");

  // watchSections() sees the bumped assignmentsVersion and refreshes by itself.
  await expect(page.locator('.outline-item[data-title="E2E Live"]').first()).toBeAttached({ timeout: 15000 });

  // Student mid-typing: a new post shows the notice instead of re-rendering.
  await page.locator('.outline-item[data-title="E2E Live"]').first().click();
  const form = page.locator('.card[data-title="E2E Live"] .submit-form').first();
  await form.locator(".submission-link").fill("https://docs.google.com/document/d/typing/edit");
  const row = t.locator(".assign-row", { hasText: "E2E Live" }).first();
  await row.locator("details.menu > summary").click();
  await row.locator("[data-delete-assignment]").click();
  await expect(t.locator("#assignments-list")).not.toContainText("E2E Live");
  await t.close();
  await expect(page.locator("#new-work-notice")).toBeVisible({ timeout: 15000 });
  await expect(form.locator(".submission-link")).toHaveValue("https://docs.google.com/document/d/typing/edit");
  await page.locator("#new-work-show").click();
  await expect(page.locator('.outline-item[data-title="E2E Live"]')).toHaveCount(0);
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

test("return for revision lowers the max by 10 (late-resubmission penalty)", async ({ page }) => {
  const errors = trackPageErrors(page);
  const openEssay2 = async (tp) => {
    await tp.locator("#subjects-list [data-open]").first().click();
    await tp.locator("#sections-list [data-open]").first().click();
    await tp.locator("#assignments-list .assign-row", { hasText: "E2E Essay 2" }).locator("[data-open]").click();
    await tp.locator("[data-review]").first().click();
  };
  // Teacher returns the pending "E2E Essay 2" (10 pts) -> max becomes 0.
  const tpage = await page.context().browser().newPage();
  await blockProduction(tpage);
  const alerts = [];
  tpage.on("dialog", (d) => { alerts.push(d.message()); d.accept(); });
  await signIn(tpage, TEACHER, "Teacher One");
  await tpage.waitForURL(/teacher\.html/);
  await openEssay2(tpage);
  await tpage.locator('input[id^="score-"]').fill("5");
  await tpage.locator("[data-return]").click();
  await expect(tpage.locator("#submissions-list")).toContainText(/returned/i);
  expect(alerts.join(" ")).toContain("now 0 of 10");

  // Student sees the new max, has no Remove button, and resubmits.
  await signIn(page, STUDENT, "Juan Dela Cruz");
  await page.waitForURL(/student\.html/);
  const essay2 = page.locator('.outline-item[data-title="E2E Essay 2"]').first();
  await expect(essay2).toBeAttached();
  // Outline dropdowns can start collapsed - open them all.
  await page.evaluate(() => document.querySelectorAll("#course-outline details").forEach((d) => { d.open = true; }));
  await essay2.click();
  const card = page.locator('.card[data-title="E2E Essay 2"]').first();
  await expect(card.locator("[data-cap-note]")).toContainText("max score is now 0 / 10");
  await expect(card.locator("[data-remove-submission]")).toHaveCount(0);
  await card.locator("[data-edit-submission]").click();
  const edit = card.locator("[data-edit-container]");
  await edit.locator(".submission-link").fill("https://docs.google.com/document/d/e2eFixedDoc/edit");
  await edit.locator("button[type=submit]").click();
  await expect(page.locator('.outline-item[data-title="E2E Essay 2"]').first()).toContainText("Submitted");

  // Teacher (fresh tab): 9 is over the new max and is refused; 0 publishes.
  await tpage.close();
  const t2 = await page.context().browser().newPage();
  await blockProduction(t2);
  alerts.length = 0;
  t2.on("dialog", (d) => { alerts.push(d.message()); d.accept(); });
  await signIn(t2, TEACHER, "Teacher One");
  await t2.waitForURL(/teacher\.html/);
  await openEssay2(t2);
  await expect(t2.locator("[data-cap-note]")).toContainText("Max 0 of 10");
  await t2.locator('input[id^="score-"]').fill("9");
  await t2.locator("[data-publish]").click();
  await expect.poll(() => alerts.join(" ")).toContain("between 0 and 0");
  await t2.locator('input[id^="score-"]').fill("0");
  await t2.locator("[data-publish]").click();
  await expect(t2.locator("#submissions-list")).toContainText(/published/i);
  await t2.close();
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

test("photo submission: ZIP download, then Free up space archives graded photos", async ({ page }) => {
  const errors = trackPageErrors(page);
  const openAll = (p) => p.evaluate(() => document.querySelectorAll("#course-outline details").forEach((d) => { d.open = true; }));

  // Teacher creates a document-type assignment.
  const tpage = await page.context().browser().newPage();
  const terrors = trackPageErrors(tpage);
  await blockProduction(tpage);
  tpage.on("dialog", (d) => (d.type() === "prompt" ? d.accept("E2E Photos") : d.accept()));
  await signIn(tpage, TEACHER, "Teacher One");
  await tpage.waitForURL(/teacher\.html/);
  await tpage.locator("#subjects-list [data-open]").first().click();
  await tpage.locator("#sections-list [data-open]").first().click();
  await tpage.locator("#view-section summary", { hasText: "Create" }).click();
  await tpage.locator('[data-create-type="assignment"]').click();
  await tpage.fill("#assignment-title", "E2E Photos");
  await tpage.selectOption("#assignment-filetype", "document");
  await tpage.fill("#assignment-total-points", "10");
  await tpage.locator("#create-submit-btn").click();
  await expect(tpage.locator("#assignments-list")).toContainText("E2E Photos");

  // Student adds two real photos and submits.
  await signIn(page, STUDENT, "Juan Dela Cruz");
  await page.waitForURL(/student\.html/);
  await page.locator('.outline-item[data-title="E2E Photos"]').first().waitFor({ state: "attached" });
  await openAll(page);
  await page.locator('.outline-item[data-title="E2E Photos"]').first().click();
  const form = page.locator('.card[data-title="E2E Photos"] .submit-form').first();
  const makePng = (color) => page.evaluate(async (color) => {
    const c = document.createElement("canvas");
    c.width = 240; c.height = 180;
    const g = c.getContext("2d");
    g.fillStyle = color; g.fillRect(0, 0, 240, 180);
    g.fillStyle = "#fff"; g.font = "28px sans-serif"; g.fillText("E2E " + color, 20, 100);
    const blob = await new Promise((r) => c.toBlob(r, "image/png"));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  }, color);
  const files = [];
  for (const [i, color] of ["#c0392b", "#2980b9"].entries()) {
    files.push({ name: `page${i + 1}.png`, mimeType: "image/png", buffer: Buffer.from(await makePng(color)) });
  }
  const input = form.locator('input[type=file][data-assignment]').first();
  await input.setInputFiles(files[0]);
  await expect(form.locator(".photo-thumb")).toHaveCount(1, { timeout: 20000 });
  await input.setInputFiles(files[1]);
  await expect(form.locator(".photo-thumb")).toHaveCount(2, { timeout: 20000 });
  for (const src of await form.locator(".photo-thumb img").evaluateAll((imgs) => imgs.map((i) => i.src))) {
    expect(src.length).toBeLessThanOrEqual(48000);
  }
  await form.locator("button[type=submit]").click();
  await expect(page.locator('.outline-item[data-title="E2E Photos"]').first()).toContainText("Submitted", { timeout: 20000 });

  // Teacher opens the assignment: Photo submissions card, Free up space disabled.
  await tpage.locator("#go-home").click();
  await tpage.locator("#subjects-list [data-open]").first().click();
  await tpage.locator("#sections-list [data-open]").first().click();
  await tpage.locator("#assignments-list .assign-row", { hasText: "E2E Photos" }).locator("[data-open]").click();
  const details = tpage.locator("details", { has: tpage.locator("#download-all-photos") });
  await expect(tpage.locator("summary", { hasText: "Photo submissions" })).toBeVisible({ timeout: 20000 });
  await tpage.locator("summary", { hasText: "Photo submissions" }).click();
  await expect(tpage.locator("#free-up-space")).toBeDisabled();

  // Grade + publish.
  await tpage.locator("[data-review]").first().click();
  await tpage.locator('input[id^="score-"]').fill("8");
  await tpage.locator("[data-publish]").click();
  await expect(tpage.locator("#submissions-list")).toContainText(/published/i);

  // Download the ZIP (JSZip comes from a CDN).
  if (!(await tpage.locator("#download-all-photos").isVisible())) {
    await tpage.locator("summary", { hasText: "Photo submissions" }).click();
  }
  const [download] = await Promise.all([
    tpage.waitForEvent("download", { timeout: 30000 }),
    tpage.locator("#download-all-photos").click(),
  ]);
  expect(download.suggestedFilename()).toContain("E2E Photos");
  await expect(tpage.locator("#free-up-space")).toBeEnabled();

  // Free up space (type the assignment title at the prompt).
  await tpage.locator("#free-up-space").click();
  await expect(tpage.locator("#submissions-list")).toContainText("Photos archived", { timeout: 20000 });
  await expect(tpage.locator("#submissions-list")).toContainText(/8\s*\/\s*10|published/i);
  await tpage.close();

  // Student sees the archive note and the score.
  await page.reload();
  await page.locator('.outline-item[data-title="E2E Photos"]').first().waitFor({ state: "attached" });
  await openAll(page);
  await page.locator('.outline-item[data-title="E2E Photos"]').first().click();
  await expect(page.locator('.card[data-title="E2E Photos"]').first()).toContainText("Photos archived by teacher (2 pages)");
  await expect(page.locator("body")).toContainText("8 / 10");
  expect(errors, errors.join(" | ")).toEqual([]);
  expect(terrors, terrors.join(" | ")).toEqual([]);
});

test("code lab: C# run, web preview and project submit on a phone", async ({ page, browser }) => {
  const errors = trackPageErrors(page);
  await signIn(page, TEACHER, "Teacher One");
  await page.waitForURL(/teacher\.html/);
  await page.locator("#subjects-list [data-open]").first().click();
  await page.locator("#sections-list [data-open]").first().click();

  const addAssignment = async (title, filetype, lang, starter, instructions) => {
    await page.locator("#email-class-prompt [data-close]").click({ timeout: 1000 }).catch(() => {});
    const createBox = page.locator("#view-section details:has(> summary:has-text('Create'))");
    const summary = createBox.locator("> summary");
    if (!(await createBox.evaluate((d) => d.open))) await summary.click();
    await page.locator('[data-create-type="assignment"]').click();
    await page.fill("#assignment-title", title);
    await page.fill("#assignment-total-points", "10");
    await page.selectOption("#assignment-filetype", filetype);
    if (instructions) await page.fill("#assignment-instructions", instructions);
    if (lang) {
      await page.selectOption("#assignment-codelang", lang);
      await page.fill("#assignment-starter", starter);
    }
    await page.locator("#create-submit-btn").click();
    await expect(page.locator("#assignments-list")).toContainText(title);
  };
  await addAssignment("E2E CSharp", "code", "csharp",
    'using System;\nclass Program { static void Main() { Console.WriteLine("Hi " + Console.ReadLine()); } }');
  await addAssignment("E2E Web", "code", "web", "<h1 id='t'>Hello</h1><script>console.log('ready')</script>",
    "1. Add a <form><textarea> to the page.\n2. Show a heading.");
  await addAssignment("E2E Project", "project");

  const phone = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const sp = await phone.newPage();
  const perrors = trackPageErrors(sp);
  await blockProduction(sp);
  // Wandbox is external: stub it so the test is offline and deterministic.
  await sp.route("https://wandbox.org/**", (r) => r.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ status: "0", program_output: "Hi Ana\n" }),
  }));
  await signIn(sp, STUDENT, "Juan Student");
  await sp.waitForURL(/student\.html/);
  // Student cards stay hidden in outline mode until an outline item is clicked.
  const openItem = async (title) => {
    const item = sp.locator(`.outline-item[data-title="${title}"]`).first();
    await item.waitFor({ state: "attached" });
    await sp.evaluate(() => document.querySelectorAll("#course-outline, #course-outline details").forEach((d) => { d.open = true; }));
    await item.click();
  };

  await openItem("E2E CSharp");
  const cs = sp.locator(".submit-form", { has: sp.locator(".submission-code") }).filter({ hasText: "C#" }).first();
  await expect(cs.locator(".submission-code")).toHaveValue(/class Program/);
  // Submitting the untouched starter is refused with a friendly alert.
  let starterAlert = "";
  sp.once("dialog", (d) => { starterAlert = d.message(); d.accept(); });
  await cs.locator('button[type="submit"]').click();
  await expect.poll(() => starterAlert).toContain("change the starter");
  await cs.locator(".submission-code").fill('using System;\nclass Program { static void Main() { Console.WriteLine("Hi " + Console.ReadLine() + "!"); } }');
  await cs.locator(".submission-stdin").fill("Ana");
  await cs.locator(".submission-run").click();
  await expect(cs.locator(".code-output")).toHaveText("Hi Ana");
  await cs.locator('button[type="submit"]').click();
  await expect(sp.locator('.outline-item[data-title="E2E CSharp"]').first()).toContainText("Submitted");

  await openItem("E2E Web");
  // Bank-style instructions with literal tags must show as text, not break the card.
  const webCard = sp.locator('.card[data-title="E2E Web"]').first();
  await expect(webCard.locator(".instructions-text")).toContainText("<form><textarea>");
  const web = webCard.locator(".submit-form").first();
  await expect(web).toBeVisible();
  await web.locator(".submission-run").click();
  const frame = web.frameLocator("iframe.web-preview");
  await expect(frame.locator("#t")).toHaveText("Hello");
  await expect(web.locator(".web-console")).toContainText("ready");

  await openItem("E2E Project");
  const proj = sp.locator(".submit-form").filter({ has: sp.locator(".submission-demo") }).first();
  await proj.locator(".submission-link").fill("https://github.com/juan/mvc-app");
  await proj.locator(".submission-demo").fill("https://youtu.be/dQw4w9WgXcQ");
  await proj.locator('button[type="submit"]').click();
  await expect(sp.locator('.outline-item[data-title="E2E Project"]').first()).toContainText("Submitted");
  await openItem("E2E Project");
  const projCard = sp.locator('.card[data-title="E2E Project"]').first();
  await expect(projCard).toContainText("Submitted, pending review");
  await expect(projCard.locator('iframe.submission-preview[src*="youtube"]').first()).toBeAttached();
  await phone.close();
  expect(errors, errors.join(" | ")).toEqual([]);
  expect(perrors, perrors.join(" | ")).toEqual([]);
});

test("activity bank fills the assignment form", async ({ page }) => {
  await signIn(page, TEACHER, "Teacher One");
  await page.waitForURL(/teacher\.html/);
  await page.locator("#subjects-list [data-open]").first().click();
  await page.locator("#sections-list [data-open]").first().click();
  await page.locator("#view-section summary", { hasText: "Create" }).click();
  await page.locator('[data-create-type="assignment"]').click();
  await page.locator("#bank-picker summary").click();
  await page.selectOption("#bank-subject", "dotnet");
  await page.selectOption("#bank-week", "6");
  await page.selectOption("#bank-activity", "net-w6-02");
  await page.locator("#bank-use").click();
  await expect(page.locator("#assignment-title")).toHaveValue("Decision Engine: C# Logic Builder");
  await expect(page.locator("#assignment-filetype")).toHaveValue("code");
  await expect(page.locator("#assignment-codelang")).toHaveValue("csharp");
  await expect(page.locator("#assignment-starter")).toHaveValue(/static void Main/);
  await expect(page.locator("#assignment-total-points")).toHaveValue("10");
});

test("Open in the To-do box switches from the Quizzes tab to the Assignments tab", async ({ page }) => {
  const errors = trackPageErrors(page);
  const t = await page.context().browser().newPage();
  await blockProduction(t);
  t.on("dialog", (d) => d.accept());
  await signIn(t, TEACHER, "Teacher One");
  await t.waitForURL(/teacher\.html/);
  await t.locator("#subjects-list [data-open]").first().click();
  await t.locator("#sections-list [data-open]").first().click();
  await t.locator("#view-section summary", { hasText: "Create" }).click();
  await t.locator('[data-create-type="assignment"]').click();
  await t.fill("#assignment-title", "E2E Tab Test");
  await t.fill("#assignment-total-points", "5");
  await t.locator("#create-submit-btn").click();
  await expect(t.locator("#assignments-list")).toContainText("E2E Tab Test");
  await t.close();

  await signIn(page, STUDENT, "Juan Dela Cruz");
  await page.waitForURL(/student\.html/);
  await page.evaluate(() => localStorage.setItem("studentTab", "quizzes"));
  await page.reload();
  await expect(page.locator("#assignments-panel")).toBeHidden();

  const jump = page.locator(".attn-card", { hasText: "E2E Tab Test" }).locator("[data-attn-jump]");
  const id = await jump.getAttribute("data-attn-jump");
  await jump.click();
  await expect(page.locator("#assignments-panel")).toBeVisible();
  await expect(page.locator("#tab-assignments")).toHaveAttribute("aria-selected", "true");
  const card = page.locator(`#assignments-list [data-assignment-id="${id}"]`);
  await expect(card).toHaveClass(/is-open/);
  await expect(card).toBeVisible();
  expect(errors, errors.join(" | ")).toEqual([]);
});
