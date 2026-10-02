/**
 * The top of the terminal report: the 0.1.0 headline lines (kept so pasted
 * reports stay comparable) and the "Chrome 158 Migration Report" block.
 *
 * @module xslt-migrate-check/report/summary
 */

import { pluralize, summarizeVersions } from "../format.js";
import { CHROME_SCHEDULE, SUGGESTION } from "../migration.js";

/** One sentence per risk level, printed under the risk. */
export const RISK_NOTES = Object.freeze({
  HIGH: `${CHROME_SCHEDULE.firstBreak} stops running XSLT; these pages break then.`,
  MEDIUM: `Nothing calls the browser's XSLT directly, but some stylesheets need a manual check before ${CHROME_SCHEDULE.firstBreak}.`,
  LOW: `Only standard XSLT that runs unchanged on @tradik/xslt-processor or on the server; check what runs it before ${CHROME_SCHEDULE.firstBreak}.`,
  NONE: `No XSLT found; nothing here changes when ${CHROME_SCHEDULE.firstBreak} stops running XSLT.`,
});

/** Width of the label column of the summary block. */
const LABEL_WIDTH = 27;

/**
 * Build the 0.1.0 headline lines ("Found ...").
 *
 * @param {import("../analysis/index.js").Analysis} analysis - The analysis
 * @returns {string[]} Lines, empty when nothing was found
 */
export function headlineLines(analysis) {
  const lines = [];
  const { usages, stylesheets, xmlDocuments, migrated, serverSide } = analysis;
  if (usages.length > 0) {
    const files = new Set(usages.map((usage) => usage.file)).size;
    lines.push(
      `Found ${pluralize(usages.length, "XSLTProcessor usage")} in ${pluralize(files, "file")}`,
    );
  }
  if (stylesheets.length > 0) {
    lines.push(
      `Found ${pluralize(stylesheets.length, "XSL stylesheet")} (${summarizeVersions(stylesheets)})`,
    );
  }
  if (xmlDocuments.length > 0) {
    lines.push(
      `Found ${pluralize(xmlDocuments.length, "XML document")} rendered with <?xml-stylesheet?>`,
    );
  }
  if (migrated.length > 0) {
    lines.push(
      `Found ${pluralize(migrated.length, "file")} already using ${SUGGESTION.package}`,
    );
  }
  if (serverSide.length > 0) {
    lines.push(
      `Server-side / already migrated: package.json depends on ${serverSide.join(", ")}`,
    );
  }
  return lines;
}

/**
 * Pad a label to the value column.
 *
 * @param {string} label - Label without the colon
 * @param {string|number} value - The value
 * @returns {string} "Label:      value"
 */
export function labelled(label, value) {
  const key = `${label}:`;
  return key.padEnd(LABEL_WIDTH) + String(value);
}

/**
 * Build the "Chrome 158 Migration Report" block.
 *
 * @param {import("../analysis/index.js").Analysis} analysis - The analysis
 * @param {{bold: Function, dim: Function}} style - Text decorators
 * @returns {string[]} Lines
 */
export function migrationReportLines(analysis, style) {
  const { summary } = analysis;
  return [
    style.bold("Chrome 158 Migration Report"),
    "",
    style.bold(`Risk: ${analysis.risk}`),
    style.dim(`  ${RISK_NOTES[analysis.risk]}`),
    "",
    labelled("Native XSLTProcessor", pluralize(summary.nativeUsages, "usage")),
    labelled("xml-stylesheet", pluralize(summary.xmlStylesheetFiles, "file")),
    labelled("Stylesheets", summary.stylesheets),
    labelled("Compatible automatically", summary.automatic),
    labelled("Manual review", summary.manualReview),
    "",
    labelled("Recommended runtime", summary.recommendedRuntime),
    `Estimated migration difficulty: ${summary.difficulty}`,
    style.dim(`  ${summary.difficultyReason}`),
  ];
}
