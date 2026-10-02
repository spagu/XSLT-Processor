/**
 * Risk assessment: the project's Chrome compatibility risk is the highest
 * rating among its findings; the flags (XSLT 2.0/3.0, MSXML) are kept from
 * 0.1.0 for the JSON output.
 *
 * @module xslt-migrate-check/risk
 */

/** Risk levels, lowest first; the order is what `--fail-on` compares. */
export const RISK_LEVELS = Object.freeze(["NONE", "LOW", "MEDIUM", "HIGH"]);

/** Accepted values of `--fail-on`. */
export const FAIL_ON_VALUES = Object.freeze(["none", "low", "medium", "high"]);

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
 * The project risk: the highest rating of its findings, NONE without any.
 *
 * @param {Array<{rating: string}>} findings - Rated findings
 * @returns {"NONE"|"LOW"|"MEDIUM"|"HIGH"} The risk
 */
export function projectRisk(findings) {
  let level = 0;
  for (const { rating } of findings) {
    level = Math.max(level, RISK_LEVELS.indexOf(rating));
  }
  return RISK_LEVELS[level];
}

/**
 * @typedef {object} Assessment
 * @property {"NONE"|"LOW"|"MEDIUM"|"HIGH"} risk - Chrome compatibility risk
 * @property {boolean} needsXslt3 - A stylesheet declares XSLT 2.0 or 3.0
 * @property {boolean} msxml - A stylesheet uses the MSXML namespace
 */

/**
 * Assess the scan result from its findings.
 *
 * @param {import("./analysis/inspect.js").ScanResult} scan - The scan findings
 * @param {Array<{rating: string}>} findings - The rated findings
 * @returns {Assessment} Risk level and flags
 */
export function assessRisk(scan, findings) {
  return {
    risk: projectRisk(findings),
    needsXslt3: scan.stylesheets.some((sheet) => needsXslt3(sheet.version)),
    msxml: scan.stylesheets.some((sheet) => sheet.msxml),
  };
}

/**
 * Decide the exit status for `--fail-on`.
 *
 * @param {"NONE"|"LOW"|"MEDIUM"|"HIGH"} risk - Assessed risk
 * @param {"none"|"low"|"medium"|"high"} failOn - Threshold from the command
 *   line
 * @returns {boolean} True when the risk is at or above the threshold
 */
export function shouldFail(risk, failOn) {
  const threshold = failOn.toUpperCase();
  if (threshold === "NONE") return false;
  return RISK_LEVELS.indexOf(risk) >= RISK_LEVELS.indexOf(threshold);
}
