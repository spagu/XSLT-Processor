/**
 * The middle of the terminal report: the per-finding table (HIGH first)
 * and the "What to do" block built from the recommendations.
 *
 * @module xslt-migrate-check/report/findings
 */

import { pluralize } from "../format.js";
import { LINKS } from "../texts.js";

/** Width of the rating column ("MEDIUM" plus two spaces). */
const RATING_WIDTH = 8;

/** Paths longer than this are not used to size the file column. */
const MAX_FILE_WIDTH = 48;

/**
 * Build the per-finding table.
 *
 * @param {import("../analysis/findings.js").Finding[]} findings - Findings,
 *   already sorted
 * @param {{bold: Function}} style - Text decorators
 * @returns {string[]} Lines, empty without findings
 */
export function findingLines(findings, style) {
  if (findings.length === 0) return [];
  const width = Math.min(
    MAX_FILE_WIDTH,
    Math.max(...findings.map((finding) => finding.file.length)),
  );
  return [
    "",
    style.bold(`Found ${pluralize(findings.length, "XSLT usage")}`),
    "",
    ...findings.map(
      (finding) =>
        finding.rating.padEnd(RATING_WIDTH) +
        finding.file.padEnd(width) +
        "  " +
        finding.reason,
    ),
  ];
}

/**
 * Build the lines of one recommendation.
 *
 * @param {import("../recommend.js").Recommendation} recommendation - It
 * @param {number} index - 0-based position
 * @returns {string[]} Lines
 */
function recommendationBlock(recommendation, index) {
  const covers = pluralize(recommendation.findings.length, "file");
  const lines = [
    "",
    `${index + 1}. ${recommendation.title} (${covers})`,
    `   ${recommendation.why}`,
    ...recommendation.commands.map((command) => `   $ ${command}`),
  ];
  if (recommendation.snippet) lines.push(`   ${recommendation.snippet}`);
  if (recommendation.alternative) {
    lines.push(`   or, without a bundler: ${recommendation.alternative}`);
  }
  return lines;
}

/**
 * Build the "What to do" block.
 *
 * @param {import("../recommend.js").Recommendation[]} recommendations - From
 *   recommend()
 * @param {{bold: Function}} style - Text decorators
 * @returns {string[]} Lines, empty without recommendations
 */
export function recommendationLines(recommendations, style) {
  if (recommendations.length === 0) return [];
  return [
    "",
    style.bold("What to do"),
    ...recommendations.flatMap(recommendationBlock),
    "",
    `How-to: ${LINKS.howTo}`,
  ];
}
