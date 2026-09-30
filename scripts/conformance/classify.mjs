/**
 * Conformance runner - result classification and baseline comparison.
 */

import { readFileSync } from "node:fs";
import {
  decodeExpected,
  firstDifference,
  normalizeOutput,
} from "./normalize.mjs";

/**
 * @typedef {Object} CaseResult
 * @property {string} id - Case identifier
 * @property {string} category - Report category
 * @property {"pass"|"fail"|"error"|"skip"} status - `pass`: the normalised
 *   output matches, or both implementations reject the case; `fail`: the
 *   processor produced a different result, or one where libxslt rejects the
 *   case; `error`: the processor failed or timed out where libxslt produced
 *   a result; `skip`: a non-passing case listed in the exclusions (its
 *   expected output depends on implementation-defined behaviour)
 * @property {string|null} reason - Short explanation for non-passing cases
 * @property {object|null} difference - First difference, see
 *   {@link firstDifference}
 */

/**
 * Compare an outcome with the expectation of its case.
 *
 * @param {import('./cases.mjs').ConformanceCase} testCase - The case
 * @param {import('./runCase.mjs').CaseOutcome} outcome - What the processor did
 * @param {(path: string) => Uint8Array} readBytes - File reader
 * @returns {{status: string, reason: string|null, difference: object|null}}
 *   Verdict before exclusions
 */
function verdict(testCase, outcome, readBytes) {
  const pass = { status: "pass", reason: null, difference: null };
  if (testCase.expectsError) {
    return outcome.output === null
      ? pass
      : {
          status: "fail",
          reason: "libxslt rejects the case, the processor produced a result",
          difference: null,
        };
  }
  if (outcome.output === null) {
    return { status: "error", reason: outcome.error, difference: null };
  }

  const options = { markupWhitespace: outcome.indented };
  const expected = testCase.expected
    ? normalizeOutput(
        decodeExpected(readBytes(testCase.expected), outcome.encoding),
        options,
      )
    : "";
  const difference = firstDifference(
    expected,
    normalizeOutput(outcome.output, options),
  );
  return difference
    ? { status: "fail", reason: "output differs", difference }
    : pass;
}

/**
 * Classify the outcome of one case.
 *
 * @param {import('./cases.mjs').ConformanceCase} testCase - The case
 * @param {import('./runCase.mjs').CaseOutcome} outcome - What the processor did
 * @param {Map<string, string>} [exclusions] - Excluded case ids and why
 * @param {(path: string) => Uint8Array} [readBytes] - File reader (for tests)
 * @returns {CaseResult} Classified result
 */
export function classify(
  testCase,
  outcome,
  exclusions = new Map(),
  readBytes = readFileSync,
) {
  const result = {
    id: testCase.id,
    category: testCase.category,
    ...verdict(testCase, outcome, readBytes),
  };
  if (result.status !== "pass" && exclusions.has(testCase.id)) {
    return { ...result, status: "skip", reason: exclusions.get(testCase.id) };
  }
  return result;
}

/**
 * Tell whether a result counts as a failure for the baseline.
 *
 * @param {CaseResult} result - Classified result
 * @returns {boolean} True for fail and error results
 */
export function isFailing(result) {
  return result.status === "fail" || result.status === "error";
}

/**
 * @typedef {Object} BaselineComparison
 * @property {string[]} regressions - Failing cases missing from the baseline
 * @property {string[]} fixed - Baseline cases that pass now
 * @property {string[]} stale - Baseline cases the corpus no longer has
 */

/**
 * Compare results against the known failures of the baseline.
 *
 * @param {CaseResult[]} results - Results of this run
 * @param {string[]} knownFailures - Case ids of the baseline
 * @returns {BaselineComparison} Differences to the baseline
 */
export function compareWithBaseline(results, knownFailures) {
  const known = new Set(knownFailures);
  const seen = new Set(results.map((result) => result.id));
  return {
    regressions: results
      .filter((result) => isFailing(result) && !known.has(result.id))
      .map((result) => result.id),
    fixed: results
      .filter((result) => result.status === "pass" && known.has(result.id))
      .map((result) => result.id),
    stale: knownFailures.filter((id) => !seen.has(id)),
  };
}

/**
 * Build the baseline document for a run.
 *
 * @param {CaseResult[]} results - Results of this run
 * @param {string} corpus - Corpus name and version
 * @returns {{corpus: string, total: number, passed: number, skipped: number,
 *   knownFailures: string[]}} Baseline content
 */
export function buildBaseline(results, corpus) {
  const knownFailures = results
    .filter(isFailing)
    .map((result) => result.id)
    .sort((a, b) => a.localeCompare(b));
  return {
    corpus,
    total: results.length,
    passed: results.filter((result) => result.status === "pass").length,
    skipped: results.filter((result) => result.status === "skip").length,
    knownFailures,
  };
}
