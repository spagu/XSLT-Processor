#!/usr/bin/env node
/**
 * XSLT engine benchmark: @tradik/xslt-processor (XSLT 1.0) against
 * @tradik/xslt3 (XSLT 3.0) — `node scripts/benchmark/run.mjs --suite xslt`.
 *
 * 1. Pre-check (xsltCheck.mjs): every scenario runs once per engine and
 *    DOM; outputs that differ, or a failure, stop the run (unless
 *    `--allow-mismatch`, which records them in the results).
 * 2. Measurement: every (scenario, DOM, engine) runs in its own worker
 *    process (xsltWorker.mjs): 2 warm-up + N measured runs (default 7) of
 *    compiling the stylesheet, then as many transformations + serializations
 *    with one compiled stylesheet.
 * 3. Start-up (xsltStartup.mjs): bundle sizes and import times.
 * 4. With `--saxon-dir`, SaxonJS 3 as a local reference (xsltSaxon.mjs),
 *    written to `--saxon-out` (system temporary directory), never to the
 *    published results.
 *
 * Results go to scripts/benchmark/results-xslt.json; then
 * `node scripts/benchmark/charts.mjs --suite xslt` draws the charts.
 *
 * Usage: node scripts/benchmark/run.mjs --suite xslt [--runs 7] [--warmup 2]
 *        [--timeout 120] [--dom jsdom,xmldom] [--only id,id] [--no-startup]
 *        [--allow-mismatch] [--out scripts/benchmark/results-xslt.json]
 *        [--saxon-dir <dir>] [--saxon-out <file>]
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { REPO_ROOT, TMP_ROOT, confinePath } from "../lib/fsSafety.mjs";
import { machine, packageVersion } from "./versions.mjs";
import { preCheck } from "./xsltCheck.mjs";
import {
  describeXslt,
  inputDirs,
  measureOne,
  versionOf,
} from "./xsltMeasure.mjs";
import { measureSaxon, saxonVersions } from "./xsltSaxon.mjs";
import { XSLT_SCENARIOS, pickScenarios } from "./xsltScenarios.mjs";
import { ENTRIES, measureStartup } from "./xsltStartup.mjs";

/**
 * Run the XSLT engine benchmark.
 *
 * @param {string[]} argv - Command-line arguments (without `--suite`)
 * @returns {Promise<void>}
 */
export async function runXsltSuite(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      runs: { type: "string", default: "7" },
      warmup: { type: "string", default: "2" },
      timeout: { type: "string", default: "120" },
      dom: { type: "string", default: "jsdom,xmldom" },
      only: { type: "string" },
      "no-startup": { type: "boolean", default: false },
      "allow-mismatch": { type: "boolean", default: false },
      out: { type: "string", default: "scripts/benchmark/results-xslt.json" },
      "saxon-dir": { type: "string" },
      "saxon-out": {
        type: "string",
        default: join(TMP_ROOT, "xslt-bench-saxon.json"),
      },
    },
  });
  const settings = {
    runs: Number(values.runs),
    warmup: Number(values.warmup),
    timeoutMs: Number(values.timeout) * 1000,
  };
  const outFile = confinePath(values.out);
  const saxonDir = values["saxon-dir"] && confinePath(values["saxon-dir"]);
  const saxon = saxonDir ? saxonVersions(saxonDir) : null;
  const doms = values.dom.split(",");
  const scenarios = pickScenarios(values.only?.split(","));
  const started = Date.now();
  const base = mkdtempSync(join(TMP_ROOT, "xslt3-bench-"));
  const dirOf = inputDirs(base);
  const byId = (id) => XSLT_SCENARIOS.find((s) => s.id === id);
  const results = [];
  const saxonResults = [];
  let problems;
  let startup = null;
  try {
    problems = await preCheck({
      scenarios,
      doms,
      dirOf,
      byId,
      timeoutMs: settings.timeoutMs,
    });
    if (problems.length && !values["allow-mismatch"]) {
      throw new Error(
        `${problems.length} pre-check problem(s); rerun with --allow-mismatch to measure anyway`,
      );
    }
    for (const scenario of scenarios) {
      const row = { ...scenario, doms: {} };
      for (const dom of doms) {
        row.doms[dom] = {};
        for (const engine of scenario.engines) {
          const m = await measureOne(dirOf(scenario), engine, dom, settings);
          row.doms[dom][engine] = m;
          console.log(
            `${scenario.id.padEnd(22)} ${dom.padEnd(7)} ${engine.padEnd(12)} ${describeXslt(m)}`,
          );
        }
      }
      results.push(row);
      if (saxonDir) {
        const m = await measureSaxon({
          saxonDir,
          dir: dirOf(scenario),
          reference: doms[0],
          settings,
        });
        saxonResults.push({
          id: scenario.id,
          label: scenario.label,
          group: scenario.group,
          saxon: m,
        });
        console.log(
          `${scenario.id.padEnd(22)} saxon   SaxonJS 3    ${m.status === "ok" ? `SEF ${m.sef.medianMs} ms, ${describeXslt(m)}` : `${m.status}: ${m.note}`}`,
        );
      }
    }
    if (!values["no-startup"]) {
      startup = await measureStartup(base, { ...settings, warmup: 1 });
    }
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
  const minutes = Math.round((Date.now() - started) / 600) / 100;
  const environment = {
    ...machine(),
    ...settings,
    durationMin: minutes,
    provisional: true,
    engines: {
      "1.0 package": versionOf("package.json"),
      xslt3: versionOf("packages/xslt3/package.json"),
    },
    entries: ENTRIES,
    dom: {
      jsdom: packageVersion(REPO_ROOT, "jsdom"),
      xmldom: packageVersion(REPO_ROOT, "@xmldom/xmldom"),
    },
    doms,
  };
  writeFileSync(
    outFile,
    `${JSON.stringify({ environment, problems, results, startup }, null, 2)}\n`,
  );
  console.log(`Wrote ${outFile} (${minutes} min)`);
  if (saxonDir) {
    const local = {
      environment: { ...environment, saxon },
      results: saxonResults,
    };
    writeFileSync(
      confinePath(values["saxon-out"]),
      `${JSON.stringify(local, null, 2)}\n`,
    );
    console.log(
      `Wrote ${values["saxon-out"]} (SaxonJS, local only: do not publish)`,
    );
  }
}
