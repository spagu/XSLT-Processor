/**
 * Reference engine: Chromium's native XSLTProcessor through Playwright,
 * with Blink's XSLT feature switched on (so it keeps working after Chrome
 * 158 turns it off by default). The project is served from a private
 * origin, so xsl:include and document() resolve as they would on the site.
 *
 * @module xslt-migrate-check/compat/engines/browser
 */

import { readFile } from "node:fs/promises";
import { posix } from "node:path";
import { URL, pathToFileURL } from "node:url";
import { outputMethod } from "../compare.js";
import { confinedPath } from "./files.js";
import { exportOf } from "./load.js";
import { transformInPage } from "./page.js";

/** The origin the project is served from (never resolved on a network). */
export const ORIGIN = "http://xslt-migrate-test.invalid";

/** Content types by extension; anything else is served as XML. */
const TYPES = Object.freeze({
  ".html": "text/html",
  ".htm": "text/html",
  ".js": "text/javascript",
});

/**
 * Answer a request of the page from the project's files.
 *
 * @param {string} rootDir - The scanned directory
 * @param {object} route - Playwright route
 * @returns {Promise<void>} Resolves when answered
 */
export async function serveFile(rootDir, route) {
  const { pathname } = new URL(route.request().url());
  if (pathname.endsWith("/__xslt-migrate-test__.html")) {
    await route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>test</title>",
    });
    return;
  }
  try {
    const base = `${pathToFileURL(rootDir).href}/`;
    const path = confinedPath(
      rootDir,
      `.${decodeURIComponent(pathname)}`,
      base,
    );
    // Confined to the directory the user asked to test. NOSONAR
    const body = await readFile(path); // NOSONAR
    const contentType = TYPES[posix.extname(pathname)] ?? "application/xml";
    await route.fulfill({ contentType, body });
  } catch {
    await route.fulfill({ status: 404, body: "" });
  }
}

/**
 * Start Chromium and create the engine.
 *
 * @param {object} playwright - The playwright or @playwright/test module
 * @param {string} rootDir - The scanned directory (absolute)
 * @returns {Promise<{name: string, transform: Function, close: Function}>}
 *   The engine
 */
export async function launchBrowserEngine(playwright, rootDir) {
  const chromium = exportOf(playwright, "chromium");
  const browser = await chromium.launch({
    args: ["--enable-blink-features=XSLT"],
  });
  const context = await browser.newContext();
  await context.route(`${ORIGIN}/**`, (route) => serveFile(rootDir, route));
  const page = await context.newPage();
  return {
    name: `Chromium ${browser.version()} (native XSLTProcessor, Playwright)`,
    /**
     * Run one pair in the page.
     *
     * @param {{xml: string, xsl: string, params: object}} pair - The pair
     * @returns {Promise<string>} The serialized result
     */
    async transform({ xml, xsl, params }) {
      const xslPath = confinedPath(
        rootDir,
        xsl,
        `${pathToFileURL(rootDir).href}/`,
      );
      // Confined to the directory the user asked to test. NOSONAR
      const xslText = await readFile(xslPath, "utf8"); // NOSONAR
      const textMethod = outputMethod(xslText, "") === "text";
      const dir = posix.dirname(xsl);
      const folder = dir === "." ? "" : dir + "/";
      await page.goto(`${ORIGIN}/${folder}__xslt-migrate-test__.html`);
      return page.evaluate(transformInPage, {
        xml: `${ORIGIN}/${xml}`,
        xsl: `${ORIGIN}/${xsl}`,
        params,
        textMethod,
      });
    },
    close: () => browser.close(),
  };
}
