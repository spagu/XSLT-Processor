/**
 * Ratings: the HIGH / MEDIUM / LOW rating and the reason of each finding.
 *
 * HIGH: native XSLTProcessor in browser code, `<?xml-stylesheet?>`
 * documents, HTML with `type="text/xsl"`, MSXML extensions no runtime runs.
 * MEDIUM: document(), EXSLT the library lacks or keeps off by default, XSLT
 * 2.0/3.0, other extensions, missing include/import targets,
 * disable-output-escaping when the project calls transformToFragment().
 * LOW: standard XSLT 1.0 (with the supported EXSLT), migrated files.
 *
 * @module xslt-migrate-check/analysis/rating
 */

import { needsXslt3 } from "../risk.js";
import { exsltSupport } from "./namespaces.js";

/**
 * @typedef {object} Issue
 * @property {string} code - Stable identifier, also a key of texts.FIXES
 * @property {"HIGH"|"MEDIUM"} rating - How serious it is
 * @property {string} text - What was found, in one clause
 */

/**
 * Format a list of names for a sentence.
 *
 * @param {string[]} names - Names
 * @returns {string} "a, b, c"
 */
const list = (names) => names.join(", ");

/**
 * Collect the MSXML and extension issues of a stylesheet.
 *
 * @param {import("./stylesheet.js").StylesheetFacts} sheet - The facts
 * @returns {Issue[]} Issues found
 */
function extensionIssues(sheet) {
  const issues = [];
  if (sheet.msxmlScript) {
    issues.push({
      code: "msxml-script",
      rating: "HIGH",
      text: "Uses msxsl:script (MSXML); no browser runtime runs it",
    });
  }
  if (sheet.msxmlFunctions.length > 0) {
    issues.push({
      code: "msxml-function",
      rating: "HIGH",
      text: `Uses MSXML ${list(sheet.msxmlFunctions)}; no browser runtime runs it`,
    });
  }
  const unknown = [...sheet.extensionFunctions, ...sheet.extensionNamespaces];
  if (unknown.length > 0) {
    issues.push({
      code: "extension",
      rating: "MEDIUM",
      text: `Uses extensions ${list(unknown)}`,
    });
  }
  return issues;
}

/**
 * Collect the EXSLT issues of a stylesheet.
 *
 * @param {import("./stylesheet.js").StylesheetFacts} sheet - The facts
 * @returns {Issue[]} Issues found
 */
function exsltIssues(sheet) {
  const unsupported = [
    ...sheet.exsltModules
      .filter((module) => exsltSupport(module) === "unsupported")
      .map((module) => `EXSLT ${module}`),
    ...sheet.unsupportedExslt,
  ];
  const issues = [];
  if (unsupported.length > 0) {
    issues.push({
      code: "exslt-unsupported",
      rating: "MEDIUM",
      text: `Uses ${list(unsupported)}, which no browser runtime supports`,
    });
  }
  if (sheet.exsltModules.includes("dynamic")) {
    issues.push({
      code: "exslt-dynamic",
      rating: "MEDIUM",
      text: "Uses EXSLT dynamic; dyn:evaluate is off by default",
    });
  }
  return issues;
}

/**
 * List every issue of a stylesheet.
 *
 * @param {object} sheet - A scanned stylesheet (facts plus resolved includes)
 * @param {{fragment: boolean}} project - Whether the project calls
 *   transformToFragment()
 * @returns {Issue[]} Issues, most serious first
 */
export function stylesheetIssues(sheet, project) {
  const issues = [...extensionIssues(sheet)];
  if (needsXslt3(sheet.version)) {
    issues.push({
      code: "xslt3",
      rating: "MEDIUM",
      text: `Declares XSLT ${sheet.version}; needs @tradik/xslt3`,
    });
  }
  if (sheet.documentFunction) {
    issues.push({
      code: "document",
      rating: "MEDIUM",
      text: "Uses document()",
    });
  }
  issues.push(...exsltIssues(sheet));
  const missing = sheet.includes
    .filter((include) => include.found === false)
    .map((include) => `${include.kind} ${include.href}`);
  if (missing.length > 0) {
    issues.push({
      code: "missing-include",
      rating: "MEDIUM",
      text: `Missing ${list(missing)}`,
    });
  }
  if (sheet.disableOutputEscaping && project.fragment) {
    issues.push({
      code: "doe-fragment",
      rating: "MEDIUM",
      text: "Uses disable-output-escaping with transformToFragment()",
    });
  }
  return issues;
}

/**
 * Describe a stylesheet without issues: its version and supported extras.
 *
 * @param {object} sheet - A scanned stylesheet
 * @returns {string} e.g. "Standard XSLT 1.0" or "XSLT 1.0 with EXSLT common"
 */
export function plainReason(sheet) {
  const extras = [];
  if (sheet.exsltModules.length > 0) {
    extras.push(`EXSLT ${list(sheet.exsltModules)}`);
  }
  if (sheet.msxml) extras.push("msxsl:node-set");
  if (sheet.version === "unknown") {
    return "No version declared; runs as XSLT 1.0";
  }
  if (extras.length === 0) return `Standard XSLT ${sheet.version}`;
  return `XSLT ${sheet.version} with ${list(extras)}`;
}

/**
 * Rate one stylesheet: the highest rating among its issues, with the texts
 * of the issues at that rating as the reason.
 *
 * @param {object} sheet - A scanned stylesheet
 * @param {{fragment: boolean}} project - Project-wide context
 * @returns {{rating: string, reason: string, issues: Issue[]}} The rating
 */
export function rateStylesheet(sheet, project) {
  const issues = stylesheetIssues(sheet, project);
  if (issues.length === 0) {
    return { rating: "LOW", reason: plainReason(sheet), issues };
  }
  const rating = issues.some((issue) => issue.rating === "HIGH")
    ? "HIGH"
    : "MEDIUM";
  const reason = issues
    .filter((issue) => issue.rating === rating)
    .map((issue) => issue.text)
    .join("; ");
  return { rating, reason, issues };
}
