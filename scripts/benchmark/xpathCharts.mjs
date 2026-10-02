/**
 * Render the XPath benchmark results (scripts/benchmark/results-xpath.json,
 * written by xpath.mjs) as docs/benchmarks/xpath-*.svg and refresh the
 * `<!-- bench:xpath-* -->` parts of docs/BENCHMARKS.md
 * (`node scripts/benchmark/charts.mjs --suite xpath`).
 *
 * @module scripts/benchmark/xpathCharts
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { confinePath } from "../lib/fsSafety.mjs";
import { DOCS, PAGE, chart, fill } from "./page.mjs";
import { formatRatio, ratioWords } from "./xpathMarks.mjs";
import {
  only31Table,
  ratioTable,
  sharedTable,
  xpathMemoryTable,
  xpathRows,
} from "./xpathData.mjs";
import { engineTimeChart, only31Chart, ratioChart } from "./xpathFigures.mjs";

/**
 * Method facts from the recorded environment.
 *
 * @param {object} env - results-xpath.json `environment`
 * @returns {string} Markdown list
 */
export function xpathMethod(env) {
  const [one, three] = Object.entries(env.engines);
  return [
    `- Machine: ${env.cpu}, ${env.cores} logical cores, ${env.ramGb} GB RAM, ${env.os}`,
    `- Node.js ${env.node.replace(/^v/, "")}; DOM: jsdom ${env.dom.jsdom}, @xmldom/xmldom ${env.dom.xmldom}`,
    `- Engines: ${one[0]} ${one[1]} (\`${env.entries[one[0]]}\`), ${three[0]} ${three[1]} (\`${env.entries[three[0]]}\`)`,
    `- Runs: ${env.warmup} warm-up + ${env.runs} measured per phase (compiled, then one-shot), each scenario, DOM and engine in its own process; a run over ${env.timeoutMs / 1000} s counts as a timeout. Phases slower than 10 s per run use 1 warm-up + 3 runs`,
    `- Recorded ${env.date.slice(0, 10)}; the whole run took ${env.durationMin} minutes`,
  ].join("\n");
}

/**
 * The pre-check outcome.
 *
 * @param {object[]} problems - results-xpath.json `problems`
 * @returns {string} Markdown
 */
export function problemsText(problems) {
  if (!problems.length) {
    return "Both engines returned the same result (item count and a hash of every item) for every shared scenario on every DOM, and every xslt3-only expression evaluated without an error.";
  }
  const lines = problems.map(
    ({ dom, id, ...engines }) =>
      `- \`${id}\` on ${dom}: ${Object.entries(engines)
        .map(([engine, result]) => `${engine}: ${result}`)
        .join("; ")}`,
  );
  return ["Result differences found by the pre-check:", "", ...lines].join(
    "\n",
  );
}

/**
 * Geometric mean of positive numbers.
 *
 * @param {number[]} values - Values
 * @returns {number} The mean (NaN for none)
 */
export function geometricMean(values) {
  return Math.exp(
    values.reduce((sum, value) => sum + Math.log(value), 0) / values.length,
  );
}

/**
 * Headline: geometric mean ratio per DOM and the range of the ratio.
 *
 * @param {Record<string, XPathRow[]>} byDom - Shared rows by DOM
 * @returns {string} Markdown
 */
export function xpathHero(byDom) {
  const parts = Object.entries(byDom).map(([dom, rows]) => {
    const compared = rows.filter((row) => row.ratio);
    const sorted = [...compared].sort((a, b) => a.ratio - b.ratio);
    const [low, high] = [sorted[0], sorted[sorted.length - 1]];
    return (
      `on ${dom}, xslt3 is **${ratioWords(geometricMean(compared.map((row) => row.ratio)))}** than the 1.0 package ` +
      `(geometric mean of the time ratio over ${compared.length} scenarios; ` +
      `from ${formatRatio(low.ratio)} the time on ${low.label} to ${formatRatio(high.ratio)} on ${high.label})`
    );
  });
  const text = parts.join(" · ");
  return `${text[0].toUpperCase()}${text.slice(1)}.`;
}

/**
 * Rows of a group by DOM, in the recorded DOM order.
 *
 * @param {object} data - Parsed results-xpath.json
 * @param {"shared"|"xpath31"} group - Group
 * @returns {Record<string, import("./xpathData.mjs").XPathRow[]>} Rows
 */
function byDom(data, group) {
  return Object.fromEntries(
    data.environment.doms.map((dom) => [dom, xpathRows(data, group, dom)]),
  );
}

/**
 * Write the XPath charts and the XPath parts of docs/BENCHMARKS.md.
 *
 * @param {string} resultsPath - Path of results-xpath.json
 */
export function writeXPathCharts(resultsPath) {
  const data = JSON.parse(readFileSync(confinePath(resultsPath), "utf8"));
  const shared = byDom(data, "shared");
  const only31 = byDom(data, "xpath31");
  mkdirSync(join(DOCS, "benchmarks"), { recursive: true });
  let page = readFileSync(PAGE, "utf8");
  page = fill(page, "xpath-hero", xpathHero(shared));
  page = fill(page, "xpath-method", xpathMethod(data.environment));
  page = fill(page, "xpath-check", problemsText(data.problems));
  page = fill(
    page,
    "xpath-ratio",
    chart("xpath-ratio", ratioChart(shared), ratioTable(shared)),
  );
  const written = ["xpath-ratio"];
  for (const dom of data.environment.doms) {
    const name = `xpath-time-${dom}`;
    page = fill(
      page,
      name,
      chart(name, engineTimeChart(shared[dom], dom), sharedTable(shared[dom])),
    );
    written.push(name);
  }
  page = fill(
    page,
    "xpath-only31",
    chart("xpath-only31", only31Chart(only31), only31Table(only31)),
  );
  written.push("xpath-only31");
  page = fill(page, "xpath-memory", xpathMemoryTable(data));
  writeFileSync(PAGE, page);
  console.log(
    `Wrote docs/benchmarks/{${written.join(",")}}.svg and docs/BENCHMARKS.md`,
  );
}
