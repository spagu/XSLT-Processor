/**
 * The command line of xslt-migrate-check: the options, the usage text and
 * the checks of a parsed command line.
 *
 * @module xslt-migrate-check/cliOptions
 */

import { stat } from "node:fs/promises";
import { PATCH_FILE } from "./fix/summary.js";
import { DEFAULT_HTML_FILE } from "./report/html.js";
import { FAIL_ON_VALUES } from "./risk.js";

/** Options understood by the command, in util.parseArgs form. */
export const CLI_OPTIONS = Object.freeze({
  json: { type: "boolean", default: false },
  html: { type: "string" },
  "fail-on": { type: "string", default: "none" },
  ignore: { type: "string", multiple: true, default: [] },
  fix: { type: "boolean", default: false },
  write: { type: "boolean", default: false },
  force: { type: "boolean", default: false },
  help: { type: "boolean", short: "h", default: false },
  version: { type: "boolean", short: "v", default: false },
});

const HTML_PATH_PATTERN = /\.html?$/i;

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
    "XSLT (Chrome 158, 17 November 2026) and prints the migration report.",
    "",
    "Options:",
    "  --json                 Print a JSON object instead of the report",
    `  --html [file.html]     Also write the HTML report (default ./${DEFAULT_HTML_FILE})`,
    "  --fail-on <level>      Exit 1 at this risk: none (default), low, medium, high",
    "  --ignore <dir>         Skip directories with this name (repeatable, * allowed)",
    `  --fix                  Write the automatic fixes to <dir>/${PATCH_FILE}`,
    "  --fix --write          Apply them in place (needs a clean git working tree)",
    "  --force                With --write: skip the clean working tree check",
    "  -h, --help             Show this help",
    "  -v, --version          Show the version",
    "",
    "Exit codes: 0 ok, 1 risk at or above --fail-on, 2 bad command line or",
    "a --write that cannot run.",
    "",
  ].join("\n");
}

/**
 * Give `--html` its optional value: the next argument when it ends in
 * .html or .htm, otherwise the default file name. `--html=path` is kept.
 *
 * @param {string[]} argv - Arguments after the script name
 * @param {string} [defaultFile] - The file when none is given
 * @returns {string[]} Arguments with every --html carrying a value
 */
export function normalizeHtmlOption(argv, defaultFile = DEFAULT_HTML_FILE) {
  const result = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== "--html") {
      result.push(argv[index]);
    } else if (HTML_PATH_PATTERN.test(argv[index + 1] ?? "")) {
      result.push(`--html=${argv[index + 1]}`);
      index += 1;
    } else {
      result.push(`--html=${defaultFile}`);
    }
  }
  return result;
}

/**
 * Check that the positional argument names an existing directory.
 *
 * @param {string} directory - Path to check
 * @returns {Promise<string|null>} An error message, or null when fine
 */
export async function directoryError(directory) {
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
 * Validate the parsed command line.
 *
 * @param {{values: object, positionals: string[]}} parsed - parseArgs result
 * @returns {Promise<string|null>} An error message, or null when fine
 */
export async function commandLineError({ values, positionals }) {
  if (!FAIL_ON_VALUES.includes(values["fail-on"].toLowerCase())) {
    return `--fail-on must be one of ${FAIL_ON_VALUES.join(", ")}\n\n${usageText()}`;
  }
  if (positionals.length > 1) return `one directory at most\n\n${usageText()}`;
  if (values.html === "") return `--html needs a file name\n\n${usageText()}`;
  if (values.write && !values.fix) {
    return `--write needs --fix\n\n${usageText()}`;
  }
  if (values.force && !values.write) {
    return `--force needs --write\n\n${usageText()}`;
  }
  const problem = await directoryError(positionals[0] ?? ".");
  return problem ? `${problem}\n` : null;
}
