/**
 * The bottom of the terminal report: the 0.1.0 detail sections, one line
 * per usage, document, stylesheet and migrated file.
 *
 * @module xslt-migrate-check/report/sections
 */

import { describeStylesheet, pluralize } from "../format.js";
import { SUGGESTION } from "../migration.js";

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
 * Build every detail section.
 *
 * @param {import("../analysis/index.js").Analysis} analysis - The analysis
 * @param {{bold: Function}} style - Text decorators
 * @returns {string[]} Lines
 */
export function detailLines(analysis, style) {
  const context = analysis.domParser.map(
    (c) => `${c.file}:${c.line}  ${c.text}`,
  );
  return [
    ...section(
      "XSLTProcessor usages",
      analysis.usages.map((u) => `${u.file}:${u.line}  ${u.text}`),
      style,
    ),
    ...section("DOMParser next to them (context, not a risk)", context, style),
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
}
