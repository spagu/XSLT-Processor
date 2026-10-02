/**
 * Risk assessment: turns the scan findings into a Chrome compatibility risk
 * level and the follow-up flags (XSLT 2.0/3.0, MSXML extensions).
 *
 * @module xslt-migrate-check/risk
 */

/** Risk levels, lowest first; the order is what `--fail-on` compares. */
export const RISK_LEVELS = Object.freeze(["NONE", "MEDIUM", "HIGH"]);

/** Accepted values of `--fail-on`. */
export const FAIL_ON_VALUES = Object.freeze(["none", "medium", "high"]);

/**
 * Tell whether a declared stylesheet version needs the XSLT 3.0 engine.
 *
 * @param {string} version - Declared version attribute, or "unknown"
 * @returns {boolean} True for 2.0, 3.0 and anything at or above 2
 */
export function needsXslt3(version) {
  return Number.parseFloat(version) >= 2;
}

/**
 * @typedef {object} Assessment
 * @property {"NONE"|"MEDIUM"|"HIGH"} risk - Chrome compatibility risk
 * @property {boolean} needsXslt3 - A stylesheet declares XSLT 2.0 or 3.0
 * @property {boolean} msxml - A stylesheet uses MSXML-only extensions
 */

/**
 * Assess the scan result.
 *
 * HIGH: an XML document rendered with `<?xml-stylesheet?>`, a browser-side
 * XSLTProcessor usage not yet migrated, or HTML linking XSL. MEDIUM:
 * stylesheets exist but nothing visible uses them. NONE otherwise.
 *
 * @param {import("./scan.js").ScanResult} scan - The scan findings
 * @returns {Assessment} Risk level and flags
 */
export function assessRisk(scan) {
  let risk = "NONE";
  if (scan.xmlDocuments.length > 0 || scan.usages.length > 0) {
    risk = "HIGH";
  } else if (scan.stylesheets.length > 0) {
    risk = "MEDIUM";
  }
  return {
    risk,
    needsXslt3: scan.stylesheets.some((sheet) => needsXslt3(sheet.version)),
    msxml: scan.stylesheets.some((sheet) => sheet.msxml),
  };
}

/**
 * Decide the exit status for `--fail-on`.
 *
 * @param {"NONE"|"MEDIUM"|"HIGH"} risk - Assessed risk
 * @param {"none"|"medium"|"high"} failOn - Threshold given on the command line
 * @returns {boolean} True when the risk is at or above the threshold
 */
export function shouldFail(risk, failOn) {
  const threshold = failOn.toUpperCase();
  if (threshold === "NONE") return false;
  return RISK_LEVELS.indexOf(risk) >= RISK_LEVELS.indexOf(threshold);
}
