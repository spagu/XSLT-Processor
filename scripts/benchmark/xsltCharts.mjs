/**
 * Render the XSLT engine benchmark results (scripts/benchmark/results-xslt.json,
 * written by xslt.mjs) as docs/benchmarks/xslt-*.svg and refresh the
 * `<!-- bench:xslt-* -->` parts of docs/BENCHMARKS.md
 * (`node scripts/benchmark/charts.mjs --suite xslt`).
 *
 * @module scripts/benchmark/xsltCharts
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { confinePath } from "../lib/fsSafety.mjs";
import { DOCS, PAGE, chart, fill } from "./page.mjs";
import { geometricMean, xpathHero } from "./xpathCharts.mjs";
import { only31Chart, ratioChart } from "./xpathFigures.mjs";
import { ratioWords } from "./xpathMarks.mjs";
import { describeProblem } from "./xsltCheck.mjs";
import {
  byDom,
  only30Rows,
  only30Table,
  rewriteRows,
  rewriteTable,
  v1Rows,
  v1Table,
} from "./xsltData.mjs";
import { rewriteChart } from "./xsltFigures.mjs";
import { compileTable, startupTable, xsltMemoryTable } from "./xsltTables.mjs";

/**
 * Method facts from the recorded environment.
 *
 * @param {object} env - results-xslt.json `environment`
 * @returns {string} Markdown list
 */
export function xsltMethod(env) {
  const [one, three] = Object.entries(env.engines);
  const lines = [
    `- Machine: ${env.cpu}, ${env.cores} logical cores, ${env.ramGb} GB RAM, ${env.os}`,
    `- Node.js ${env.node.replace(/^v/, "")}; DOM: jsdom ${env.dom.jsdom}, @xmldom/xmldom ${env.dom.xmldom}`,
    `- Engines: ${one[0]} ${one[1]} (\`${env.entries[one[0]]}\`), ${three[0]} ${three[1]} (\`${env.entries[three[0]]}\`, in development)`,
    `- Runs: ${env.warmup} warm-up + ${env.runs} measured per phase (compile, then transform), each scenario, DOM and engine in its own process; a run over ${env.timeoutMs / 1000} s counts as a timeout. Phases slower than 10 s per run use 1 warm-up + 3 runs`,
    `- Recorded ${env.date.slice(0, 10)}; the whole run took ${env.durationMin} minutes`,
  ];
  if (env.provisional) {
    lines.push(
      "- **Provisional**: recorded on a machine shared with other work, so single numbers may be off by tens of percent; to be re-run on an idle machine before the release",
    );
  }
  return lines.join("\n");
}

/**
 * The pre-check outcome.
 *
 * @param {object[]} problems - results-xslt.json `problems`
 * @returns {string} Markdown
 */
export function xsltProblemsText(problems) {
  if (!problems.length) {
    return "Both engines wrote the same output for every XSLT 1.0 stylesheet on every DOM, every rewrite reproduced the 1.0 package's output of the original stylesheet, every XSLT 3.0-only stylesheet ran without an error, and xslt3 wrote the same output on every DOM.";
  }
  return [
    "Differences found by the pre-check:",
    "",
    ...problems.map((p) => `- ${describeProblem(p).replaceAll("|", "\\|")}`),
  ].join("\n");
}

/**
 * Headline: xslt3 ÷ 1.0 package on the 1.0 stylesheets per DOM, then the
 * gain of the rewrites on the first DOM.
 *
 * @param {Record<string, object[]>} v1 - v1 rows by DOM
 * @param {object[]} rewrites - Rewrite rows of the first DOM
 * @param {string} dom - The first DOM
 * @returns {string} Markdown
 */
export function xsltHero(v1, rewrites, dom) {
  const head = xpathHero(v1).replace(/\.$/, "");
  const gains = rewrites.filter((row) => row.gain).map((row) => row.gain);
  if (!gains.length) return `${head}.`;
  const best = rewrites.reduce((a, b) =>
    (b.gain ?? 0) > (a.gain ?? 0) ? b : a,
  );
  return (
    `${head} · rewritten in XSLT 2.0/3.0, the same tasks run **${ratioWords(1 / geometricMean(gains))}** on xslt3 ` +
    `than their 1.0 stylesheets (geometric mean over ${gains.length} tasks on ${dom}; ${ratioWords(1 / best.gain)} on ${best.label}).`
  );
}

/**
 * Write the XSLT engine charts and the XSLT parts of docs/BENCHMARKS.md.
 *
 * @param {string} resultsPath - Path of results-xslt.json
 */
export function writeXsltCharts(resultsPath) {
  const data = JSON.parse(readFileSync(confinePath(resultsPath), "utf8"));
  const [main] = data.environment.doms;
  const v1 = byDom(data, v1Rows);
  const rewrites = byDom(data, rewriteRows);
  const only30 = byDom(data, only30Rows);
  mkdirSync(join(DOCS, "benchmarks"), { recursive: true });
  let page = readFileSync(PAGE, "utf8");
  page = fill(page, "xslt-hero", xsltHero(v1, rewrites[main], main));
  page = fill(page, "xslt-method", xsltMethod(data.environment));
  page = fill(page, "xslt-check", xsltProblemsText(data.problems));
  const ratioSvg = ratioChart(
    v1,
    "XSLT 1.0 stylesheets, time ratio xslt3 ÷ 1.0 package (log scale)",
  );
  page = fill(page, "xslt-ratio", chart("xslt-ratio", ratioSvg, v1Table(v1)));
  const rewriteSvg = rewriteChart(rewrites[main], main);
  page = fill(
    page,
    "xslt-rewrite",
    chart("xslt-rewrite", rewriteSvg, rewriteTable(rewrites)),
  );
  const only30Svg = only31Chart(only30, {
    phase: "transform",
    title: "XSLT 3.0-only scenarios, xslt3 median time (log scale)",
    lead: "Median time of the XSLT 3.0 scenarios that XSLT 1.0 cannot express directly",
  });
  page = fill(
    page,
    "xslt-only30",
    chart("xslt-only30", only30Svg, only30Table(only30)),
  );
  page = fill(page, "xslt-compile", compileTable(data));
  page = fill(page, "xslt-startup", startupTable(data.startup));
  page = fill(page, "xslt-memory", xsltMemoryTable(data));
  writeFileSync(PAGE, page);
  console.log(
    "Wrote docs/benchmarks/{xslt-ratio,xslt-rewrite,xslt-only30}.svg and docs/BENCHMARKS.md",
  );
}
