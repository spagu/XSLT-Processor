/**
 * Conformance runner - JSON and Markdown reports.
 */

/**
 * @typedef {Object} CategorySummary
 * @property {string} category - Category label
 * @property {number} total - Number of cases
 * @property {number} pass - Passing cases
 * @property {number} fail - Cases with a differing result
 * @property {number} error - Cases the processor could not run
 * @property {number} skip - Excluded cases (implementation-defined results)
 */

/**
 * Format the pass rate of a summary row as a percentage with one decimal.
 * Skipped cases are left out of the rate.
 *
 * @param {CategorySummary} row - Summary row
 * @returns {string} Percentage, e.g. `"87.5%"`
 */
export function passRate(row) {
  const counted = row.total - row.skip;
  return counted === 0 ? "n/a" : `${((row.pass / counted) * 100).toFixed(1)}%`;
}

/**
 * Create an empty summary row.
 *
 * @param {string} category - Category label
 * @returns {CategorySummary} Row with zero counts
 */
function emptyRow(category) {
  return { category, total: 0, pass: 0, fail: 0, error: 0, skip: 0 };
}

/**
 * Count results per category, plus a `total` row.
 *
 * @param {import('./classify.mjs').CaseResult[]} results - Run results
 * @returns {CategorySummary[]} One row per category (in natural order,
 *   so `REC §2` precedes `REC §10`) followed by the overall row
 */
export function summarize(results) {
  const rows = new Map();
  const total = emptyRow("total");
  for (const result of results) {
    if (!rows.has(result.category)) {
      rows.set(result.category, emptyRow(result.category));
    }
    for (const row of [rows.get(result.category), total]) {
      row.total++;
      row[result.status]++;
    }
  }
  const sorted = [...rows.values()].sort((a, b) =>
    a.category.localeCompare(b.category, "en", { numeric: true }),
  );
  return [...sorted, total];
}

/**
 * Escape text for a Markdown table cell or inline code span.
 *
 * @param {string} text - Raw text
 * @param {number} [limit] - Maximum length kept
 * @returns {string} Single line, pipe-escaped text
 */
function cell(text, limit = 120) {
  const line = String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
  const cut = line.length > limit ? `${line.slice(0, limit)}...` : line;
  return cut.replace(/\|/g, "\\|").replace(/`/g, "'");
}

/**
 * Render the Markdown report.
 *
 * @param {object} report - Report data
 * @param {string} report.corpus - Corpus name and version
 * @param {CategorySummary[]} report.summary - Rows from {@link summarize}
 * @param {import('./classify.mjs').CaseResult[]} report.results - Results
 * @param {import('./classify.mjs').BaselineComparison} report.comparison -
 *   Baseline differences
 * @returns {string} Markdown document
 */
export function renderMarkdown({ corpus, summary, results, comparison }) {
  const overall = summary.at(-1);
  const lines = [
    "# XSLT 1.0 conformance report",
    "",
    `Corpus: ${corpus} regression tests. ` +
      `Pass rate: **${passRate(overall)}** ` +
      `(${overall.pass} of ${overall.total - overall.skip}; ` +
      `${overall.skip} cases skipped, see tests/conformance/exclusions.json).`,
    "",
    "| Category | Cases | Pass | Fail | Error | Skip | Pass rate |",
    "|---|---:|---:|---:|---:|---:|---:|",
    ...summary.map(
      (row) =>
        `| ${row.category} | ${row.total} | ${row.pass} | ${row.fail} | ` +
        `${row.error} | ${row.skip} | ${passRate(row)} |`,
    ),
    "",
    `Regressions against the baseline: ${comparison.regressions.length}. ` +
      `Newly passing: ${comparison.fixed.length}.`,
    "",
  ];

  for (const [title, ids] of [
    ["Regressions", comparison.regressions],
    ["Newly passing", comparison.fixed],
  ]) {
    if (ids.length === 0) continue;
    lines.push(`## ${title}`, "", ...ids.map((id) => `- \`${id}\``), "");
  }

  const failing = results.filter((result) => result.status !== "pass");
  if (failing.length > 0) {
    lines.push(
      "## Failing and skipped cases",
      "",
      "| Case | Status | Detail |",
      "|---|---|---|",
      ...failing.map((result) => {
        const detail = result.difference
          ? `at ${result.difference.offset}: expected \`${cell(result.difference.expected, 80)}\`, ` +
            `got \`${cell(result.difference.actual, 80)}\``
          : cell(result.reason);
        return `| ${result.id} | ${result.status} | ${detail} |`;
      }),
      "",
    );
  }
  return lines.join("\n");
}
