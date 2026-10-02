/**
 * Human-readable report: the headline lines people paste into issues, the
 * suggested migration and the detail sections.
 *
 * @module xslt-migrate-check/report
 */

import { describeStylesheet, pluralize, summarizeVersions } from "./format.js";
import { CHROME_SCHEDULE, SUGGESTION } from "./migration.js";

/**
 * @typedef {object} Analysis
 * @property {string} version - Tool version
 * @property {string} directory - Scanned directory as shown to the user
 * @property {number} scannedFiles - Files read
 * @property {number} durationMs - Scan time
 * @property {"NONE"|"MEDIUM"|"HIGH"} risk - Chrome compatibility risk
 * @property {boolean} needsXslt3 - A stylesheet declares XSLT 2.0 or 3.0
 * @property {boolean} msxml - A stylesheet uses MSXML extensions
 * @property {Array<object>} usages - XSLTProcessor usages
 * @property {Array<object>} stylesheets - XSL stylesheets
 * @property {Array<object>} xmlDocuments - XML documents with a PI
 * @property {Array<object>} migrated - Files already using the polyfill
 * @property {string[]} serverSide - Server-side packages in package.json
 */

const RISK_NOTES = {
  HIGH: `${CHROME_SCHEDULE.firstBreak} stops running XSLT; these pages break then.`,
  MEDIUM: `Stylesheets found but no browser usage; check what runs them before ${CHROME_SCHEDULE.firstBreak}.`,
  NONE: `No XSLT found; nothing here changes when ${CHROME_SCHEDULE.firstBreak} stops running XSLT.`,
};

/**
 * Build the headline lines ("Found ..." and the risk).
 *
 * @param {Analysis} analysis - The analysis
 * @param {{bold: Function, dim: Function}} style - Text decorators
 * @returns {string[]} Lines
 */
function headlineLines(analysis, style) {
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
  lines.push(
    style.bold(`Chrome compatibility risk: ${analysis.risk}`),
    style.dim(`  ${RISK_NOTES[analysis.risk]}`),
  );
  return lines;
}

/**
 * Build the "Suggested migration" block.
 *
 * @param {Analysis} analysis - The analysis
 * @returns {string[]} Lines, empty when nothing needs migrating
 */
function suggestionLines(analysis) {
  if (analysis.risk === "NONE") return [];
  const lines = [
    "",
    `Suggested migration: ${SUGGESTION.package}`,
    "  One line, before your other scripts, keeps XSLTProcessor working:",
    `  ${SUGGESTION.script}`,
    "  Inside an XML document rendered with <?xml-stylesheet?>, right after the processing instruction:",
    `  ${SUGGESTION.xmlScript}`,
  ];
  if (analysis.needsXslt3) {
    lines.push(
      `  XSLT 2.0/3.0 stylesheets: also install ${SUGGESTION.xslt3Package} and pass ${SUGGESTION.xslt3Option}.`,
    );
  }
  if (analysis.msxml) {
    lines.push(
      "  MSXML extensions (msxsl:) will not work in any browser polyfill; rewrite those templates.",
    );
  }
  lines.push(`  How-to: ${SUGGESTION.howTo}`);
  return lines;
}

/**
 * Build one detail section.
 *
 * @param {string} title - Section title
 * @param {string[]} entries - Already formatted entries
 * @param {{bold: Function}} style - Text decorators
 * @returns {string[]} Lines, empty when there are no entries
 */
function section(title, entries, style) {
  if (entries.length === 0) return [];
  return ["", style.bold(title), ...entries.map((entry) => `  ${entry}`)];
}

/**
 * Format the whole report.
 *
 * @param {Analysis} analysis - The analysis
 * @param {object} [options] - Formatting options
 * @param {boolean} [options.color] - Use dim/bold ANSI codes (TTY only)
 * @returns {string} The report, ending with a newline
 */
export function formatReport(analysis, { color = false } = {}) {
  const style = {
    bold: (text) => (color ? `\u001b[1m${text}\u001b[22m` : text),
    dim: (text) => (color ? `\u001b[2m${text}\u001b[22m` : text),
  };
  const seconds = (analysis.durationMs / 1000).toFixed(1);
  const lines = [
    `xslt-migrate-check ${analysis.version} — scanned ${pluralize(analysis.scannedFiles, "file")} in ${analysis.directory} (${seconds} s)`,
    "",
    ...headlineLines(analysis, style),
    ...suggestionLines(analysis),
    ...section(
      "XSLTProcessor usages",
      analysis.usages.map((u) => `${u.file}:${u.line}  ${u.text}`),
      style,
    ),
    ...section(
      "XML documents with <?xml-stylesheet?>",
      analysis.xmlDocuments.map((d) => `${d.file}:${d.line}  href="${d.href}"`),
      style,
    ),
    ...section(
      "XSL stylesheets",
      analysis.stylesheets.map((s) => `${s.file}  ${describeStylesheet(s)}`),
      style,
    ),
    ...section(
      `Already using ${SUGGESTION.package}`,
      analysis.migrated.map((m) => `${m.file}  ${pluralize(m.count, "usage")}`),
      style,
    ),
  ];
  return `${lines.join("\n")}\n`;
}
