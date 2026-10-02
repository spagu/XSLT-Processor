/**
 * The report of xslt-migrate-test: the counts, the compatibility and one
 * block per transformation that did not match. Pure.
 *
 * @module xslt-migrate-check/compat/report
 */

import { unifiedDiff } from "../fix/patch.js";
import { pluralize } from "../format.js";
import { normalizeOutput } from "./compare.js";

/** Why a pair is SKIPPED in a smoke test (not repeated per pair). */
export const NO_REFERENCE_REASON =
  "no reference engine; Tradik ran without errors";

/**
 * @typedef {object} TestResult
 * @property {string} xml - XML document
 * @property {string} xsl - Stylesheet
 * @property {Record<string, string>} params - Parameters
 * @property {"MATCH"|"DIFFERENT"|"ERROR"|"SKIPPED"} status - Outcome
 * @property {string} [reason] - Why it was skipped
 * @property {string} [engine] - The engine that failed (ERROR)
 * @property {string} [message] - Its message (ERROR)
 * @property {string} [path] - First differing node (DIFFERENT)
 * @property {string} [expected] - Reference side of it
 * @property {string} [actual] - Tradik side of it
 * @property {string} [expectedOutput] - Whole reference result
 * @property {string} [actualOutput] - Whole Tradik result
 */

/**
 * @typedef {object} TestSummary
 * @property {number} tested - Transformations
 * @property {number} match - MATCH
 * @property {number} different - DIFFERENT OUTPUT
 * @property {number} error - ERROR
 * @property {number} skipped - SKIPPED
 * @property {number|null} compatibility - MATCH / (tested - SKIPPED) in
 *   percent with one decimal, null when nothing was compared
 */

/**
 * Count the results.
 *
 * @param {TestResult[]} results - The results
 * @returns {TestSummary} The counts
 */
export function summarizeResults(results) {
  const count = (status) => results.filter((r) => r.status === status).length;
  const skipped = count("SKIPPED");
  const compared = results.length - skipped;
  const match = count("MATCH");
  return {
    tested: results.length,
    match,
    different: count("DIFFERENT"),
    error: count("ERROR"),
    skipped,
    compatibility:
      compared === 0 ? null : Math.round((match / compared) * 1000) / 10,
  };
}

/**
 * Indent every line after the first of a labelled value.
 *
 * @param {string} label - e.g. "Expected:"
 * @param {string} text - The value
 * @returns {string[]} Lines
 */
function labelled(label, text) {
  const [first, ...rest] = text.split("\n");
  const pad = " ".repeat(13);
  return [`  ${label.padEnd(11)}${first}`, ...rest.map((line) => pad + line)];
}

/**
 * The detail block of one result that is not a MATCH.
 *
 * @param {TestResult} result - The result
 * @param {{reference: string, diff: "first"|"full"}} options - Reference
 *   name and diff mode
 * @returns {string[]} Lines, starting with a blank one
 */
function detailBlock(result, { reference, diff }) {
  const lines = ["", result.xsl, ...labelled("Input:", result.xml)];
  if (result.status === "SKIPPED") {
    lines.push(...labelled("Skipped:", result.reason));
  } else if (result.status === "ERROR") {
    lines.push(...labelled("Error:", `${result.engine}: ${result.message}`));
  } else if (diff === "full") {
    const body = unifiedDiff(
      `${normalizeOutput(result.expectedOutput)}\n`,
      `${normalizeOutput(result.actualOutput)}\n`,
      { oldLabel: `expected (${reference})`, newLabel: "tradik" },
    );
    lines.push(
      ...body
        .trimEnd()
        .split("\n")
        .map((line) => `  ${line}`),
    );
  } else {
    lines.push(
      ...labelled("Expected:", result.expected),
      ...labelled("Tradik:", result.actual),
      ...labelled("At:", result.path),
    );
  }
  return lines;
}

/**
 * The text report.
 *
 * @param {TestResult[]} results - The results
 * @param {{reference: string, diff?: "first"|"full"}} options - The
 *   reference engine's name, and the diff mode
 * @returns {string} The report, ending with a newline
 */
export function formatTestReport(results, { reference, diff = "first" }) {
  const summary = summarizeResults(results);
  const width = Math.max(3, String(summary.tested).length);
  const row = (label, value) =>
    label.padEnd(18) + String(value).padStart(width);
  const lines = [
    `Reference engine: ${reference}`,
    "",
    `${pluralize(summary.tested, "transformation")} tested`,
    "",
    row("MATCH:", summary.match),
    row("DIFFERENT OUTPUT:", summary.different),
    row("ERROR:", summary.error),
  ];
  if (summary.skipped > 0) lines.push(row("SKIPPED:", summary.skipped));
  const percent =
    summary.compatibility === null
      ? "n/a (nothing was compared)"
      : `${summary.compatibility.toFixed(1)}%`;
  lines.push("", `Compatibility: ${percent}`);
  for (const result of results) {
    if (result.status !== "MATCH" && result.reason !== NO_REFERENCE_REASON) {
      lines.push(...detailBlock(result, { reference, diff }));
    }
  }
  return `${lines.join("\n")}\n`;
}

/**
 * The JSON of `--json`.
 *
 * @param {TestResult[]} results - The results
 * @param {{version: string, reference: string}} meta - Tool version and
 *   reference engine
 * @returns {object} The JSON object
 */
export function toTestJson(results, meta) {
  return { ...meta, ...summarizeResults(results), results };
}
