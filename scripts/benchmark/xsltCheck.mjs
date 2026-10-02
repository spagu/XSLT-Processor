/**
 * Correctness pre-check of the XSLT engine benchmark: before anything is
 * timed, every scenario runs once per engine and DOM (xsltWorker.mjs
 * `--mode check`, which writes the serialized output to a file) and
 *
 * - v1 scenarios: the two engines' outputs must be equal;
 * - rewrites: xslt3's output must equal the 1.0 package's output of the
 *   original 1.0 stylesheet (`of`);
 * - every scenario: xslt3 must not fail, and must write the same output
 *   on every DOM.
 *
 * Outputs are compared after removing two serializer defaults
 * (xsltCompare.mjs).
 *
 * @module scripts/benchmark/xsltCheck
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runChild } from "./measure.mjs";
import { compareOutputs } from "./xsltCompare.mjs";
import { engineSlug } from "./xsltEngines.mjs";

/** The XSLT worker script. */
export const XSLT_WORKER = join(import.meta.dirname, "xsltWorker.mjs");

/**
 * Run one scenario once with one engine and DOM.
 *
 * @param {object} options - Options
 * @param {string} options.engine - Engine name
 * @param {string} options.dom - DOM
 * @param {string} options.dir - Input directory
 * @param {number} options.timeoutMs - Longest silence allowed
 * @param {string[]} [options.extra=[]] - Extra worker arguments
 * @returns {Promise<{output?: string, error?: string}>} The output, or why
 *   there is none
 */
export async function checkOnce({ engine, dom, dir, timeoutMs, extra = [] }) {
  let failure = null;
  let ok = false;
  const onLine = (line) => {
    if (!line.startsWith("{")) return;
    const message = JSON.parse(line);
    if (message.type === "check") ok = true;
    else if (message.type === "error") failure = message.message;
  };
  const args = ["--expose-gc", XSLT_WORKER, "--mode", "check"];
  args.push("--engine", engine, "--dom", dom, "--dir", dir, ...extra);
  const result = await runChild(process.execPath, args, {}, timeoutMs, onLine);
  if (!ok) {
    const why = result.timedOut ? "timeout" : (failure ?? result.stderr);
    return { error: why.trim().split("\n")[0] };
  }
  const file = join(dir, `out-${engineSlug(engine)}-${dom}.txt`);
  return { output: readFileSync(file, "utf8") };
}

/**
 * Problems between a reference and a candidate output.
 *
 * @param {object} where - `{id, dom}` of the problem
 * @param {string} against - What the candidate is compared with
 * @param {{output?: string, error?: string}|null} reference - Reference
 *   run (null: the candidate must only not fail)
 * @param {{output?: string, error?: string}} candidate - Candidate run
 * @returns {object[]} Zero or one problem
 */
export function compareRuns(where, against, reference, candidate) {
  if (candidate.error) {
    return [{ ...where, kind: "error", against, error: candidate.error }];
  }
  if (reference === null) return [];
  if (reference.error) {
    return [
      { ...where, kind: "reference error", against, error: reference.error },
    ];
  }
  const difference = compareOutputs(reference.output, candidate.output);
  return difference
    ? [{ ...where, kind: "mismatch", against, ...difference }]
    : [];
}

/**
 * What a scenario's xslt3 output is compared with.
 *
 * @param {import("./xsltScenarios.mjs").XsltScenario} scenario - Scenario
 * @returns {string} "1.0 package", "1.0 package on <id>" or "none"
 */
export function againstOf(scenario) {
  if (scenario.group === "only30") return "none";
  return scenario.of ? `1.0 package on ${scenario.of}` : "1.0 package";
}

/**
 * Describe a problem on one line.
 *
 * @param {object} problem - A pre-check problem
 * @returns {string} The description
 */
export function describeProblem(problem) {
  const head = `${problem.id} on ${problem.dom} (${problem.kind}, against ${problem.against})`;
  if (problem.error) return `${head}: ${problem.error}`;
  return (
    `${head}: first difference at character ${problem.offset} ` +
    `(${problem.chars.join(" vs ")} characters): ${problem.context.join(" vs ")}`
  );
}

/**
 * Run the pre-check of the selected scenarios.
 *
 * @param {object} options - Options
 * @param {import("./xsltScenarios.mjs").XsltScenario[]} options.scenarios -
 *   Scenarios
 * @param {string[]} options.doms - DOMs
 * @param {(scenario: object) => string} options.dirOf - Input directory of
 *   a scenario (written on first use)
 * @param {(id: string) => object} options.byId - Scenario by id
 * @param {number} options.timeoutMs - Per-run timeout
 * @returns {Promise<object[]>} Problems (empty when all is well)
 */
export async function preCheck({ scenarios, doms, dirOf, byId, timeoutMs }) {
  const problems = [];
  const reference = new Map();
  const oneOf = async (scenario, dom) => {
    const key = `${scenario.id}|${dom}`;
    if (!reference.has(key)) {
      const dir = dirOf(scenario);
      reference.set(
        key,
        await checkOnce({ engine: "1.0 package", dom, dir, timeoutMs }),
      );
    }
    return reference.get(key);
  };
  for (const scenario of scenarios) {
    const dir = dirOf(scenario);
    const runs = {};
    const original = byId(scenario.of ?? scenario.id);
    const against = againstOf(scenario);
    for (const dom of doms) {
      runs[dom] = await checkOnce({ engine: "xslt3", dom, dir, timeoutMs });
      const reference =
        scenario.group === "only30" ? null : await oneOf(original, dom);
      problems.push(
        ...compareRuns({ id: scenario.id, dom }, against, reference, runs[dom]),
      );
    }
    const [first, ...others] = doms;
    const done = others.filter(
      (dom) =>
        runs[first].output !== undefined && runs[dom].output !== undefined,
    );
    for (const dom of done) {
      problems.push(
        ...compareRuns(
          { id: scenario.id, dom },
          `xslt3 on ${first}`,
          runs[first],
          runs[dom],
        ),
      );
    }
    console.log(`Pre-check ${scenario.id}: done`);
  }
  for (const problem of problems) {
    console.error(`PRE-CHECK PROBLEM ${describeProblem(problem)}`);
  }
  return problems;
}
