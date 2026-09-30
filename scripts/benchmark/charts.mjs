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
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { REPO_ROOT, confinePath } from "../lib/fsSafety.mjs";
import { hero, memoryTable, rows, speedupTable, timeTable } from "./data.mjs";
import { speedupChart, timeChart } from "./figures.mjs";
import { memoryChart } from "./memory.mjs";

const { values } = parseArgs({
  options: {
    results: { type: "string", default: "scripts/benchmark/results.json" },
  },
});

const DOCS = join(REPO_ROOT, "docs");
const PAGE = join(DOCS, "BENCHMARKS.md");

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

/**
 * Replace the generated part NAME of the page.
 *
 * @param {string} page - Markdown
 * @param {string} name - Part name
 * @param {string} content - New content
 * @returns {string} Updated Markdown
 * @throws {Error} When the markers are missing
 */
function fill(page, name, content) {
  const open = `<!-- bench:${name} -->`;
  const close = `<!-- /bench:${name} -->`;
  const start = page.indexOf(open);
  const end = page.indexOf(close);
  if (start === -1 || end < start) {
    throw new Error(`Missing ${open} ... ${close} in docs/BENCHMARKS.md`);
  }
  return `${page.slice(0, start + open.length)}\n${content}\n${page.slice(end)}`;
}

/**
 * Write one chart and return its Markdown: the image (alt text = the
 * chart's description) followed by its data table.
 *
 * @param {string} name - File name without extension
 * @param {string} svg - SVG source
 * @param {string} dataTable - Markdown table of the chart's data
 * @returns {string} Markdown
 */
function chart(name, svg, dataTable) {
  writeFileSync(join(DOCS, "benchmarks", `${name}.svg`), svg);
  const alt = /<desc id="d">([^<]*)<\/desc>/.exec(svg)[1];
  return `<img src="benchmarks/${name}.svg" width="720" alt="${alt}">\n\n${dataTable}`;
}

const data = JSON.parse(readFileSync(confinePath(values.results), "utf8"));
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
