/**
 * The parts of the HTML report: summary table, what to do, the one-line
 * fixes and the findings table. Every value from the analysis goes through
 * escapeHtml; the markup around it is fixed.
 *
 * @module xslt-migrate-check/report/htmlSections
 */

import { RATINGS } from "../analysis/findings.js";
import { pluralize } from "../format.js";
import { SUGGESTION } from "../migration.js";
import { POLYFILL_IMPORT } from "../texts.js";

/**
 * Escape text for HTML element content and quoted attribute values.
 *
 * @param {unknown} value - Any value; converted with String()
 * @returns {string} The escaped text
 */
export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * A rating badge; the word is always shown, colour is never the only cue.
 *
 * @param {string} rating - HIGH, MEDIUM, LOW or NONE
 * @returns {string} A <span> element
 */
export function badge(rating) {
  const level = escapeHtml(rating);
  return `<span class="badge badge-${level.toLowerCase()}">${level}</span>`;
}

/**
 * A code block.
 *
 * @param {string} code - The code
 * @returns {string} A <pre><code> element
 */
const codeBlock = (code) => `<pre><code>${escapeHtml(code)}</code></pre>`;

/**
 * The summary table of the migration report.
 *
 * @param {import("../analysis/summary.js").Summary} summary - The numbers
 * @returns {string} A <table> element
 */
export function summaryTable(summary) {
  const rows = [
    ["Native XSLTProcessor", pluralize(summary.nativeUsages, "usage")],
    ["xml-stylesheet", pluralize(summary.xmlStylesheetFiles, "file")],
    ["Stylesheets", summary.stylesheets],
    ["Compatible automatically", summary.automatic],
    ["Manual review", summary.manualReview],
    ["Recommended runtime", summary.recommendedRuntime],
    ["Estimated migration difficulty", summary.difficulty],
  ];
  const body = rows
    .map(
      ([label, value]) =>
        `<tr><th scope="row">${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`,
    )
    .join("\n");
  return `<table class="summary">\n${body}\n</table>\n<p>${escapeHtml(summary.difficultyReason)}</p>`;
}

/**
 * The recommendations as numbered steps.
 *
 * @param {import("../recommend.js").Recommendation[]} recommendations - From
 *   recommend()
 * @returns {string} An <ol> element, or a sentence when there is nothing
 */
export function stepsList(recommendations) {
  if (recommendations.length === 0) {
    return "<p>Nothing to do: no XSLT that depends on the browser was found.</p>";
  }
  const items = recommendations.map((r) => {
    const parts = [
      `<h3>${escapeHtml(r.title)}</h3>`,
      `<p>${escapeHtml(r.why)} Covers ${escapeHtml(pluralize(r.findings.length, "file"))}.</p>`,
      ...r.commands.map(codeBlock),
    ];
    if (r.snippet) parts.push(codeBlock(r.snippet));
    if (r.alternative) {
      parts.push("<p>Without a bundler:</p>", codeBlock(r.alternative));
    }
    return `<li>${parts.join("\n")}</li>`;
  });
  return `<ol class="steps">\n${items.join("\n")}\n</ol>`;
}

/**
 * The three one-line fixes, whatever the project uses.
 *
 * @returns {string} A <dl> element
 */
export function oneLineFixes() {
  const fixes = [
    ["Pages that load scripts directly", SUGGESTION.script],
    ["Code built with a bundler", POLYFILL_IMPORT],
    [
      "XML documents with <?xml-stylesheet?>, after the instruction",
      SUGGESTION.xmlScript,
    ],
  ];
  const entries = fixes.map(
    ([where, code]) =>
      `<dt>${escapeHtml(where)}</dt><dd>${codeBlock(code)}</dd>`,
  );
  return `<dl>\n${entries.join("\n")}\n</dl>`;
}

/**
 * The findings table with the rating filter.
 *
 * @param {import("../analysis/findings.js").Finding[]} findings - Sorted
 *   findings
 * @returns {string} The filter buttons and the <table>
 */
export function findingsTable(findings) {
  if (findings.length === 0) return "<p>No findings.</p>";
  const counts = RATINGS.map((rating) => [
    rating,
    findings.filter((f) => f.rating === rating).length,
  ]);
  const buttons = [["ALL", findings.length], ...counts]
    .map(
      ([rating, count]) =>
        `<button type="button" data-filter="${rating}" aria-pressed="${rating === "ALL"}">${rating} (${count})</button>`,
    )
    .join("\n");
  const rows = findings.map((f) => {
    const location = escapeHtml(`${f.file}:${f.line}`);
    return `<tr data-rating="${escapeHtml(f.rating)}"><td>${badge(f.rating)}</td><td>${location}</td><td>${escapeHtml(f.reason)}</td><td>${escapeHtml(f.fix)}</td></tr>`;
  });
  return [
    `<div class="filters" role="group" aria-label="Show findings by rating">\n${buttons}\n</div>`,
    '<table class="findings">',
    '<thead><tr><th scope="col"><button type="button" class="sort" aria-label="Reverse the order by rating">Rating</button></th><th scope="col">File</th><th scope="col">Reason</th><th scope="col">Fix</th></tr></thead>',
    `<tbody>\n${rows.join("\n")}\n</tbody>`,
    "</table>",
  ].join("\n");
}
