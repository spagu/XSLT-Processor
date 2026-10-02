/**
 * Findings: one rated entry per file that matters for the migration, built
 * from the scan result. Every finding carries a rating, a reason, the
 * one-line fix and whether the one-line migration handles it on its own.
 *
 * @module xslt-migrate-check/analysis/findings
 */

import { HTML_EXTENSIONS, XML_EXTENSIONS, extensionOf } from "../detectors.js";
import { FIXES } from "../texts.js";
import {
  documentFinding,
  migratedFinding,
  scriptFinding,
} from "./browserFindings.js";
import { rateStylesheet } from "./rating.js";

/** Ratings, most serious first: the order of the findings table. */
export const RATINGS = Object.freeze(["HIGH", "MEDIUM", "LOW"]);

/**
 * @typedef {object} Finding
 * @property {string} file - Path relative to the scanned directory
 * @property {number} line - Line of the first relevant match (1 for a file)
 * @property {string} kind - script, html-link, xml-stylesheet, stylesheet,
 *   migrated
 * @property {"HIGH"|"MEDIUM"|"LOW"} rating - How much it needs attention
 * @property {string} reason - Why, in one line
 * @property {string} fix - What to do, in one line
 * @property {boolean} automatic - The one-line migration handles it
 * @property {string[]} issues - Issue codes (see texts.FIXES)
 * @property {string[]} details - Every issue and context note, for the
 *   detail sections
 */

/**
 * Rate a stylesheet. With no browser usage in the project and a server-side
 * XSLT package in package.json, it runs on the server: anything below HIGH
 * becomes LOW and needs nothing.
 *
 * @param {object} sheet - The stylesheets entry
 * @param {{fragment: boolean, server: string[]}} project - Project context;
 *   `server` lists the server-side packages when no browser code uses XSLT
 * @returns {Finding} The finding
 */
function stylesheetFinding(sheet, project) {
  const rated = rateStylesheet(sheet, project);
  const codes = rated.issues.map((issue) => issue.code);
  const finding = {
    file: sheet.file,
    line: 1,
    kind: "stylesheet",
    rating: rated.rating,
    reason: rated.reason,
    fix: rated.rating === "LOW" ? FIXES.stylesheet : FIXES[codes[0]],
    automatic: rated.rating === "LOW",
    issues: codes,
    details: rated.issues.map((issue) => issue.text),
  };
  if (rated.rating !== "HIGH" && project.server.length > 0) {
    Object.assign(finding, {
      rating: "LOW",
      reason: `Runs on the server (${project.server.join(", ")}); ${rated.reason}`,
      fix: FIXES["server-only"],
      automatic: true,
      issues: [...codes, "server-only"],
    });
  }
  return finding;
}

/**
 * Tell whether a file is a page the browser renders (HTML or XML), so a
 * migrated one still means the project runs XSLT in the browser.
 *
 * @param {string} file - Report path
 * @returns {boolean} True for HTML and XML documents
 */
function isPage(file) {
  const extension = extensionOf(file);
  return HTML_EXTENSIONS.has(extension) || XML_EXTENSIONS.has(extension);
}

/**
 * Order findings HIGH to LOW, then by path.
 *
 * @param {Finding} a - A finding
 * @param {Finding} b - Another finding
 * @returns {number} Sort order
 */
export function compareFindings(a, b) {
  const byRating = RATINGS.indexOf(a.rating) - RATINGS.indexOf(b.rating);
  return byRating || (a.file > b.file) - (a.file < b.file);
}

/**
 * Build the rated findings of a scan.
 *
 * @param {import("./inspect.js").ScanResult} scan - The scan result
 * @returns {Finding[]} Findings, HIGH first
 */
export function buildFindings(scan) {
  const browser =
    scan.usages.length > 0 ||
    scan.xmlDocuments.length > 0 ||
    scan.migrated.some(({ file }) => isPage(file));
  const project = {
    fragment: scan.usages.some((u) => u.method === "transformToFragment"),
    server: browser ? [] : scan.serverSide,
  };
  const sheets = new Map(
    scan.stylesheets.map((sheet) => [
      sheet.file,
      stylesheetFinding(sheet, project),
    ]),
  );
  const byFile = new Map();
  for (const usage of scan.usages) {
    byFile.set(usage.file, [...(byFile.get(usage.file) ?? []), usage]);
  }
  const scripts = [...byFile].map(([file, usages]) =>
    scriptFinding(
      file,
      usages,
      scan.domParser.filter((c) => c.file === file),
    ),
  );
  return [
    ...scripts,
    ...scan.xmlDocuments.map((doc) => documentFinding(doc, sheets)),
    ...sheets.values(),
    ...scan.migrated.map(migratedFinding),
  ].sort(compareFindings);
}
