/**
 * The terminal report: header, 0.1.0 headline lines, the Chrome 158
 * Migration Report block, the per-finding table, what to do, and the
 * detail sections.
 *
 * @module xslt-migrate-check/report/terminal
 */

import { pluralize } from "../format.js";
import { findingLines, recommendationLines } from "./findings.js";
import { detailLines } from "./sections.js";
import { headlineLines, migrationReportLines } from "./summary.js";

/**
 * Text decorators: bold and dim ANSI codes, or nothing.
 *
 * @param {boolean} color - Whether to emit ANSI codes
 * @returns {{bold: Function, dim: Function}} The decorators
 */
export function createStyle(color) {
  return {
    bold: (text) => (color ? `\u001b[1m${text}\u001b[22m` : text),
    dim: (text) => (color ? `\u001b[2m${text}\u001b[22m` : text),
  };
}

/**
 * Format the whole report.
 *
 * @param {import("../analysis/index.js").Analysis} analysis - The analysis
 * @param {object} [options] - Formatting options
 * @param {boolean} [options.color] - Use dim/bold ANSI codes (TTY only)
 * @returns {string} The report, ending with a newline
 */
export function formatReport(analysis, { color = false } = {}) {
  const style = createStyle(color);
  const seconds = (analysis.durationMs / 1000).toFixed(1);
  const headlines = headlineLines(analysis);
  const lines = [
    `xslt-migrate-check ${analysis.version} — scanned ${pluralize(analysis.scannedFiles, "file")} in ${analysis.directory} (${seconds} s)`,
    "",
    ...headlines,
    ...(headlines.length > 0 ? [""] : []),
    ...migrationReportLines(analysis, style),
    ...findingLines(analysis.findings, style),
    ...recommendationLines(analysis.recommendations, style),
    ...detailLines(analysis, style),
  ];
  return `${lines.join("\n")}\n`;
}
