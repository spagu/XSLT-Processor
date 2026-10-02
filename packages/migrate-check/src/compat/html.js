/**
 * The HTML report of xslt-migrate-test (`--html`), in the style of the
 * migration report: the counts, the compatibility and a table of every
 * transformation. Pure; the CLI writes it with report/html.js.
 *
 * @module xslt-migrate-check/compat/html
 */

import { REPORT_GENERATOR } from "../detectors.js";
import { formatDate } from "../report/html.js";
import { REPORT_CSS } from "../report/html.css.js";
import { escapeHtml } from "../report/htmlSections.js";
import { LINKS } from "../texts.js";
import { summarizeResults } from "./report.js";

/** File name used when --html is given without a path. */
export const DEFAULT_TEST_HTML_FILE = "xslt-migration-test.html";

/** Badge class of each status (the word is always shown too). */
const STATUS_CLASS = Object.freeze({
  MATCH: "badge-low",
  DIFFERENT: "badge-medium",
  ERROR: "badge-high",
  SKIPPED: "",
});

/**
 * The detail cell of a result.
 *
 * @param {import("./report.js").TestResult} result - The result
 * @returns {string} HTML
 */
function detail(result) {
  if (result.status === "MATCH") return "Same output";
  if (result.status === "SKIPPED") return escapeHtml(result.reason);
  if (result.status === "ERROR") {
    return escapeHtml(`${result.engine}: ${result.message}`);
  }
  return `At <code>${escapeHtml(result.path)}</code><br>Expected:<pre><code>${escapeHtml(result.expected)}</code></pre>Tradik:<pre><code>${escapeHtml(result.actual)}</code></pre>`;
}

/**
 * One table row.
 *
 * @param {import("./report.js").TestResult} result - The result
 * @returns {string} A <tr> element
 */
function row(result) {
  const status = escapeHtml(result.status);
  return `<tr><td><span class="badge ${STATUS_CLASS[result.status]}">${status}</span></td><td>${escapeHtml(result.xsl)}<br>${escapeHtml(result.xml)}</td><td>${detail(result)}</td></tr>`;
}

/**
 * Render the HTML report.
 *
 * @param {import("./report.js").TestResult[]} results - The results
 * @param {{version: string, reference: string, generatedAt?: Date}} meta -
 *   Tool version, reference engine, date shown
 * @returns {string} The complete document
 */
export function renderTestHtml(results, meta) {
  const { version, reference, generatedAt = new Date() } = meta;
  const summary = summarizeResults(results);
  const percent =
    summary.compatibility === null
      ? "n/a"
      : `${summary.compatibility.toFixed(1)}%`;
  const counts = [
    ["Transformations tested", summary.tested],
    ["MATCH", summary.match],
    ["DIFFERENT OUTPUT", summary.different],
    ["ERROR", summary.error],
    ["SKIPPED", summary.skipped],
    ["Compatibility", percent],
  ]
    .map(
      ([label, value]) =>
        `<tr><th scope="row">${label}</th><td>${escapeHtml(value)}</td></tr>`,
    )
    .join("\n");
  const description = `XSLT compatibility test: ${percent} of ${summary.tested} transformations match ${reference}.`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="${escapeHtml(description)}">
<meta name="generator" content="${REPORT_GENERATOR} ${escapeHtml(version)}">
<meta name="robots" content="noindex">
<meta name="color-scheme" content="light dark">
<title>XSLT compatibility test</title>
<style>${REPORT_CSS}</style>
</head>
<body>
<main>
<header>
<h1>XSLT compatibility test</h1>
<p class="meta">Reference engine: ${escapeHtml(reference)} · <time datetime="${generatedAt.toISOString()}">${formatDate(generatedAt)}</time> · xslt-migrate-test ${escapeHtml(version)}</p>
</header>
<section aria-labelledby="summary">
<h2 id="summary">Summary</h2>
<table class="summary">
${counts}
</table>
</section>
<section aria-labelledby="results">
<h2 id="results">Transformations</h2>
<table class="findings">
<thead><tr><th scope="col">Result</th><th scope="col">Stylesheet and input</th><th scope="col">Detail</th></tr></thead>
<tbody>
${results.map(row).join("\n")}
</tbody>
</table>
</section>
<footer>
<p><a href="${LINKS.howTo}">Migrating from native XSLT</a> · <a href="${LINKS.docs}">Migration checker documentation</a></p>
</footer>
</main>
</body>
</html>
`;
}
