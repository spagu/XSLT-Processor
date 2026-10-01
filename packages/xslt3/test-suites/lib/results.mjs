/**
 * Counting, baseline comparison and the Markdown summary of a run.
 *
 * @module test-suites/lib/results
 */

/** Status to the counter key of a summary row. */
const COUNTERS = {
  pass: "pass",
  fail: "fail",
  "error-mismatch": "errorMismatch",
  "not-run": "notRun",
  skipped: "skipped",
};

/**
 * @typedef {object} SummaryRow
 * @property {string} name - Test set or family name, or "total"
 * @property {number} total - Test cases
 * @property {number} pass - Passing
 * @property {number} fail - Failing
 * @property {number} errorMismatch - A different error than expected
 * @property {number} notRun - Applicable but not run (missing capability)
 * @property {number} skipped - Not applicable (dependencies, environment)
 */

/**
 * Count results grouped by a key, with a final "total" row.
 *
 * @param {import('./runner.mjs').TestResult[]} results - Results
 * @param {"testSet"|"family"} key - Grouping
 * @returns {SummaryRow[]} Rows sorted by name, then the total
 */
export function summarize(results, key) {
  const empty = (name) => ({
    name,
    total: 0,
    pass: 0,
    fail: 0,
    errorMismatch: 0,
    notRun: 0,
    skipped: 0,
  });
  const rows = new Map();
  const total = empty("total");
  for (const result of results) {
    const name = result[key];
    if (!rows.has(name)) rows.set(name, empty(name));
    for (const row of [rows.get(name), total]) {
      row.total++;
      row[COUNTERS[result.status]]++;
    }
  }
  const sorted = [...rows.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "en"),
  );
  return [...sorted, total];
}

/**
 * Pass rate of a row over the applicable test cases.
 *
 * @param {SummaryRow} row - Row
 * @returns {string} Percentage with one decimal, or "n/a"
 */
export function passRate(row) {
  const applicable = row.total - row.skipped;
  return applicable === 0
    ? "n/a"
    : `${((row.pass / applicable) * 100).toFixed(1)}%`;
}

/**
 * Baseline document: the ids of the passing test cases.
 *
 * @param {import('./runner.mjs').TestResult[]} results - Results
 * @param {object} meta - `{suite, commit, mode, adapter}`
 * @returns {object} Baseline JSON value
 */
export function buildBaseline(results, meta) {
  const passing = results.filter((r) => r.status === "pass").map((r) => r.id);
  return { ...meta, count: passing.length, passing: passing.sort() };
}

/**
 * Compare results with a baseline.
 *
 * @param {import('./runner.mjs').TestResult[]} results - Results
 * @param {string[]} passing - Baseline ids
 * @param {boolean} [filtered] - A filter was used: baseline ids that were
 *   not run are not regressions
 * @returns {{regressions: string[], fixed: string[]}} Ids that passed and no
 *   longer do, and ids that pass and are not in the baseline
 */
export function compareWithBaseline(results, passing, filtered = false) {
  const known = new Set(passing);
  const byId = new Map(results.map((r) => [r.id, r.status]));
  const regressions = passing.filter((id) =>
    byId.has(id) ? byId.get(id) !== "pass" : !filtered,
  );
  const fixed = results
    .filter((r) => r.status === "pass" && !known.has(r.id))
    .map((r) => r.id);
  return { regressions, fixed };
}

/**
 * Markdown table of summary rows.
 *
 * @param {SummaryRow[]} rows - Rows
 * @param {string} label - Header of the first column
 * @returns {string[]} Table lines
 */
export function renderTable(rows, label) {
  return [
    `| ${label} | Cases | Applicable | Pass | Fail | Wrong error | Not run | Pass rate |`,
    "|---|---:|---:|---:|---:|---:|---:|---:|",
    ...rows.map(
      (row) =>
        `| ${row.name === "total" ? "**total**" : row.name} | ${row.total} | ` +
        `${row.total - row.skipped} | ${row.pass} | ${row.fail} | ${row.errorMismatch} | ` +
        `${row.notRun} | ${passRate(row)} |`,
    ),
  ];
}

/**
 * Markdown summary of a run for docs/XSLT3.md.
 *
 * @param {object} run - Run data
 * @param {string} run.title - Heading, e.g. "qt3tests (parse only)"
 * @param {string} run.source - Suite and commit
 * @param {string} run.adapter - Adapter name
 * @param {import('./runner.mjs').TestResult[]} run.results - Results
 * @returns {string} Markdown text
 */
export function renderSummary({ title, source, adapter, results }) {
  return [
    `### ${title}`,
    "",
    `Suite: ${source}. Engine adapter: ${adapter}. "Applicable" leaves out the`,
    "test cases whose dependencies (XQuery, schema awareness, streaming, ...) the",
    'processor does not claim; "Wrong error" counts tests that raised a',
    "different error than expected.",
    "",
    ...renderTable(summarize(results, "family"), "Family"),
    "",
  ].join("\n");
}
