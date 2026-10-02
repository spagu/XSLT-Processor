/**
 * Facts the report quotes: Chrome's removal schedule, the suggested
 * migration and the package version.
 *
 * @module xslt-migrate-check/migration
 */

import { VERSION } from "./version.js";

/** Chrome's XSLT removal schedule. */
export const CHROME_SCHEDULE = Object.freeze({
  firstBreak: "Chrome 158 (17 November 2026)",
  finalRemoval: "Chrome 176 (17 August 2027)",
});

/** The browser bundle on the jsDelivr CDN, major version 1. */
export const CDN_SCRIPT =
  "https://cdn.jsdelivr.net/npm/@tradik/xslt-processor@1/dist/xslt-processor.browser.min.js";

/** The suggested migration, also emitted as `suggestion` in `--json`. */
export const SUGGESTION = Object.freeze({
  package: "@tradik/xslt-processor",
  script: `<script src="${CDN_SCRIPT}"></script>`,
  xmlScript: `<script xmlns="http://www.w3.org/1999/xhtml" src="${CDN_SCRIPT}"></script>`,
  xslt3Package: "@tradik/xslt3",
  xslt3Option: '{ xsltVersion: "auto" }',
  howTo: "https://xslt-processor.tradik.com/blog/migrating-from-native-xslt/",
});

/**
 * This package's version (see ./version.js; a test keeps it equal to
 * package.json).
 *
 * @returns {string} The version, e.g. "0.3.0"
 */
export function readVersion() {
  return VERSION;
}
