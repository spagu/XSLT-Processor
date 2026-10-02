/**
 * Command line: parses the options, runs the scan, prints the report (or
 * JSON), writes the HTML report and the fixes when asked, and returns the
 * exit code.
 *
 * @module xslt-migrate-check/cli
 */

import { performance } from "node:perf_hooks";
import { parseArgs } from "node:util";
import { analyze, toJson } from "./analysis/index.js";
import {
  CLI_OPTIONS,
  commandLineError,
  normalizeHtmlOption,
  usageText,
} from "./cliOptions.js";
import { runFix } from "./fix/run.js";
import { createProcessIo, directoryLabel } from "./io.js";
import { readVersion } from "./migration.js";
import { renderHtml } from "./report/html.js";
import { writeHtmlReport } from "./report/htmlFile.js";
import { createStyle, formatReport } from "./report/terminal.js";
import { shouldFail } from "./risk.js";
import { scanDirectory } from "./scan.js";

export { CLI_OPTIONS, normalizeHtmlOption, usageText } from "./cliOptions.js";

/**
 * Write the HTML report and say where it went: on stdout, or on stderr
 * when stdout carries JSON.
 *
 * @param {object} analysis - The analysis
 * @param {string} path - The --html value
 * @param {import("./io.js").CliIo} io - Output writers
 * @param {boolean} json - Whether stdout carries JSON
 * @returns {Promise<boolean>} False when the file could not be written
 */
async function writeHtml(analysis, path, io, json) {
  try {
    const target = await writeHtmlReport(path, renderHtml(analysis));
    (json ? io.writeError : io.write)(`HTML report written to ${target}\n`);
    return true;
  } catch (error) {
    io.writeError(`Error: cannot write the HTML report: ${error.message}\n`);
    return false;
  }
}

/**
 * Run the command.
 *
 * @param {string[]} argv - Arguments after the script name
 * @param {import("./io.js").CliIo} [io] - Output writers (the process's by
 *   default)
 * @returns {Promise<number>} Exit code: 0, 1 (--fail-on) or 2 (bad input)
 */
export async function runCli(argv, io = createProcessIo()) {
  let parsed;
  try {
    parsed = parseArgs({
      args: normalizeHtmlOption(argv),
      options: CLI_OPTIONS,
      allowPositionals: true,
    });
  } catch (error) {
    io.writeError(`Error: ${error.message}\n\n${usageText()}`);
    return 2;
  }
  const { values, positionals } = parsed;
  if (values.help || values.version) {
    io.write(values.help ? usageText() : `${readVersion()}\n`);
    return 0;
  }
  const problem = await commandLineError(parsed);
  if (problem) {
    io.writeError(`Error: ${problem}`);
    return 2;
  }
  const directory = positionals[0] ?? ".";
  const started = performance.now();
  const scan = await scanDirectory(directory, { ignore: values.ignore });
  const analysis = analyze(scan, {
    version: readVersion(),
    directory: directoryLabel(directory),
    durationMs: Math.round(performance.now() - started),
  });
  io.write(
    values.json
      ? `${JSON.stringify(toJson(analysis), null, 2)}\n`
      : formatReport(analysis, { color: io.isTTY }),
  );
  if (
    values.html &&
    !(await writeHtml(analysis, values.html, io, values.json))
  ) {
    return 2;
  }
  if (values.fix) {
    const out = values.json ? { ...io, write: io.writeError } : io;
    const style = createStyle(io.isTTY && !values.json);
    const options = {
      rootDir: directory,
      write: values.write,
      force: values.force,
    };
    const code = await runFix(analysis, options, out, style);
    if (code !== 0) return code;
  }
  return shouldFail(analysis.risk, values["fail-on"].toLowerCase()) ? 1 : 0;
}
