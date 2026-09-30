#!/usr/bin/env node
/**
 * Benchmark 1.1.3 against 1.2.0 (`npm run bench`).
 *
 * Every (version, scenario) pair runs in its own child process: 2 warm-up
 * runs, then N measured runs (default 7); the median, p95, min and peak RSS
 * are written to scripts/benchmark/results.json together with the machine,
 * Node.js and DOM versions. A run slower than the timeout (default 120 s)
 * is recorded as "timeout", a failure as "error". Inputs are generated
 * deterministically (inputs.mjs) into a temporary directory.
 *
 * Usage: node scripts/benchmark/run.mjs [--runs 7] [--warmup 2]
 *        [--timeout 120] [--only id,id] [--out scripts/benchmark/results.json]
 * Then: node scripts/benchmark/charts.mjs
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { TMP_ROOT, confinePath } from "../lib/fsSafety.mjs";
import { INPUTS } from "./inputs.mjs";
import { binaryCommand } from "./binary.mjs";
import { RSS_REPORTER, measureCommand, measureWorker } from "./measure.mjs";
import { SCENARIOS } from "./scenarios.mjs";
import { environment, prepareVersions } from "./versions.mjs";

const { values } = parseArgs({
  options: {
    runs: { type: "string", default: "7" },
    warmup: { type: "string", default: "2" },
    timeout: { type: "string", default: "120" },
    only: { type: "string" },
    out: { type: "string", default: "scripts/benchmark/results.json" },
  },
});

const settings = {
  runs: Number(values.runs),
  warmup: Number(values.warmup),
  timeoutMs: Number(values.timeout) * 1000,
};
const outFile = confinePath(values.out);

/**
 * Write the input set of a scenario once.
 *
 * @param {string} base - Temporary directory of all input sets
 * @param {string} name - Input set name
 * @returns {string} Directory holding in.xml and t.xsl
 */
function inputDir(base, name) {
  const dir = join(base, name);
  mkdirSync(dir, { recursive: true });
  const { xml, xsl } = INPUTS[name]();
  writeFileSync(join(dir, "in.xml"), xml);
  writeFileSync(join(dir, "t.xsl"), xsl);
  return dir;
}

/**
 * Measure one scenario of one version.
 *
 * @param {import("./scenarios.mjs").Scenario} scenario - The scenario
 * @param {string} root - Version directory
 * @param {string} dir - Input directory (undefined for binary)
 * @returns {Promise<import("./measure.mjs").Measurement>} The measurement
 */
async function measure(scenario, root, dir) {
  const common = { ...settings };
  if (scenario.kind === "lib" || scenario.kind === "stream") {
    return measureWorker({ ...common, root, dir, kind: scenario.kind });
  }
  if (scenario.kind === "cli") {
    return measureCommand({
      ...common,
      command: process.execPath,
      args: [
        "--import",
        RSS_REPORTER,
        join(root, "bin", "xslt.js"),
        "in.xml",
        "t.xsl",
        "-o",
        "out.html",
      ],
      spawnOptions: { cwd: dir, env: { ...process.env, ...scenario.env } },
    });
  }
  const binary = binaryCommand();
  if (!binary.command) return { status: "skipped", note: binary.note };
  return measureCommand({
    ...common,
    command: binary.command,
    args: ["--version"],
    spawnOptions: {},
  });
}

/**
 * Run the selected scenarios.
 *
 * @returns {Promise<void>}
 */
async function main() {
  const started = Date.now();
  const only = values.only?.split(",");
  const roots = prepareVersions();
  const base = mkdtempSync(join(TMP_ROOT, "xslt-bench-"));
  const dirs = new Map();
  const results = [];
  try {
    for (const scenario of SCENARIOS.filter(
      (s) => !only || only.includes(s.id),
    )) {
      if (scenario.input && !dirs.has(scenario.input)) {
        dirs.set(scenario.input, inputDir(base, scenario.input));
      }
      const row = {
        id: scenario.id,
        label: scenario.label,
        kind: scenario.kind,
        versions: {},
      };
      for (const version of scenario.versions) {
        const result = await measure(
          scenario,
          roots[version],
          dirs.get(scenario.input),
        );
        row.versions[version] = result;
        console.log(
          `${scenario.id.padEnd(18)} ${version}  ${describe(result)}`,
        );
      }
      results.push(row);
    }
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
  const minutes = Math.round((Date.now() - started) / 600) / 100;
  const data = {
    environment: { ...environment(roots), ...settings, durationMin: minutes },
    results,
  };
  writeFileSync(outFile, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`Wrote ${outFile} (${minutes} min)`);
}

/**
 * One-line summary of a measurement for the console.
 *
 * @param {import("./measure.mjs").Measurement} result - The measurement
 * @returns {string} The summary
 */
function describe(result) {
  if (result.status !== "ok") return `${result.status}: ${result.note}`;
  return `median ${result.medianMs} ms, p95 ${result.p95Ms} ms, min ${result.minMs} ms, ${result.maxRssMb ?? "?"} MB`;
}

await main();
