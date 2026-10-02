/**
 * Shared test helper: loads the optional peers of the test mode from this
 * repository (the library is the repository's root package, which is not
 * in node_modules). Holds no tests of its own.
 */

import { URL } from "node:url";

/** The library's source entry in this repository. */
export const LIBRARY_URL = new URL("../../../src/index.js", import.meta.url)
  .href;

/** Where each peer comes from in this repository. */
const SOURCES = Object.freeze({
  "@tradik/xslt-processor": LIBRARY_URL,
  jsdom: "jsdom",
  "@tradik/xslt3": "@tradik/xslt3",
});

/**
 * A ModuleLoader for tests: the repository's library, jsdom and
 * @tradik/xslt3 from the workspace.
 *
 * @param {"@tradik/xslt-processor"|"jsdom"|"@tradik/xslt3"} name - Package
 * @returns {Promise<object>} The module
 */
export function loadForTests(name) {
  return import(SOURCES[name]);
}
