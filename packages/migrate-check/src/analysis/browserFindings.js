/**
 * Findings of the browser side: script files that call XSLTProcessor (or
 * HTML linking XSL), XML documents rendered with `<?xml-stylesheet?>`, and
 * files that already load @tradik/xslt-processor.
 *
 * @module xslt-migrate-check/analysis/browserFindings
 */

import { FIXES } from "../texts.js";
import { methodsUsed } from "./code.js";
import { resolveHref } from "./includes.js";

/** Issue codes that only a rewrite or another engine resolves, labelled. */
const HARD_CODES = Object.freeze({
  "msxml-script": "an MSXML rewrite",
  "msxml-function": "an MSXML rewrite",
  xslt3: "@tradik/xslt3",
});

/**
 * Rate the usages of one script file.
 *
 * @param {string} file - Report path
 * @param {Array<object>} usages - The file's usages
 * @param {Array<object>} context - DOMParser lines near them
 * @returns {import("./findings.js").Finding} The finding
 */
export function scriptFinding(file, usages, context) {
  const methods = methodsUsed(usages);
  const kind = methods.length > 0 ? "script" : "html-link";
  const details = usages.map((u) => `line ${u.line}: ${u.text}`);
  details.push(
    ...context.map(
      (c) => `line ${c.line}: DOMParser prepares the input (context)`,
    ),
  );
  return {
    file,
    line: usages[0].line,
    kind,
    rating: "HIGH",
    reason:
      kind === "script"
        ? "Uses native XSLTProcessor"
        : 'Links an XSL stylesheet (type="text/xsl")',
    fix: FIXES[kind],
    automatic: kind === "script",
    issues: [kind],
    details,
  };
}

/**
 * The issue codes of a finding that need a rewrite or another engine.
 *
 * @param {import("./findings.js").Finding|undefined} finding - A finding, or undefined
 * @returns {string[]} The hard issue codes
 */
export function hardIssues(finding) {
  return (finding?.issues ?? []).filter((code) =>
    Object.hasOwn(HARD_CODES, code),
  );
}

/**
 * Rate an XML document rendered with `<?xml-stylesheet?>`. It is handled
 * automatically unless its stylesheet (when found in the project) needs
 * the XSLT 3.0 engine or uses MSXML.
 *
 * @param {object} doc - The xmlDocuments entry
 * @param {Map<string, import("./findings.js").Finding>} sheets - Stylesheet findings by path
 * @returns {import("./findings.js").Finding} The finding
 */
export function documentFinding(doc, sheets) {
  const target = resolveHref(doc.file, doc.href);
  const hard = hardIssues(sheets.get(target));
  const needs = [...new Set(hard.map((code) => HARD_CODES[code]))];
  const reason = "Uses <?xml-stylesheet?>";
  return {
    file: doc.file,
    line: doc.line,
    kind: "xml-stylesheet",
    rating: "HIGH",
    reason:
      hard.length === 0
        ? reason
        : `${reason}; its stylesheet needs ${needs.join(" and ")}`,
    fix: FIXES["xml-stylesheet"],
    automatic: hard.length === 0,
    issues: ["xml-stylesheet", ...hard],
    details: [`href="${doc.href}"`],
  };
}

/**
 * The LOW finding of a file that already loads @tradik/xslt-processor.
 *
 * @param {{file: string}} entry - The migrated entry of the scan
 * @returns {import("./findings.js").Finding} The finding
 */
export function migratedFinding(entry) {
  return {
    file: entry.file,
    line: 1,
    kind: "migrated",
    rating: "LOW",
    reason: "Already loads @tradik/xslt-processor",
    fix: FIXES.migrated,
    automatic: true,
    issues: ["migrated"],
    details: [],
  };
}
