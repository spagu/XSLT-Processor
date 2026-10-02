/**
 * Running the pairs: each one on the reference engine and on Tradik, then
 * the comparison. One pair at a time (the browser engine has one page).
 *
 * @module xslt-migrate-check/compat/run
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { compareOutputs, outputMethod } from "./compare.js";
import { NO_REFERENCE_REASON } from "./report.js";

/**
 * The message of a rejected engine call.
 *
 * @param {unknown} reason - The rejection reason
 * @returns {string} One line
 */
const messageOf = (reason) => String(reason?.message ?? reason).split("\n")[0];

/**
 * Run one pair.
 *
 * @param {import("./pairs.js").Pair} pair - The pair
 * @param {{reference: object, tradik: object, rootDir: string}} engines -
 *   Reference (transform may be null), Tradik, and the scanned directory
 * @returns {Promise<import("./report.js").TestResult>} The result
 */
export async function runPair(pair, { reference, tradik, rootDir }) {
  const base = { xml: pair.xml, xsl: pair.xsl, params: pair.params };
  if (pair.skip) return { ...base, status: "SKIPPED", reason: pair.skip };
  const [expected, actual] = await Promise.allSettled([
    reference.transform?.(pair, rootDir) ?? null,
    tradik.transform(pair, rootDir),
  ]);
  if (expected.status === "rejected") {
    return {
      ...base,
      status: "ERROR",
      engine: reference.name,
      message: messageOf(expected.reason),
    };
  }
  if (actual.status === "rejected") {
    return {
      ...base,
      status: "ERROR",
      engine: "Tradik",
      message: messageOf(actual.reason),
    };
  }
  if (!reference.transform) {
    return { ...base, status: "SKIPPED", reason: NO_REFERENCE_REASON };
  }
  // The stylesheet was read by both engines already. NOSONAR
  const xslText = await readFile(join(rootDir, pair.xsl), "utf8"); // NOSONAR
  const method = outputMethod(xslText, expected.value);
  const comparison = compareOutputs(
    expected.value,
    actual.value,
    method,
    tradik.tools,
  );
  if (comparison.status === "MATCH") return { ...base, status: "MATCH" };
  return {
    ...base,
    ...comparison,
    expectedOutput: expected.value,
    actualOutput: actual.value,
  };
}

/**
 * Run every pair, one after the other.
 *
 * @param {import("./pairs.js").Pair[]} pairs - The pairs
 * @param {{reference: object, tradik: object, rootDir: string}} engines -
 *   See runPair
 * @returns {Promise<import("./report.js").TestResult[]>} The results, in
 *   pair order
 */
export function runPairs(pairs, engines) {
  return pairs.reduce(
    (chain, pair) =>
      chain.then(async (results) => [...results, await runPair(pair, engines)]),
    Promise.resolve([]),
  );
}
