/**
 * xslt-migrate-test: finds the XML + XSLT pairs, runs them on the reference
 * engine and on @tradik/xslt-processor, compares, reports, and returns the
 * exit code.
 *
 * @module xslt-migrate-check/compat/cli
 */

import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { normalizeHtmlOption } from "../cliOptions.js";
import { createProcessIo } from "../io.js";
import { readVersion } from "../migration.js";
import { writeHtmlReport } from "../report/htmlFile.js";
import { readProject } from "../scan.js";
import { chooseReference } from "./engines/select.js";
import { NPX_COMMAND, loadTradik } from "./engines/tradik.js";
import { DEFAULT_TEST_HTML_FILE, renderTestHtml } from "./html.js";
import {
  TEST_OPTIONS,
  referenceMode,
  testCommandLineError,
  testUsageText,
} from "./options.js";
import { discoverPairs, parsePairsJson, parseParams } from "./pairs.js";
import { formatTestReport, summarizeResults, toTestJson } from "./report.js";
import { runPairs } from "./run.js";

/** Printed when the optional peers are missing. */
export const MISSING_PEERS = `xslt-migrate-test needs @tradik/xslt-processor and jsdom. Run it with:\n\n  ${NPX_COMMAND}\n`;

/**
 * The pairs to run: one from --xml/--xsl, a --pairs list, or those found
 * in the project; --param values go to every pair (a list's own params win).
 *
 * @param {object} values - parseArgs values
 * @param {string} rootDir - The scanned directory
 * @returns {Promise<import("./pairs.js").Pair[]>} The pairs
 * @throws {Error} For a bad --pairs file or --param
 */
async function selectPairs(values, rootDir) {
  const params = parseParams(values.param);
  let pairs;
  if (values.xml !== undefined) {
    pairs = [{ xml: values.xml, xsl: values.xsl, params: {}, skip: null }];
  } else if (values.pairs === undefined) {
    pairs = discoverPairs(
      await readProject(rootDir, { ignore: values.ignore }),
    );
  } else {
    // The list is the user's own argument. NOSONAR
    const text = await readFile(values.pairs, "utf8"); // NOSONAR
    try {
      pairs = parsePairsJson(text);
    } catch (error) {
      throw new Error(`${values.pairs}: ${error.message}`, { cause: error });
    }
  }
  return pairs.map((pair) => ({
    ...pair,
    params: { ...params, ...pair.params },
  }));
}

/**
 * Write the HTML report and say where it went.
 *
 * @param {object} values - parseArgs values
 * @param {import("./report.js").TestResult[]} results - The results
 * @param {string} reference - Reference engine name
 * @param {import("../io.js").CliIo} io - Output writers
 * @returns {Promise<void>} Resolves when written
 */
async function writeHtml(values, results, reference, io) {
  const html = renderTestHtml(results, { version: readVersion(), reference });
  const target = await writeHtmlReport(values.html, html);
  (values.json ? io.writeError : io.write)(
    `HTML report written to ${target}\n`,
  );
}

/**
 * Run the command.
 *
 * @param {string[]} argv - Arguments after the script name
 * @param {import("../io.js").CliIo} [io] - Output writers
 * @param {object} [deps] - Engine loaders, replaced in tests
 * @returns {Promise<number>} Exit code: 0, 1 (--fail-under) or 2
 */
export async function runTestCli(argv, io = createProcessIo(), deps = {}) {
  const { loadEngine = loadTradik, reference: choose = chooseReference } = deps;
  let parsed;
  try {
    parsed = parseArgs({
      args: normalizeHtmlOption(argv, DEFAULT_TEST_HTML_FILE),
      options: TEST_OPTIONS,
      allowPositionals: true,
    });
  } catch (error) {
    io.writeError(`Error: ${error.message}\n\n${testUsageText()}`);
    return 2;
  }
  const { values, positionals } = parsed;
  if (values.help || values.version) {
    io.write(values.help ? testUsageText() : `${readVersion()}\n`);
    return 0;
  }
  const problem = await testCommandLineError(parsed);
  if (problem) {
    io.writeError(`Error: ${problem}`);
    return 2;
  }
  const rootDir = positionals[0] ?? ".";
  const tradik = await loadEngine(rootDir);
  if (!tradik) {
    io.writeError(MISSING_PEERS);
    return 2;
  }
  let pairs;
  let reference;
  try {
    pairs = await selectPairs(values, rootDir);
    reference = await choose(referenceMode(values), rootDir);
  } catch (error) {
    io.writeError(`Error: ${error.message}\n`);
    return 2;
  }
  const results = await runPairs(pairs, { reference, tradik, rootDir });
  await reference.close();
  for (const note of reference.notes) io.writeError(`Note: ${note}\n`);
  const meta = { version: readVersion(), reference: reference.name };
  io.write(
    values.json
      ? `${JSON.stringify(toTestJson(results, meta), null, 2)}\n`
      : formatTestReport(results, {
          reference: reference.name,
          diff: values.diff,
        }),
  );
  try {
    if (values.html) await writeHtml(values, results, reference.name, io);
  } catch (error) {
    io.writeError(`Error: cannot write the HTML report: ${error.message}\n`);
    return 2;
  }
  const { compatibility } = summarizeResults(results);
  const failUnder = values["fail-under"];
  return failUnder !== undefined && (compatibility ?? 0) < Number(failUnder)
    ? 1
    : 0;
}
