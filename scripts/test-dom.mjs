#!/usr/bin/env node
/**
 * DOM test matrix: runs the suites that exercise the library end to end
 * (API, regressions, the XSLT and EXSLT suites, the command line tool) and
 * the conformance runner once per DOM implementation.
 *
 * Usage: node scripts/test-dom.mjs [--dom jsdom|xmldom]...
 *
 * `DOM` selects the DOM of the test suites (src/domEnvironment.test.js) and
 * `XSLT_DOM` the one of the command line tool and the conformance runner
 * (bin/lib/dom.js). linkedom is not in the matrix: its XML parser is not
 * namespace aware (see src/domEnvironment.test.js).
 */

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** DOM implementations of the matrix. */
const MATRIX_DOMS = Object.freeze(["jsdom", "xmldom"]);

/** Test files run against every DOM (globs as `node --test` takes them). */
const MATRIX_TESTS = Object.freeze([
  "src/domEnvironment.test.js",
  "src/XSLTProcessor.test.js",
  "src/XSLTProcessor.serialization.test.js",
  "src/async/processor.test.js",
  "src/bridge/*.test.js",
  "src/regressions.test.js",
  "src/xslt/**/*.test.js",
  "src/cli.test.js",
  "src/cliStreaming.test.js",
  "src/cliXsltVersion.test.js",
]);

/**
 * The commands of one DOM of the matrix.
 *
 * @param {string} dom - "jsdom" or "xmldom"
 * @returns {{label: string, args: string[], env: object}[]} Commands to run
 *   with `node`
 */
function matrixCommands(dom) {
  const env = { ...process.env, DOM: dom, XSLT_DOM: dom };
  return [
    { label: `${dom}: test suites`, args: ["--test", ...MATRIX_TESTS], env },
    {
      label: `${dom}: conformance`,
      args: [join("scripts", "conformance.mjs")],
      env,
    },
  ];
}

/**
 * Run the matrix.
 *
 * @param {string[]} doms - DOM implementations to run
 * @returns {number} Process exit code: 0 when every command passed
 */
function main(doms) {
  const failed = [];
  for (const dom of doms) {
    for (const { label, args, env } of matrixCommands(dom)) {
      console.log(`\n=== ${label}`);
      const { status } = spawnSync(process.execPath, args, {
        cwd: ROOT,
        env,
        stdio: "inherit",
      });
      if (status !== 0) failed.push(label);
    }
  }
  console.log(
    failed.length === 0
      ? `\nDOM matrix passed: ${doms.join(", ")}`
      : `\nDOM matrix FAILED: ${failed.join("; ")}`,
  );
  return failed.length === 0 ? 0 : 1;
}

const { values } = parseArgs({
  options: { dom: { type: "string", multiple: true } },
});
const doms = values.dom ?? MATRIX_DOMS;
const unknown = doms.filter((dom) => !MATRIX_DOMS.includes(dom));
if (unknown.length > 0) {
  console.error(`Unknown DOM: ${unknown.join(", ")}`);
  process.exitCode = 2;
} else {
  process.exitCode = main(doms);
}
