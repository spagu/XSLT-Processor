/**
 * The analysis object: the scan result plus the rated findings, the risk,
 * the recommendations and the summary numbers. The terminal report, the
 * JSON output and the HTML report are all rendered from it.
 *
 * @module xslt-migrate-check/analysis
 */

import { SUGGESTION } from "../migration.js";
import { recommend } from "../recommend.js";
import { assessRisk } from "../risk.js";
import { buildFindings } from "./findings.js";
import { summarize } from "./summary.js";

/**
 * @typedef {object} Analysis
 * @property {string} version - Tool version
 * @property {string} directory - Scanned directory as shown to the user
 * @property {number} scannedFiles - Files read
 * @property {number} durationMs - Scan time
 * @property {"NONE"|"LOW"|"MEDIUM"|"HIGH"} risk - Chrome compatibility risk
 * @property {boolean} needsXslt3 - A stylesheet declares XSLT 2.0 or 3.0
 * @property {boolean} msxml - A stylesheet uses the MSXML namespace
 * @property {Array<object>} usages - XSLTProcessor usages
 * @property {Array<object>} domParser - DOMParser context lines
 * @property {Array<object>} stylesheets - XSL stylesheets
 * @property {Array<object>} xmlDocuments - XML documents with a PI
 * @property {Array<object>} migrated - Files already using the polyfill
 * @property {string[]} serverSide - Server-side signals in package.json
 * @property {import("./findings.js").Finding[]} findings - Rated findings
 * @property {import("../recommend.js").Recommendation[]} recommendations -
 *   What to do, most findings covered first
 * @property {import("./summary.js").Summary} summary - Report numbers
 */

/**
 * Build the analysis of a scan.
 *
 * @param {import("./inspect.js").ScanResult} scan - The scan result
 * @param {{version: string, directory: string, durationMs: number}} meta -
 *   Tool version, directory label and scan time
 * @returns {Analysis} The analysis
 */
export function analyze(scan, meta) {
  const findings = buildFindings(scan);
  const analysis = {
    ...meta,
    ...scan,
    ...assessRisk(scan, findings),
    findings,
    recommendations: recommend({ findings }),
  };
  analysis.summary = summarize(analysis);
  return analysis;
}

/**
 * Build the JSON object of --json: the 0.1.0 keys in their order, then
 * findings, summary and recommendations.
 *
 * @param {Analysis} analysis - The analysis
 * @returns {object} The stable JSON shape
 */
export function toJson(analysis) {
  return {
    version: analysis.version,
    scannedFiles: analysis.scannedFiles,
    durationMs: analysis.durationMs,
    risk: analysis.risk,
    usages: analysis.usages,
    stylesheets: analysis.stylesheets,
    xmlDocuments: analysis.xmlDocuments,
    migrated: analysis.migrated,
    serverSide: analysis.serverSide,
    needsXslt3: analysis.needsXslt3,
    msxml: analysis.msxml,
    suggestion: SUGGESTION,
    findings: analysis.findings,
    summary: analysis.summary,
    recommendations: analysis.recommendations,
  };
}
