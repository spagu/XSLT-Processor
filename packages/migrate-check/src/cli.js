/**
 * Command line: parses the options, runs the scan and prints the report (or
 * JSON), returning the exit code.
 *
 * @module xslt-migrate-check/cli
 */

import { stat } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { parseArgs } from "node:util";
import { SUGGESTION, readVersion } from "./migration.js";
import { formatReport } from "./report.js";
import { FAIL_ON_VALUES, assessRisk, shouldFail } from "./risk.js";
import { scanDirectory } from "./scan.js";
import { toPosix } from "./walker.js";

/** Options understood by the command, in util.parseArgs form. */
export const CLI_OPTIONS = Object.freeze({
  json: { type: "boolean", default: false },
  "fail-on": { type: "string", default: "none" },
  ignore: { type: "string", multiple: true, default: [] },
  help: { type: "boolean", short: "h", default: false },
  version: { type: "boolean", short: "v", default: false },
});

/**
 * The usage text printed by --help and on a bad command line.
 *
 * @returns {string} Usage text ending with a newline
 */
export function usageText() {
  return [
    "Usage: xslt-migrate-check [dir] [options]",
    "",
    "Scans a project for XSLT that stops working when Chrome removes native",
    "XSLT (Chrome 158, 17 November 2026) and prints the risk and the migration.",
    "",
    "Options:",
    "  --json                 Print a JSON object instead of the report",
    "  --fail-on <level>      Exit 1 at this risk: none (default), medium, high",
    "  --ignore <dir>         Skip directories with this name (repeatable, * allowed)",
    "  -h, --help             Show this help",
    "  -v, --version          Show the version",
    "",
    "Exit codes: 0 ok, 1 risk at or above --fail-on, 2 bad command line.",
    "",
  ].join("\n");
}

/**
 * @typedef {object} CliIo
 * @property {(text: string) => void} write - Standard output
 * @property {(text: string) => void} writeError - Standard error
 * @property {boolean} isTTY - Whether standard output is a terminal
 */

/**
 * Let a closed pipe end the output quietly (`xslt-migrate-check | head`),
 * while any other stream error still surfaces.
 *
 * @param {import("node:events").EventEmitter} stream - A writable stream
 * @returns {void}
 */
export function ignoreBrokenPipe(stream) {
  stream.on("error", (error) => {
    if (error.code !== "EPIPE") throw error;
  });
}

/**
 * The CliIo of the current process.
 *
 * @returns {CliIo} Writers bound to process.stdout and process.stderr
 */
export function createProcessIo() {
  ignoreBrokenPipe(process.stdout);
  return {
    write: (text) => process.stdout.write(text),
    writeError: (text) => process.stderr.write(text),
    isTTY: Boolean(process.stdout.isTTY),
  };
}

/**
 * Show a directory argument the way the report quotes it: forward slashes
 * and a trailing slash ("." becomes "./").
 *
 * @param {string} directory - The argument as typed
 * @returns {string} The label
 */
export function directoryLabel(directory) {
  const label = toPosix(directory);
  return label.endsWith("/") ? label : `${label}/`;
}

/**
 * Check that the positional argument names an existing directory.
 *
 * @param {string} directory - Path to check
 * @returns {Promise<string|null>} An error message, or null when fine
 */
async function directoryError(directory) {
  try {
    // The directory to scan is this tool's input, by design (a local
    // read-only scan); it is not confined to a base directory. NOSONAR
    const info = await stat(directory); // NOSONAR
    return info.isDirectory() ? null : `Not a directory: ${directory}`;
  } catch {
    return `Directory not found: ${directory}`;
  }
}

/**
 * Build the JSON object of --json from the analysis.
 *
 * @param {import("./report.js").Analysis} analysis - The analysis
 * @returns {object} The stable JSON shape
 */
export function toJson(analysis) {
  return {
    version: analysis.version,
    scannedFiles: analysis.scannedFiles,
    durationMs: analysis.durationMs,
    risk: analysis.risk,
    usages: analysis.usages,
    stylesheets: analysis.stylesheets,
    xmlDocuments: analysis.xmlDocuments,
    migrated: analysis.migrated,
    serverSide: analysis.serverSide,
    needsXslt3: analysis.needsXslt3,
    msxml: analysis.msxml,
    suggestion: SUGGESTION,
  };
}

/**
 * Run the command.
 *
 * @param {string[]} argv - Arguments after the script name
 * @param {CliIo} [io] - Output writers (the process's by default)
 * @returns {Promise<number>} Exit code: 0, 1 (--fail-on) or 2 (bad input)
 */
export async function runCli(argv, io = createProcessIo()) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: CLI_OPTIONS,
      allowPositionals: true,
    });
  } catch (error) {
    io.writeError(`Error: ${error.message}\n\n${usageText()}`);
    return 2;
  }
  const { values, positionals } = parsed;
  if (values.help) {
    io.write(usageText());
    return 0;
  }
  if (values.version) {
    io.write(`${readVersion()}\n`);
    return 0;
  }
  const failOn = values["fail-on"].toLowerCase();
  if (!FAIL_ON_VALUES.includes(failOn)) {
    io.writeError(
      `Error: --fail-on must be one of ${FAIL_ON_VALUES.join(", ")}\n\n${usageText()}`,
    );
    return 2;
  }
  if (positionals.length > 1) {
    io.writeError(`Error: one directory at most\n\n${usageText()}`);
    return 2;
  }
  const directory = positionals[0] ?? ".";
  const problem = await directoryError(directory);
  if (problem) {
    io.writeError(`Error: ${problem}\n`);
    return 2;
  }

  const started = performance.now();
  const scan = await scanDirectory(directory, { ignore: values.ignore });
  const analysis = {
    version: readVersion(),
    directory: directoryLabel(directory),
    durationMs: Math.round(performance.now() - started),
    ...scan,
    ...assessRisk(scan),
  };
  io.write(
    values.json
      ? `${JSON.stringify(toJson(analysis), null, 2)}\n`
      : formatReport(analysis, { color: io.isTTY }),
  );
  return shouldFail(analysis.risk, failOn) ? 1 : 0;
}
