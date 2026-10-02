/**
 * The HTML report: one self-contained page (inline CSS, a small inline
 * script for the rating filter, no external requests) rendered from the
 * same analysis object as --json, and the function that writes it.
 *
 * @module xslt-migrate-check/report/html
 */

import { REPORT_GENERATOR } from "../detectors.js";
import { CHROME_SCHEDULE } from "../migration.js";
import { LINKS } from "../texts.js";
import { REPORT_CSS } from "./html.css.js";
import {
  badge,
  escapeHtml,
  findingsTable,
  oneLineFixes,
  stepsList,
  summaryTable,
} from "./htmlSections.js";
import { RISK_NOTES } from "./summary.js";

/** File name used when --html is given without a path. */
export const DEFAULT_HTML_FILE = "xslt-migration-report.html";

/** Filter and reverse-order behaviour of the findings table. */
const REPORT_SCRIPT = `
const buttons = document.querySelectorAll(".filters button");
const rows = () => document.querySelectorAll(".findings tbody tr");
for (const button of buttons) {
  button.addEventListener("click", () => {
    const rating = button.dataset.filter;
    for (const other of buttons) other.setAttribute("aria-pressed", String(other === button));
    for (const row of rows()) row.hidden = rating !== "ALL" && row.dataset.rating !== rating;
  });
}
const sort = document.querySelector(".sort");
if (sort) {
  sort.addEventListener("click", () => {
    const body = document.querySelector(".findings tbody");
    body.append(...[...rows()].reverse());
  });
}
`;

/**
 * Format a date for the report header, in UTC.
 *
 * @param {Date} date - The date
 * @returns {string} e.g. "2026-10-02 14:05 UTC"
 */
export function formatDate(date) {
  const iso = date.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

/**
 * Render the HTML report.
 *
 * @param {import("../analysis/index.js").Analysis} analysis - The analysis
 * @param {object} [options] - Rendering options
 * @param {Date} [options.generatedAt] - Date shown in the header
 * @returns {string} The complete document
 */
export function renderHtml(analysis, { generatedAt = new Date() } = {}) {
  const directory = escapeHtml(analysis.directory);
  const version = escapeHtml(analysis.version);
  const description = `Chrome 158 migration report for ${analysis.directory}: risk ${analysis.risk}, ${analysis.summary.findings} findings.`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="${escapeHtml(description)}">
<meta name="generator" content="${REPORT_GENERATOR} ${version}">
<meta name="robots" content="noindex">
<meta name="color-scheme" content="light dark">
<title>XSLT migration report: ${directory}</title>
<style>${REPORT_CSS}</style>
</head>
<body>
<main>
<header>
<h1>Chrome 158 Migration Report</h1>
<p class="meta">Project <code>${directory}</code> · scanned ${escapeHtml(analysis.scannedFiles)} files · <time datetime="${generatedAt.toISOString()}">${formatDate(generatedAt)}</time> · xslt-migrate-check ${version}</p>
<p class="risk">Risk: ${badge(analysis.risk)}</p>
<p>${escapeHtml(RISK_NOTES[analysis.risk])} Final removal: ${escapeHtml(CHROME_SCHEDULE.finalRemoval)}.</p>
</header>
<section aria-labelledby="summary">
<h2 id="summary">Summary</h2>
${summaryTable(analysis.summary)}
</section>
<section aria-labelledby="todo">
<h2 id="todo">What to do</h2>
${stepsList(analysis.recommendations)}
<h3>The one-line fixes</h3>
${oneLineFixes()}
</section>
<section aria-labelledby="findings">
<h2 id="findings">Findings</h2>
${findingsTable(analysis.findings)}
</section>
<footer>
<p>Step by step: <a href="${LINKS.howTo}">Migrating from native XSLT</a> · <a href="${LINKS.docs}">Migration checker documentation</a> · <a href="${LINKS.npm}">xslt-migrate-check on npm</a></p>
</footer>
</main>
<script>${REPORT_SCRIPT}</script>
</body>
</html>
`;
}
