import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
// Hosted runs (Vercel + Render free tier) are much slower than a local stack:
// give them more time per test and per assertion instead of reporting slow
// responses as failures (#70).
const remote = !/localhost|127\.0\.0\.1/.test(baseURL);

export default defineConfig({
  testDir: ".",
  timeout: remote ? 90_000 : 30_000,
  expect: { timeout: remote ? 15_000 : 5_000 },
  testMatch: /.*\.spec\.ts/,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: { baseURL },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
