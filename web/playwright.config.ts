import { defineConfig } from "@playwright/test";

// Runs against the local dev server + Firebase emulators (npm run emulators, npm run dev:local).
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 180_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure", screenshot: "only-on-failure" },
});
