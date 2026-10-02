/**
 * Text helpers of the report: counts with their noun, stylesheet version
 * summaries and the one-line description of a stylesheet.
 *
 * @module xslt-migrate-check/format
 */

/**
 * Pick the singular or plural noun for a count.
 *
 * @param {number} count - The count
 * @param {string} singular - Singular noun
 * @param {string} [plural] - Plural noun (singular + "s" by default)
 * @returns {string} Count and noun, e.g. "3 files"
 */
export function pluralize(count, singular, plural = `${singular}s`) {
  return `${count.toLocaleString("en-US")} ${count === 1 ? singular : plural}`;
}

/**
 * Summarise stylesheet versions as "12 × XSLT 1.0, 2 × XSLT 2.0".
 *
 * @param {Array<{version: string}>} stylesheets - The stylesheets
 * @returns {string} The summary
 */
export function summarizeVersions(stylesheets) {
  const counts = new Map();
  for (const { version } of stylesheets) {
    counts.set(version, (counts.get(version) || 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([version, count]) =>
        `${count} × ${version === "unknown" ? "unknown version" : `XSLT ${version}`}`,
    )
    .join(", ");
}

/**
 * Describe one stylesheet's version and flags for the detail section.
 *
 * @param {object} sheet - A stylesheet entry
 * @returns {string} e.g. "XSLT 1.0, EXSLT, document()"
 */
export function describeStylesheet(sheet) {
  const flags = [
    sheet.version === "unknown" ? "unknown version" : `XSLT ${sheet.version}`,
  ];
  if (sheet.exslt) flags.push("EXSLT");
  if (sheet.disableOutputEscaping) flags.push("disable-output-escaping");
  if (sheet.documentFunction) flags.push("document()");
  if (sheet.key) flags.push("xsl:key");
  if (sheet.msxml) {
    flags.push("MSXML extension: will not work in any browser polyfill");
  }
  return flags.join(", ");
}
