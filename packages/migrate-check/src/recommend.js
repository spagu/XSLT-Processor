/**
 * Recommendations: from the rated findings to what to install and what to
 * add, without asking the user to know the package layout. A pure function;
 * the texts come from ./texts.js.
 *
 * @module xslt-migrate-check/recommend
 */

import { pluralize } from "./format.js";
import { NO_RUNTIME, RECOMMENDATIONS } from "./texts.js";

/**
 * @typedef {object} Recommendation
 * @property {string} id - polyfill, loader, xslt3, msxml or server
 * @property {string} title - Short name of the action
 * @property {string} why - When and why
 * @property {string[]} commands - Shell commands
 * @property {string|null} snippet - The line to add
 * @property {string|null} alternative - Another way to add it
 * @property {string} runtime - What runs the XSLT afterwards
 * @property {string[]} findings - Report paths of the files to change (the
 *   "(N files)" of the report)
 */

/** Finding kinds that mean XSLT runs in the browser (migrated files too). */
const BROWSER_KINDS = new Set([
  "script",
  "html-link",
  "xml-stylesheet",
  "migrated",
]);

/**
 * Tell whether a finding has an issue code.
 *
 * @param {import("./analysis/findings.js").Finding} finding - A finding
 * @param {...string} codes - Codes to look for
 * @returns {boolean} True when any is present
 */
const has = (finding, ...codes) =>
  codes.some((code) => finding.issues.includes(code));

/**
 * Select the findings each recommendation covers.
 *
 * @param {import("./analysis/findings.js").Finding[]} findings - Findings
 * @returns {Record<string, Array<object>>} Covered findings by id
 */
function coverage(findings) {
  const browser = findings.some((f) => BROWSER_KINDS.has(f.kind));
  const sheets = findings.filter(
    (f) => f.kind === "stylesheet" && !has(f, "server-only"),
  );
  const runnable = sheets.filter(
    (f) => !has(f, "msxml-script", "msxml-function"),
  );
  return {
    polyfill: findings.filter((f) => f.kind === "script"),
    loader: findings.filter(
      (f) => f.kind === "xml-stylesheet" || f.kind === "html-link",
    ),
    xslt3: sheets.filter((f) => has(f, "xslt3")),
    msxml: findings.filter((f) => has(f, "msxml-script", "msxml-function")),
    server: browser ? [] : runnable,
  };
}

/**
 * The explanation of a recommendation. The polyfill step counts only the
 * script files to change; the stylesheets that run unchanged are named in
 * its explanation instead.
 *
 * @param {string} id - Recommendation id
 * @param {import("./analysis/findings.js").Finding[]} findings - Findings
 * @returns {string} The explanation
 */
function explanation(id, findings) {
  const { why } = RECOMMENDATIONS[id];
  if (id !== "polyfill") return why;
  const unchanged = findings.filter(
    (f) => f.kind === "stylesheet" && f.automatic && !has(f, "server-only"),
  ).length;
  if (unchanged === 0) return why;
  const sheets = pluralize(unchanged, "stylesheet");
  const verb = unchanged === 1 ? "needs" : "need";
  return `${why} The ${sheets} they run ${verb} no change.`;
}

/**
 * Recommend the runtime and the steps for a project, every applicable
 * recommendation once, ordered by the number of files it asks to change
 * (ties keep the order of texts.RECOMMENDATIONS). `findings` lists those
 * files: for the polyfill, the scripts and pages that call XSLTProcessor,
 * not the stylesheets they run.
 *
 * @param {{findings: import("./analysis/findings.js").Finding[]}} analysis -
 *   The analysis (only its findings are read)
 * @returns {Recommendation[]} The recommendations
 */
export function recommend({ findings }) {
  const covered = coverage(findings);
  return Object.keys(RECOMMENDATIONS)
    .map((id) => ({
      id,
      ...RECOMMENDATIONS[id],
      why: explanation(id, findings),
      findings: covered[id].map((f) => f.file),
    }))
    .filter((recommendation) => recommendation.findings.length > 0)
    .sort((a, b) => b.findings.length - a.findings.length);
}

/**
 * The "Recommended runtime" line: @tradik/xslt3 next to the library when a
 * stylesheet needs it, else the runtime of the first recommendation.
 *
 * @param {Recommendation[]} recommendations - From recommend()
 * @returns {string} The runtime
 */
export function recommendedRuntime(recommendations) {
  const ids = new Set(recommendations.map((r) => r.id));
  if (ids.has("xslt3")) return RECOMMENDATIONS.xslt3.runtime;
  for (const id of ["polyfill", "loader", "server", "msxml"]) {
    if (ids.has(id)) return RECOMMENDATIONS[id].runtime;
  }
  return NO_RUNTIME;
}
