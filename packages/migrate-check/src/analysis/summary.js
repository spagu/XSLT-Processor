/**
 * The numbers of the migration report: usages, documents, stylesheets,
 * what migrates automatically, what needs a manual review, and the
 * estimated difficulty with the sentence that explains it.
 *
 * @module xslt-migrate-check/analysis/summary
 */

import { recommendedRuntime } from "../recommend.js";
import { difficultyReason } from "../texts.js";

/**
 * @typedef {object} Summary
 * @property {number} nativeUsages - Native XSLTProcessor usage lines
 * @property {number} xmlStylesheetFiles - XML documents with the PI
 * @property {number} stylesheets - XSL stylesheets
 * @property {number} findings - Rated findings
 * @property {number} automatic - Handled by the one-line migration
 * @property {number} manualReview - Needing a person
 * @property {string} recommendedRuntime - What to run instead
 * @property {"LOW"|"MEDIUM"|"HIGH"} difficulty - Estimated difficulty
 * @property {string} difficultyReason - Why, in one sentence
 */

/**
 * Summarise an analysis. Difficulty is LOW when everything is automatic,
 * MEDIUM when there is manual review but no MSXML and no XSLT 2.0/3.0
 * among it, HIGH otherwise.
 *
 * @param {object} analysis - Scan, findings and recommendations
 * @returns {Summary} The numbers
 */
export function summarize(analysis) {
  const { findings } = analysis;
  const manual = findings.filter((f) => !f.automatic);
  const count = (...codes) =>
    manual.filter(
      (f) => f.kind === "stylesheet" && codes.some((c) => f.issues.includes(c)),
    ).length;
  const counts = {
    findings: findings.length,
    manual: manual.length,
    msxml: count("msxml-script", "msxml-function"),
    xslt3: count("xslt3"),
  };
  let difficulty = "LOW";
  if (counts.msxml + counts.xslt3 > 0) difficulty = "HIGH";
  else if (counts.manual > 0) difficulty = "MEDIUM";
  return {
    nativeUsages: analysis.usages.length,
    xmlStylesheetFiles: analysis.xmlDocuments.length,
    stylesheets: analysis.stylesheets.length,
    findings: counts.findings,
    automatic: findings.length - manual.length,
    manualReview: manual.length,
    recommendedRuntime: recommendedRuntime(analysis.recommendations),
    difficulty,
    difficultyReason: difficultyReason(difficulty, counts),
  };
}
