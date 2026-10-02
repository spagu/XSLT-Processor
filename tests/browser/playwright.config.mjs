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
    {
      // Chromium with Blink's XSLT feature switched off: what Chrome 158
      // (17 November 2026) ships. Only the specs written for it run here.
      name: "chromium-noxslt",
      testMatch: "xmlStylesheet.spec.mjs",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: { args: ["--disable-blink-features=XSLT"] },
      },
    },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
