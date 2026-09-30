#!/usr/bin/env node
/**
 * XSLT 1.0 conformance run against the libxslt regression test corpus.
 *
 * Usage: node scripts/conformance.mjs [--update-baseline] [--filter <text>]
 *                                     [--timeout <ms>]
 *
 * The DOM is the one of the command line tool: jsdom, or @xmldom/xmldom with
 * `XSLT_DOM=xmldom` (see bin/lib/dom.js).
 *
 * Every case is transformed with XSLTProcessor#transformToString, compared
 * with libxslt's expected output (see conformance/normalize.mjs for what is
 * normalised) and classified as pass, fail or error. The results are written
 * to tests/conformance/report.json and report.md and compared with the
 * committed baseline tests/conformance/baseline.json (the known failures):
 * the exit code is non-zero only when a case outside the baseline fails.
 * Cases of the baseline that pass now are listed so the baseline can be
 * tightened with --update-baseline.
 */

import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { CORPUS, corpusDir, fetchCorpus } from "./fetch-conformance.mjs";
import { CaseRunner } from "./conformance/caseRunner.mjs";
import { discoverCases } from "./conformance/cases.mjs";
import {
  buildBaseline,
  classify,
  compareWithBaseline,
} from "./conformance/classify.mjs";
import { passRate, renderMarkdown, summarize } from "./conformance/report.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const outputDir = join(scriptDir, "..", "tests", "conformance");
const baselinePath = join(outputDir, "baseline.json");
const exclusionsPath = join(outputDir, "exclusions.json");
const corpusLabel = `${CORPUS.name} ${CORPUS.version}`;

/**
 * Read the committed list of known failures.
 *
 * @returns {Promise<string[]>} Case ids, empty when there is no baseline yet
 */
async function readKnownFailures() {
  if (!existsSync(baselinePath)) return [];
  return JSON.parse(await readFile(baselinePath, "utf8")).knownFailures ?? [];
}

/**
 * Read the cases excluded from the pass rate and the reason of each: the
 * common ones, and those of the DOM implementation named by `XSLT_DOM`
 * (`casesByDom`, limits of that DOM's XML parser).
 *
 * @returns {Promise<Map<string, string>>} Case id to reason
 */
async function readExclusions() {
  if (!existsSync(exclusionsPath)) return new Map();
  const { cases, casesByDom } = JSON.parse(
    await readFile(exclusionsPath, "utf8"),
  );
  const domCases = casesByDom?.[process.env.XSLT_DOM] ?? {};
  return new Map(Object.entries({ ...cases, ...domCases }));
}

/**
 * Print a titled list of case ids.
 *
 * @param {string} title - Heading
 * @param {string[]} ids - Case ids
 */
function printList(title, ids) {
  if (ids.length === 0) return;
  console.log(`\n${title} (${ids.length}):`);
  for (const id of ids) console.log(`  ${id}`);
}

/**
 * Run the suite and report.
 *
 * @returns {Promise<number>} Process exit code
 */
async function main() {
  const { values } = parseArgs({
    options: {
      "update-baseline": { type: "boolean", default: false },
      filter: { type: "string" },
      timeout: { type: "string", default: "10000" },
    },
  });

  await fetchCorpus();
  const testsDir = join(corpusDir, "tests");
  const cases = discoverCases(testsDir).filter(
    (testCase) => !values.filter || testCase.id.includes(values.filter),
  );

  const exclusions = await readExclusions();
  const runner = new CaseRunner(Number(values.timeout));
  const results = [];
  try {
    for (const testCase of cases) {
      const outcome = await runner.run(testCase, testsDir);
      results.push(classify(testCase, outcome, exclusions));
    }
  } finally {
    await runner.close();
  }

  const summary = summarize(results);
  const knownFailures = await readKnownFailures();
  const comparison = compareWithBaseline(results, knownFailures);
  const report = { corpus: corpusLabel, summary, results, comparison };

  await writeFile(
    join(outputDir, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  await writeFile(join(outputDir, "report.md"), renderMarkdown(report));

  for (const row of summary) {
    console.log(
      `${row.category.padEnd(12)} ${String(row.pass).padStart(4)}/` +
        `${String(row.total - row.skip).padEnd(4)} ${passRate(row)}`,
    );
  }

  if (values["update-baseline"]) {
    if (values.filter) {
      console.error("--update-baseline cannot be combined with --filter");
      return 2;
    }
    await writeFile(
      baselinePath,
      `${JSON.stringify(buildBaseline(results, corpusLabel), null, 2)}\n`,
    );
    console.log(`\nBaseline written to ${baselinePath}`);
    return 0;
  }

  printList(
    "Newly passing, tighten the baseline with --update-baseline",
    comparison.fixed,
  );
  if (!values.filter) {
    printList("Baseline entries not in the corpus", comparison.stale);
  }
  printList(
    "REGRESSIONS (failing cases not in the baseline)",
    comparison.regressions,
  );
  return comparison.regressions.length > 0 ? 1 : 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    console.error(error);
    process.exitCode = 1;
  },
);
