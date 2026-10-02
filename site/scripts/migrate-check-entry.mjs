/**
 * Entry of the browser bundle of xslt-migrate-check for the online check
 * (/check/): the analysis of `xslt-migrate-check/analyze`, the HTML report
 * renderer of `--html` and the directory names the CLI never scans. vendor.mjs
 * bundles it into site/static/vendor/migrate-check.browser.min.js; the page
 * imports that with import().
 *
 * report/html.js and walker.js also import Node.js built-ins for the
 * functions that write files and walk directories; the page uses neither,
 * and vendor.mjs replaces those built-ins with stubs that throw.
 *
 * @module migrate-check-entry
 */

export {
  analyzeFiles,
  isAnalysed,
} from "../../packages/migrate-check/src/analyze.js";
export { renderHtml } from "../../packages/migrate-check/src/report/html.js";
export { createIgnoreMatcher } from "../../packages/migrate-check/src/ignore.js";
