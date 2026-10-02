/**
 * Write the "all versions" overview of docs/BENCHMARKS.md
 * (`<!-- bench:overview-* -->` parts and docs/benchmarks/overview.svg)
 * from the two recorded runs, results.json and results-xslt.json. It is
 * refreshed by `node scripts/benchmark/charts.mjs` for the release and
 * xslt suites, and on its own with `--suite overview`.
 *
 * @module scripts/benchmark/overview
 */

import { readFileSync, writeFileSync } from "node:fs";
import { confinePath } from "../lib/fsSafety.mjs";
import { overviewChart } from "./overviewChart.mjs";
import {
  overviewHero,
  overviewMemoryTable,
  overviewRows,
  overviewTimeTable,
  overviewVersions,
} from "./overviewData.mjs";
import { PAGE, chart, fill } from "./page.mjs";

/**
 * Read a results file.
 *
 * @param {string} path - Path under the repository
 * @returns {object} Parsed JSON
 */
function load(path) {
  return JSON.parse(readFileSync(confinePath(path), "utf8"));
}

/**
 * Refresh the overview parts of the page.
 *
 * @param {string} [releasePath] - results.json
 * @param {string} [xsltPath] - results-xslt.json
 */
export function writeOverview(
  releasePath = "scripts/benchmark/results.json",
  xsltPath = "scripts/benchmark/results-xslt.json",
) {
  const xslt = load(xsltPath);
  const rows = overviewRows(load(releasePath), xslt);
  const versions = overviewVersions(xslt);
  let page = readFileSync(PAGE, "utf8");
  page = fill(page, "overview-hero", overviewHero(rows, versions));
  const svg = overviewChart(rows, versions);
  const times = overviewTimeTable(rows, versions);
  page = fill(page, "overview", chart("overview", svg, times));
  page = fill(page, "overview-memory", overviewMemoryTable(rows, versions));
  writeFileSync(PAGE, page);
  console.log("Wrote docs/benchmarks/overview.svg and docs/BENCHMARKS.md");
}
