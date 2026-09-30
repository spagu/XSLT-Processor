/**
 * Playwright configuration of the browser tests (`npm run test:browser`).
 *
 * The bundles must be built first (`npm run build`); the static server in
 * server.mjs serves dist/ and the fixtures. Select engines with
 * `--project chromium|firefox|webkit`.
 */

import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.BROWSER_TEST_PORT ?? 4173);

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.mjs",
  outputDir: "../../test-results/browser",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? [["list"], ["github"]] : [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `node server.mjs ${port}`,
    cwd: import.meta.dirname,
    url: `http://127.0.0.1:${port}/tests/browser/fixtures/esm.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
