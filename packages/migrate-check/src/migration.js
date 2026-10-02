/**
 * Facts the report quotes: Chrome's removal schedule, the suggested
 * migration and the package version.
 *
 * @module xslt-migrate-check/migration
 */

import { readFileSync } from "node:fs";
import { URL } from "node:url";

/** Chrome's XSLT removal schedule. */
export const CHROME_SCHEDULE = Object.freeze({
  firstBreak: "Chrome 158 (17 November 2026)",
  finalRemoval: "Chrome 176 (17 August 2027)",
});

const CDN_SCRIPT =
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
 * Read this package's version from its package.json.
 *
 * @returns {string} The version, e.g. "0.1.0"
 */
export function readVersion() {
  const manifest = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );
  return manifest.version;
}
