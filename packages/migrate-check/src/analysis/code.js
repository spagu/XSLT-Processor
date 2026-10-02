/**
 * Code analysis: finds the browser's XSLTProcessor API in scripts and
 * templates, with the context that tells what each usage means: the method
 * called, whether the file already loads @tradik/xslt-processor, and the
 * DOMParser calls that prepare the documents it transforms.
 *
 * @module xslt-migrate-check/analysis/code
 */

import { HTML_EXTENSIONS, REPORT_GENERATOR, trimLine } from "../detectors.js";

/** The XSLTProcessor members recognised, in the order they are reported. */
export const API_METHODS = Object.freeze([
  "importStylesheet",
  "transformToFragment",
  "transformToDocument",
  "setParameter",
]);

/** How many lines around an XSLT call a DOMParser still counts as context. */
export const CONTEXT_LINES = 20;

const API_PATTERN =
  /XSLTProcessor|importStylesheet\(|transformToFragment\(|transformToDocument\(/;
const METHOD_PATTERN =
  /\b(importStylesheet|transformToFragment|transformToDocument|setParameter)\(/;
const SET_PARAMETER_PATTERN = /\bsetParameter\(/;
const HTML_XSL_PATTERN = /type=["']text\/xsl["']|<\?xml-stylesheet/;
/** A file that loads @tradik/xslt-processor (import, require or CDN tag). */
export const MIGRATED_PATTERN = /@tradik\/xslt-processor|XsltProcessorLib/;
const COMMENT_PATTERN = /^(\/\/|\/?\*|#)/;
const DOM_PARSER_PATTERN = /\bDOMParser\b/;
const OWN_REPORT_MARKER = `<meta name="generator" content="${REPORT_GENERATOR} `;

/**
 * @typedef {object} UsageMatch
 * @property {number} line - 1-based line number
 * @property {string} text - The line, trimmed
 * @property {string} method - "XSLTProcessor", a method name, or "link"
 *   for an HTML reference to XSL
 */

/**
 * @typedef {object} CodeFacts
 * @property {UsageMatch[]} matches - Lines that use the XSLT API
 * @property {boolean} migrated - The file loads @tradik/xslt-processor
 * @property {Array<{line: number, text: string}>} domParser - DOMParser
 *   lines within CONTEXT_LINES of a match (context, never a finding)
 */

/**
 * Name what a matching line does: the XSLTProcessor method it calls, the
 * constructor, or an HTML link to XSL.
 *
 * @param {string} line - The source line
 * @returns {string} The method name, "XSLTProcessor" or "link"
 */
export function methodOf(line) {
  const method = METHOD_PATTERN.exec(line);
  if (method) return method[1];
  return line.includes("XSLTProcessor") ? "XSLTProcessor" : "link";
}

/**
 * Find the DOMParser lines close to an XSLT match.
 *
 * @param {string[]} lines - The file's lines
 * @param {UsageMatch[]} matches - The XSLT matches
 * @returns {Array<{line: number, text: string}>} The nearby DOMParser lines
 */
function nearbyDomParser(lines, matches) {
  const near = (index) =>
    matches.some((match) => Math.abs(match.line - 1 - index) <= CONTEXT_LINES);
  return lines
    .map((text, index) => ({ line: index + 1, text }))
    .filter(
      ({ text, line }) =>
        DOM_PARSER_PATTERN.test(text) &&
        !COMMENT_PATTERN.test(text.trim()) &&
        near(line - 1),
    )
    .map(({ line, text }) => ({ line, text: trimLine(text) }));
}

/**
 * Find browser-side XSLTProcessor usages in a script or template file. HTML
 * files also match `type="text/xsl"` links and `<?xml-stylesheet` PIs.
 * `setParameter(` counts only in a file that uses the API elsewhere, since
 * the name is common. Comment lines (`//`, `*`, `/*`, `#`) are ignored, and
 * so is this tool's own HTML report.
 *
 * @param {string} content - File text
 * @param {string} extension - Lower-case extension with the dot
 * @returns {CodeFacts} The matching lines and their context
 */
export function detectUsages(content, extension) {
  if (content.includes(OWN_REPORT_MARKER)) {
    return { matches: [], migrated: false, domParser: [] };
  }
  const html = HTML_EXTENSIONS.has(extension);
  const lines = content.split(/\r?\n/);
  const code = lines.map((line) =>
    COMMENT_PATTERN.test(line.trim()) ? "" : line,
  );
  const usesApi = code.some((line) => API_PATTERN.test(line));
  const matches = [];
  code.forEach((line, index) => {
    const hit =
      API_PATTERN.test(line) ||
      (usesApi && SET_PARAMETER_PATTERN.test(line)) ||
      (html && HTML_XSL_PATTERN.test(line));
    if (hit) {
      matches.push({
        line: index + 1,
        text: trimLine(line),
        method: methodOf(line),
      });
    }
  });
  return {
    matches,
    migrated: MIGRATED_PATTERN.test(content),
    domParser: matches.length > 0 ? nearbyDomParser(lines, matches) : [],
  };
}

/**
 * List the distinct API members a file uses, constructor first.
 *
 * @param {UsageMatch[]} matches - The file's matches
 * @returns {string[]} e.g. ["XSLTProcessor", "importStylesheet"]
 */
export function methodsUsed(matches) {
  const used = new Set(matches.map((match) => match.method));
  return ["XSLTProcessor", ...API_METHODS].filter((name) => used.has(name));
}
