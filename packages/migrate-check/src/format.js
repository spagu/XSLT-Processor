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
    .map(([version, count]) => {
      const label =
        version === "unknown" ? "unknown version" : `XSLT ${version}`;
      return `${count} × ${label}`;
    })
    .join(", ");
}

/**
 * Name the MSXML use of a stylesheet: the extensions no runtime runs, or
 * the msxsl:node-set the library supports.
 *
 * @param {object} sheet - A stylesheet entry
 * @returns {string|null} The flag, or null without MSXML
 */
function msxmlFlag(sheet) {
  const unsupported = [...sheet.msxmlFunctions];
  if (sheet.msxmlScript) unsupported.unshift("msxsl:script");
  if (unsupported.length > 0) {
    return `MSXML ${unsupported.join(", ")}: no browser runtime runs them`;
  }
  return sheet.msxml ? "msxsl:node-set" : null;
}

/**
 * Describe one stylesheet's version and flags for the detail section.
 *
 * @param {object} sheet - A stylesheet entry
 * @returns {string} e.g. "XSLT 1.0, EXSLT common, document()"
 */
export function describeStylesheet(sheet) {
  const flags = [
    sheet.version === "unknown" ? "unknown version" : `XSLT ${sheet.version}`,
  ];
  if (sheet.exslt) flags.push(`EXSLT ${sheet.exsltModules.join(", ")}`);
  if (sheet.unsupportedExslt.length > 0) {
    flags.push(`unsupported ${sheet.unsupportedExslt.join(", ")}`);
  }
  if (sheet.disableOutputEscaping) flags.push("disable-output-escaping");
  if (sheet.documentFunction) flags.push("document()");
  if (sheet.key) flags.push("xsl:key");
  const msxml = msxmlFlag(sheet);
  if (msxml) flags.push(msxml);
  const extensions = [
    ...sheet.extensionFunctions,
    ...sheet.extensionNamespaces,
  ];
  if (extensions.length > 0) flags.push(`extensions ${extensions.join(", ")}`);
  const missing = sheet.includes.filter((include) => include.found === false);
  if (missing.length > 0) {
    flags.push(`missing ${missing.map((m) => m.href).join(", ")}`);
  }
  return flags.join(", ");
}
