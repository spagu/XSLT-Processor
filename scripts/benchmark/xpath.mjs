#!/usr/bin/env node
/**
 * XPath benchmark: XPath 1.0 of the root package against XPath 3.1 of
 * @tradik/xslt3 (`npm run bench -- --suite xpath`, or this script).
 *
 * 1. Pre-check: every scenario is evaluated once per engine and DOM; the
 *    two engines must return the same result on the shared scenarios and
 *    xslt3 must not fail on its own ones. A difference stops the run
 *    (unless `--allow-mismatch`, which records it in the results).
 * 2. Measurement: every (scenario, DOM, engine) runs in its own worker
 *    process (xpathWorker.mjs): 2 warm-up + N measured runs (default 7) of
 *    the compiled expression, then as many of one-shot compile + evaluate.
 *
 * Results go to scripts/benchmark/results-xpath.json; then
 * `node scripts/benchmark/charts.mjs --suite xpath` draws the charts.
 *
 * Usage: node scripts/benchmark/xpath.mjs [--runs 7] [--warmup 2]
 *        [--timeout 120] [--dom jsdom,xmldom] [--only id,id]
 *        [--allow-mismatch] [--out scripts/benchmark/results-xpath.json]
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { REPO_ROOT, confinePath } from "../lib/fsSafety.mjs";
import { measureScript } from "./workerMeasure.mjs";
import { machine, packageVersion } from "./versions.mjs";
import { XPATH_WORKER, preCheck } from "./xpathCheck.mjs";
import { ENGINES, ENGINE_ORDER } from "./xpathEngines.mjs";
import { SHARED_SCENARIOS, XPATH31_SCENARIOS } from "./xpathScenarios.mjs";

/**
 * Split `--suite NAME` (or `--suite=NAME`) off command-line arguments.
 *
 * @param {string[]} argv - Arguments
 * @returns {{suite: string|undefined, rest: string[]}} The suite and the
 *   other arguments
 */
export function splitSuite(argv) {
  const rest = [];
  let suite;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--suite") suite = argv[++index];
    else if (arg.startsWith("--suite=")) suite = arg.slice(8);
    else rest.push(arg);
  }
  return { suite, rest };
}

/**
 * Version of a package.json in the repository.
 *
 * @param {string} path - Path relative to the repository root
 * @returns {string} Its version
 */
function versionOf(path) {
  return JSON.parse(readFileSync(join(REPO_ROOT, path), "utf8")).version;
}

/**
 * Measure one scenario on one engine and DOM.
 *
 * @param {object} scenario - Scenario
 * @param {string} engine - Engine name
 * @param {string} dom - DOM
 * @param {{warmup: number, runs: number, timeoutMs: number}} settings - Runs
 * @returns {Promise<object>} `{status, compiled, oneShot, maxRssMb}` or
 *   `{status, note}`
 */
async function measureOne(scenario, engine, dom, settings) {
  const args = ["--engine", engine, "--dom", dom, "--scenario", scenario.id];
  args.push("--warmup", String(settings.warmup));
  args.push("--runs", String(settings.runs));
  const result = await measureScript({
    script: XPATH_WORKER,
    args,
    timeoutMs: settings.timeoutMs,
  });
  if (result.status !== "ok") return result;
  const strip = ({ maxRssMb: _drop, status: _ok, ...rest }) => rest;
  return {
    status: "ok",
    compiled: strip(result.phases.compiled),
    oneShot: strip(result.phases.oneShot),
    maxRssMb: result.phases.compiled.maxRssMb,
  };
}

/**
 * Run the XPath benchmark.
 *
 * @param {string[]} argv - Command-line arguments (without `--suite`)
 * @returns {Promise<void>}
 */
export async function runXPathSuite(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      runs: { type: "string", default: "7" },
      warmup: { type: "string", default: "2" },
      timeout: { type: "string", default: "120" },
      dom: { type: "string", default: "jsdom,xmldom" },
      only: { type: "string" },
      "allow-mismatch": { type: "boolean", default: false },
      out: { type: "string", default: "scripts/benchmark/results-xpath.json" },
    },
  });
  const settings = {
    runs: Number(values.runs),
    warmup: Number(values.warmup),
    timeoutMs: Number(values.timeout) * 1000,
  };
  const outFile = confinePath(values.out);
  const doms = values.dom.split(",");
  const only = values.only?.split(",");
  const pick = (list) => list.filter((s) => !only || only.includes(s.id));
  const [shared, only31] = [pick(SHARED_SCENARIOS), pick(XPATH31_SCENARIOS)];
  const started = Date.now();

  const problems = await preCheck(doms, shared, only31, settings.timeoutMs);
  if (problems.length && !values["allow-mismatch"]) {
    throw new Error(
      `${problems.length} pre-check problem(s); rerun with --allow-mismatch to measure anyway`,
    );
  }
  const results = [];
  const groups = [
    ["shared", shared, ENGINE_ORDER],
    ["xpath31", only31, ["xslt3"]],
  ];
  for (const [group, list, engines] of groups) {
    for (const scenario of list) {
      const row = { ...scenario, group, doms: {} };
      for (const dom of doms) {
        row.doms[dom] = {};
        for (const engine of engines) {
          const m = await measureOne(scenario, engine, dom, settings);
          row.doms[dom][engine] = m;
          const summary =
            m.status === "ok"
              ? `compiled ${m.compiled.medianMs} ms, one-shot ${m.oneShot.medianMs} ms, ${m.maxRssMb} MB`
              : `${m.status}: ${m.note}`;
          console.log(
            `${scenario.id.padEnd(20)} ${dom.padEnd(7)} ${engine.padEnd(12)} ${summary}`,
          );
        }
      }
      results.push(row);
    }
  }
  const minutes = Math.round((Date.now() - started) / 600) / 100;
  const environment = {
    ...machine(),
    ...settings,
    durationMin: minutes,
    engines: {
      [ENGINE_ORDER[0]]: versionOf("package.json"),
      xslt3: versionOf("packages/xslt3/package.json"),
    },
    entries: Object.fromEntries(
      ENGINE_ORDER.map((name) => [name, ENGINES[name].entry]),
    ),
    dom: {
      jsdom: packageVersion(REPO_ROOT, "jsdom"),
      xmldom: packageVersion(REPO_ROOT, "@xmldom/xmldom"),
    },
    doms,
  };
  const data = { environment, problems, results };
  writeFileSync(outFile, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`Wrote ${outFile} (${minutes} min)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runXPathSuite(process.argv.slice(2));
}
