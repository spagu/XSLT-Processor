/**
 * Correctness pre-check of the XPath benchmark: before anything is timed,
 * every scenario is evaluated once per engine and DOM (xpathWorker.mjs
 * `--mode check`), and the result summaries of the two engines must agree.
 *
 * @module scripts/benchmark/xpathCheck
 */

import { join } from "node:path";
import { runChild } from "./measure.mjs";
import { ENGINE_ORDER } from "./xpathEngines.mjs";

/** The XPath worker script. */
export const XPATH_WORKER = join(import.meta.dirname, "xpathWorker.mjs");

/**
 * Evaluate scenarios once with one engine and DOM.
 *
 * @param {object} options - Options
 * @param {string} options.engine - Engine name
 * @param {string} options.dom - "jsdom" or "xmldom"
 * @param {string[]} options.ids - Scenario ids
 * @param {number} options.timeoutMs - Longest silence allowed
 * @returns {Promise<Record<string, {summary?: object, error?: string}>>}
 *   Check result by scenario id
 * @throws {Error} When the worker fails or times out
 */
export async function runChecks({ engine, dom, ids, timeoutMs }) {
  const checks = {};
  let failure = null;
  const onLine = (line) => {
    if (!line.startsWith("{")) return;
    const message = JSON.parse(line);
    if (message.type === "check") {
      checks[message.id] = { summary: message.summary, error: message.error };
    } else if (message.type === "error") failure = message.message;
  };
  const args = ["--expose-gc", XPATH_WORKER, "--mode", "check"];
  args.push("--engine", engine, "--dom", dom, "--scenario", ids.join(","));
  const result = await runChild(process.execPath, args, {}, timeoutMs, onLine);
  if (result.timedOut || failure || result.code !== 0) {
    throw new Error(
      `Pre-check of ${engine} on ${dom} failed: ${failure ?? (result.timedOut ? "timeout" : result.stderr)}`,
    );
  }
  return checks;
}

/**
 * Describe a check result for a report.
 *
 * @param {{summary?: object, error?: string}|undefined} check - Check result
 * @returns {string} "N items, hash H: preview" or "error: message"
 */
export function describeCheck(check) {
  if (!check) return "missing";
  if (check.error) return `error: ${check.error}`;
  const { items, hash, preview } = check.summary;
  return `${items} items, hash ${hash}: ${preview}`;
}

/**
 * Scenarios whose results differ between two engines, or fail in one.
 *
 * @param {string[]} ids - Scenario ids compared
 * @param {Record<string, object>} a - Checks of the first engine
 * @param {Record<string, object>} b - Checks of the second engine
 * @returns {{id: string, a: string, b: string}[]} The differences, described
 */
export function mismatches(ids, a, b) {
  return ids
    .filter((id) => {
      const [x, y] = [a[id], b[id]];
      if (!x?.summary || !y?.summary) return true;
      return (
        x.summary.items !== y.summary.items || x.summary.hash !== y.summary.hash
      );
    })
    .map((id) => ({ id, a: describeCheck(a[id]), b: describeCheck(b[id]) }));
}

/**
 * Scenarios that fail with one engine (used for the xslt3-only ones).
 *
 * @param {string[]} ids - Scenario ids
 * @param {Record<string, object>} checks - Checks of the engine
 * @returns {{id: string, error: string}[]} The failures
 */
export function failures(ids, checks) {
  return ids
    .filter((id) => !checks[id]?.summary)
    .map((id) => ({ id, error: describeCheck(checks[id]) }));
}

/**
 * Run the pre-check; print and return every problem found.
 *
 * @param {string[]} doms - DOMs
 * @param {object[]} shared - Shared scenarios
 * @param {object[]} only31 - xslt3-only scenarios
 * @param {number} timeoutMs - Per-run timeout
 * @returns {Promise<object[]>} Problems (empty when all is well)
 */
export async function preCheck(doms, shared, only31, timeoutMs) {
  const problems = [];
  const sharedIds = shared.map((s) => s.id);
  const ownIds = only31.map((s) => s.id);
  for (const dom of doms) {
    const [one, three] = await Promise.all([
      runChecks({ engine: ENGINE_ORDER[0], dom, ids: sharedIds, timeoutMs }),
      runChecks({
        engine: "xslt3",
        dom,
        ids: [...sharedIds, ...ownIds],
        timeoutMs,
      }),
    ]);
    for (const m of mismatches(sharedIds, one, three)) {
      problems.push({ dom, id: m.id, [ENGINE_ORDER[0]]: m.a, xslt3: m.b });
    }
    for (const f of failures(ownIds, three)) {
      problems.push({ dom, id: f.id, xslt3: f.error });
    }
    console.log(`Pre-check on ${dom}: done`);
  }
  for (const p of problems) console.error("RESULT MISMATCH", p);
  return problems;
}
