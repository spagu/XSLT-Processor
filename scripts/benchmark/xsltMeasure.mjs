/**
 * Helpers of the XSLT engine benchmark runner (xslt.mjs): input files,
 * measuring one (scenario, engine, DOM) in a worker, console summaries.
 *
 * @module scripts/benchmark/xsltMeasure
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "../lib/fsSafety.mjs";
import { measureScript } from "./workerMeasure.mjs";
import { XSLT_WORKER } from "./xsltCheck.mjs";
import { scenarioInput } from "./xsltScenarios.mjs";

/**
 * Measure one scenario on one engine and DOM.
 *
 * @param {string} dir - Input directory
 * @param {string} engine - Engine name
 * @param {string} dom - DOM
 * @param {{warmup: number, runs: number, timeoutMs: number}} settings - Runs
 * @returns {Promise<object>} `{status, compile, transform, maxRssMb}` or
 *   `{status, note}`
 */
export async function measureOne(dir, engine, dom, settings) {
  const args = ["--engine", engine, "--dom", dom, "--dir", dir];
  args.push(
    "--warmup",
    String(settings.warmup),
    "--runs",
    String(settings.runs),
  );
  const result = await measureScript({
    script: XSLT_WORKER,
    args,
    timeoutMs: settings.timeoutMs,
  });
  if (result.status !== "ok") return result;
  const strip = ({ maxRssMb: _drop, status: _ok, ...rest }) => rest;
  return {
    status: "ok",
    compile: strip(result.phases.compile),
    transform: strip(result.phases.transform),
    maxRssMb: result.phases.transform.maxRssMb,
  };
}

/**
 * One-line summary of a measurement.
 *
 * @param {object} m - Measurement
 * @returns {string} The summary
 */
export function describeXslt(m) {
  if (m.status !== "ok") return `${m.status}: ${m.note}`;
  return `compile ${m.compile.medianMs} ms, transform ${m.transform.medianMs} ms, ${m.maxRssMb} MB`;
}

/**
 * Write the input files of a scenario once (in.xml, t.xsl, params.json).
 *
 * @param {string} base - Directory of all inputs
 * @returns {(scenario: object) => string} Input directory of a scenario
 */
export function inputDirs(base) {
  const dirs = new Map();
  return (scenario) => {
    if (!dirs.has(scenario.id)) {
      const dir = join(base, scenario.id);
      mkdirSync(dir, { recursive: true });
      const { xml, xsl, params = {} } = scenarioInput(scenario);
      writeFileSync(join(dir, "in.xml"), xml);
      writeFileSync(join(dir, "t.xsl"), xsl);
      writeFileSync(join(dir, "params.json"), JSON.stringify(params));
      dirs.set(scenario.id, dir);
    }
    return dirs.get(scenario.id);
  };
}

/**
 * Version of a package.json in the repository.
 *
 * @param {string} path - Path relative to the repository root
 * @returns {string} Its version
 */
export function versionOf(path) {
  return JSON.parse(readFileSync(join(REPO_ROOT, path), "utf8")).version;
}
