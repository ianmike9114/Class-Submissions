import { defineConfig, devices } from "@playwright/test";

// Production smoke: drives the LIVE site read-only (no sign-in, every
// Firestore/Auth/AI request aborted - see tests/prod/prod-smoke.spec.js), so
// it can never touch real data or the Spark daily quota. Run by
// .github/workflows/prod-smoke.yml after each production deploy and daily.
export default defineConfig({
  testDir: "tests/prod",
  timeout: 45000,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: process.env.PROD_URL || "https://deped-class-submissions.vercel.app",
    channel: process.env.PW_CHANNEL || undefined,
    trace: "on-first-retry",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 5"] } },
  ],
});
