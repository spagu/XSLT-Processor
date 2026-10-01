#!/usr/bin/env node
/**
 * Render the benchmark results (scripts/benchmark/results.json, written by
 * run.mjs) as static SVG charts in docs/benchmarks/ and refresh the
 * generated parts of docs/BENCHMARKS.md: the headline, the method facts and
 * the data table after every chart. Each generated part sits between
 * `<!-- bench:NAME -->` and `<!-- /bench:NAME -->`; the prose around them
 * is hand-written.
 *
 * Usage: node scripts/benchmark/charts.mjs [--results scripts/benchmark/results.json]
 *        node scripts/benchmark/charts.mjs --suite xpath [--results scripts/benchmark/results-xpath.json]
 * (the XPath charts and sections, see xpathCharts.mjs)
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { confinePath } from "../lib/fsSafety.mjs";
import { hero, memoryTable, rows, speedupTable, timeTable } from "./data.mjs";
import { speedupChart, timeChart } from "./figures.mjs";
import { memoryChart } from "./memory.mjs";
import { DOCS, PAGE, chart, fill } from "./page.mjs";
import { writeXPathCharts } from "./xpathCharts.mjs";

const { values } = parseArgs({
  options: {
    results: { type: "string" },
    suite: { type: "string", default: "xslt" },
  },
});

if (values.suite === "xpath") {
  writeXPathCharts(values.results ?? "scripts/benchmark/results-xpath.json");
  process.exit();
}
if (values.suite !== "xslt") {
  throw new Error(`Unknown benchmark suite: ${values.suite} (xslt or xpath)`);
}

/**
 * Method facts from the recorded environment.
 *
 * @param {object} env - results.json `environment`
 * @returns {string} Markdown list
 */
function method(env) {
  return [
    `- Machine: ${env.cpu}, ${env.cores} logical cores, ${env.ramGb} GB RAM, ${env.os}`,
    `- Node.js ${env.node.replace(/^v/, "")}; DOM: jsdom ${env.dom.jsdom} (library runs and both CLIs), @xmldom/xmldom ${env.dom.xmldom} (xmldom CLI row)`,
    `- Runs: ${env.warmup} warm-up + ${env.runs} measured per version and scenario, each pair in its own process; a run over ${env.timeoutMs / 1000} s counts as a timeout. Scenarios slower than 10 s per run use 1 warm-up + 3 runs`,
    `- Recorded ${env.date.slice(0, 10)}; the whole run took ${env.durationMin} minutes`,
  ].join("\n");
}

const data = JSON.parse(
  readFileSync(
    confinePath(values.results ?? "scripts/benchmark/results.json"),
    "utf8",
  ),
);
const list = rows(data);
mkdirSync(join(DOCS, "benchmarks"), { recursive: true });

let page = readFileSync(PAGE, "utf8");
page = fill(page, "hero", hero(list));
page = fill(page, "method", method(data.environment));
page = fill(
  page,
  "speedup",
  chart("speedup", speedupChart(list), speedupTable(list)),
);
page = fill(page, "time", chart("time", timeChart(list), timeTable(list)));
page = fill(
  page,
  "memory",
  chart("memory", memoryChart(list), memoryTable(list)),
);
writeFileSync(PAGE, page);
console.log(
  "Wrote docs/benchmarks/{speedup,time,memory}.svg and docs/BENCHMARKS.md",
);
