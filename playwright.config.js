import { defineConfig, devices } from "@playwright/test";

// Playwright drives the REAL static pages served exactly as in the repo's
// documented preview (`python -m http.server 8420`). The smoke specs block
// production Firebase hosts (see tests/e2e/smoke.spec.js) so a test run can
// never read or write real teacher/student data.
//
// Full DOM click-through of the teacher/student dashboards is intentionally
// NOT here yet: the app has no data-testid hooks, so such tests would be
// brittle. The high-value functional/security coverage lives in the
// emulator-backed rules suite (npm run test:rules). Add data-testid hooks +
// flows here incrementally.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30000,
  fullyParallel: true,
  reporter: process.env.CI ? "list" : [["list"]],
  use: {
    baseURL: "http://localhost:8420",
    trace: "on-first-retry",
    // Default: Playwright's bundled Chromium (CI installs it via
    // `npx playwright install chromium`). Set PW_CHANNEL to use an already
    // installed system browser instead (e.g. PW_CHANNEL=msedge or =chrome)
    // when the bundled download is unavailable.
    channel: process.env.PW_CHANNEL || undefined,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // Mobile viewport - most students are on phones.
    { name: "mobile", use: { ...devices["Pixel 5"] } },
  ],
  webServer: {
    command: "python -m http.server 8420",
    url: "http://localhost:8420",
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
