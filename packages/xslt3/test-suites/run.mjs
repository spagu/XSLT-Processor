#!/usr/bin/env node
/**
 * Run a W3C test suite against @tradik/xslt3.
 *
 * Usage:
 *   node packages/xslt3/test-suites/run.mjs qt3 [--parse-only] [options]
 *   node packages/xslt3/test-suites/run.mjs xslt30 [options]
 *
 * Options:
 *   --parse-only        qt3: only parse each expression (see lib/parseStage.mjs)
 *   --filter <glob>     only test sets / cases matching, e.g. "prod-*"
 *   --update-baseline   rewrite baseline-<suite>[-parse].json from this run
 *   --summary <file>    write the Markdown summary there instead of stdout
 *   --results <file>    JSON results (default <tmpdir>/xslt3-suites/results-*.json)
 *   --adapter <module>  engine adapter module (default: the xslt3 parser if present)
 *   --xpath10-compat    qt3: also run the XPath 1.0 compatibility mode tests
 *   --timeout <ms>      time limit per test case (default 30000)
 *   --no-isolate        run the cases in this thread, without time limit
 *
 * Each test case runs in a worker thread under the time limit (see
 * lib/isolation.mjs): a case that times out or crashes the worker fails
 * alone.
 * The suite is fetched first (see fetch.mjs). The exit code is 1 when a test
 * of the baseline no longer passes; newly passing tests are listed.
 */

import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { confinePath } from "../../../scripts/lib/fsSafety.mjs";
import { SUITES, SUITES_ROOT } from "./constants.mjs";
import { fetchSuite } from "./fetch.mjs";
import { loadAdapter } from "./lib/adapter.mjs";
import { createConfig } from "./lib/dependencies.mjs";
import { createIsolatedRunner, DEFAULT_TIMEOUT } from "./lib/isolation.mjs";
import { loadQt3Suite } from "./lib/qt3Catalog.mjs";
import {
  buildBaseline,
  compareWithBaseline,
  renderSummary,
  summarize,
} from "./lib/results.mjs";
import { runSuite } from "./lib/runner.mjs";
import { loadXsltSuite } from "./lib/xsltCatalog.mjs";

const here = dirname(fileURLToPath(import.meta.url));

/** Ids printed per list; the JSON results have them all. */
const LIST_LIMIT = 50;

/**
 * Print a titled list of ids.
 *
 * @param {string} title - Heading
 * @param {string[]} ids - Test ids
 */
function printList(title, ids) {
  if (ids.length === 0) return;
  console.log(`\n${title} (${ids.length}):`);
  for (const id of ids.slice(0, LIST_LIMIT)) console.log(`  ${id}`);
  if (ids.length > LIST_LIMIT) {
    console.log(`  ... and ${ids.length - LIST_LIMIT} more`);
  }
}

/**
 * Run the selected suite and report.
 *
 * @returns {Promise<number>} Process exit code
 */
async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      "parse-only": { type: "boolean", default: false },
      "update-baseline": { type: "boolean", default: false },
      "xpath10-compat": { type: "boolean", default: false },
      filter: { type: "string" },
      summary: { type: "string" },
      results: { type: "string" },
      adapter: { type: "string" },
      timeout: { type: "string", default: String(DEFAULT_TIMEOUT) },
      isolate: { type: "boolean", default: true },
    },
    allowNegative: true,
  });
  const kind = positionals[0];
  if (kind !== "qt3" && kind !== "xslt30") {
    console.error(
      "Usage: run.mjs qt3|xslt30 [--parse-only] [--filter glob] ...",
    );
    return 2;
  }
  if (values["update-baseline"] && values.filter) {
    console.error("--update-baseline cannot be combined with --filter");
    return 2;
  }
  const parseOnly = kind === "qt3" && values["parse-only"];
  const mode = parseOnly ? `${kind}-parse` : kind;
  const spec = SUITES[kind];

  const dir = await fetchSuite(kind);
  const suite = kind === "qt3" ? loadQt3Suite(dir) : loadXsltSuite(dir);
  const adapter = await loadAdapter(values.adapter);
  const config = createConfig(kind, {
    xpath10Compatibility: values["xpath10-compat"],
  });
  const isolated = values.isolate
    ? createIsolatedRunner({
        kind,
        parseOnly,
        adapterPath: values.adapter,
        timeout: Number(values.timeout),
      })
    : null;
  let results;
  try {
    results = runSuite(suite, {
      kind,
      adapter,
      config,
      parseOnly,
      filter: values.filter,
      runCase: isolated && ((testCase) => isolated.run(testCase)),
    });
  } finally {
    await isolated?.close();
  }

  const baselinePath = join(here, `baseline-${mode}.json`);
  const baseline = existsSync(baselinePath)
    ? JSON.parse(await readFile(baselinePath, "utf8"))
    : { passing: [] };
  const comparison = compareWithBaseline(
    results,
    baseline.passing,
    Boolean(values.filter),
  );
  const source = `${spec.repo}@${spec.commit.slice(0, 12)}`;
  const meta = {
    suite: spec.repo,
    commit: spec.commit,
    mode,
    adapter: adapter.name ?? "custom",
  };

  const resultsPath = confinePath(
    values.results ?? join(SUITES_ROOT, `results-${mode}.json`),
  );
  const bySet = summarize(results, "testSet");
  await writeFile(
    resultsPath,
    `${JSON.stringify({ ...meta, bySet, comparison, results }, null, 2)}\n`,
  );

  const title = parseOnly
    ? "qt3tests, parse only"
    : kind === "qt3"
      ? "qt3tests"
      : "xslt30-test";
  const markdown = renderSummary({
    title,
    source,
    adapter: meta.adapter,
    results,
  });
  if (values.summary) await writeFile(confinePath(values.summary), markdown);
  else console.log(markdown);
  console.log(`Results written to ${resultsPath}`);

  if (values["update-baseline"]) {
    const next = buildBaseline(results, meta);
    await writeFile(baselinePath, `${JSON.stringify(next, null, 2)}\n`);
    console.log(`Baseline written to ${baselinePath} (${next.count} passing)`);
    return 0;
  }
  printList(
    "Newly passing, record them with --update-baseline",
    comparison.fixed,
  );
  printList(
    "No longer applicable (dependencies not met), refresh with --update-baseline",
    comparison.inapplicable,
  );
  printList(
    "REGRESSIONS (passed in the baseline, not now)",
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
