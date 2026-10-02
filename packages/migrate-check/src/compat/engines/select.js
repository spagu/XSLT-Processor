/**
 * The choice of the reference engine: Chromium through Playwright when it
 * is installed, else xsltproc on PATH, else none (smoke test). `--reference`
 * (or `--browser`) asks for one and fails when it is not available.
 *
 * @module xslt-migrate-check/compat/engines/select
 */

import { resolve } from "node:path";
import { launchBrowserEngine } from "./browser.js";
import { loadModule } from "./load.js";
import { createXsltprocEngine, detectXsltproc } from "./xsltproc.js";

/** Accepted values of --reference. */
export const REFERENCE_MODES = Object.freeze([
  "auto",
  "browser",
  "xsltproc",
  "none",
]);

/** The name shown when no reference engine runs. */
export const NO_REFERENCE = "none (smoke test: Tradik only, errors reported)";

/**
 * @typedef {object} Reference
 * @property {string} name - Shown in the report
 * @property {Function|null} transform - Runs a pair; null without engine
 * @property {Function} close - Releases the engine
 * @property {string[]} notes - Why a preferred engine was not used
 */

/**
 * Load Playwright (the test runner or the library) from the project.
 *
 * @param {string} projectDir - The scanned directory
 * @param {import("./load.js").ModuleLoader} load - Module loader
 * @returns {Promise<object|null>} The module, null when not installed
 */
async function loadPlaywright(projectDir, load) {
  return (
    (await load("@playwright/test", projectDir)) ??
    load("playwright", projectDir)
  );
}

/**
 * Choose and start the reference engine.
 *
 * @param {"auto"|"browser"|"xsltproc"|"none"} mode - From --reference
 * @param {string} projectDir - The scanned directory
 * @param {object} [deps] - Replacements for tests
 * @returns {Promise<Reference>} The reference
 * @throws {Error} When the requested engine is not available
 */
export async function chooseReference(mode, projectDir, deps = {}) {
  const {
    load = loadModule,
    detect = detectXsltproc,
    launch = launchBrowserEngine,
  } = deps;
  const none = {
    name: NO_REFERENCE,
    transform: null,
    close: async () => {},
    notes: [],
  };
  if (mode === "none") return none;
  const notes = [];
  if (mode === "auto" || mode === "browser") {
    const playwright = await loadPlaywright(projectDir, load);
    if (!playwright && mode === "browser") {
      throw new Error(
        "--browser needs @playwright/test or playwright in the project (and npx playwright install chromium)",
      );
    }
    try {
      if (playwright) {
        return { ...(await launch(playwright, resolve(projectDir))), notes };
      }
    } catch (error) {
      if (mode === "browser") {
        throw new Error(`cannot start Chromium: ${error.message}`, {
          cause: error,
        });
      }
      notes.push(
        `Chromium did not start (${error.message.split("\n")[0]}); using the next engine.`,
      );
    }
  }
  const xsltproc = await detect();
  if (xsltproc) return { ...createXsltprocEngine(xsltproc), notes };
  if (mode === "xsltproc") throw new Error("xsltproc is not on PATH");
  return { ...none, notes };
}
