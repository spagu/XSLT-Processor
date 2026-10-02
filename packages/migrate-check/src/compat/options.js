/**
 * The command line of xslt-migrate-test: options, usage text and checks.
 *
 * @module xslt-migrate-check/compat/options
 */

import { directoryError } from "../cliOptions.js";
import { DEFAULT_TEST_HTML_FILE } from "./html.js";
import { REFERENCE_MODES } from "./engines/select.js";

/** Options understood by the command, in util.parseArgs form. */
export const TEST_OPTIONS = Object.freeze({
  json: { type: "boolean", default: false },
  html: { type: "string" },
  "fail-under": { type: "string" },
  diff: { type: "string", default: "first" },
  pairs: { type: "string" },
  xml: { type: "string" },
  xsl: { type: "string" },
  param: { type: "string", multiple: true, default: [] },
  reference: { type: "string", default: "auto" },
  browser: { type: "boolean", default: false },
  ignore: { type: "string", multiple: true, default: [] },
  help: { type: "boolean", short: "h", default: false },
  version: { type: "boolean", short: "v", default: false },
});

/**
 * The usage text printed by --help and on a bad command line.
 *
 * @returns {string} Usage text ending with a newline
 */
export function testUsageText() {
  return [
    "Usage: xslt-migrate-test [dir] [options]",
    "",
    "Runs every XML + XSLT pair of a project on a reference engine (Chromium,",
    "else xsltproc) and on @tradik/xslt-processor, and compares the output.",
    "",
    "Options:",
    '  --pairs <file.json>    Pairs to run: [{"xml": "...", "xsl": "...", "params": {}}]',
    "  --xml <a.xml> --xsl <b.xsl>  Run one pair (paths relative to dir)",
    "  --param <name=value>   Stylesheet parameter (repeatable)",
    "  --reference <engine>   auto (default), browser, xsltproc or none",
    "  --browser              Same as --reference browser",
    "  --diff full            Print the whole diff of each different output",
    "  --json                 Print a JSON object instead of the report",
    `  --html [file.html]     Also write the HTML report (default ./${DEFAULT_TEST_HTML_FILE})`,
    "  --fail-under <pct>     Exit 1 when the compatibility is below pct",
    "  --ignore <dir>         Skip directories with this name (repeatable)",
    "  -h, --help             Show this help",
    "  -v, --version          Show the version",
    "",
    "Exit codes: 0 ok, 1 below --fail-under, 2 bad command line or missing",
    "@tradik/xslt-processor / jsdom.",
    "",
  ].join("\n");
}

/**
 * The reference mode of a command line.
 *
 * @param {object} values - parseArgs values
 * @returns {string} auto, browser, xsltproc or none
 */
export function referenceMode(values) {
  return values.browser ? "browser" : values.reference;
}

/**
 * Validate the parsed command line.
 *
 * @param {{values: object, positionals: string[]}} parsed - parseArgs result
 * @returns {Promise<string|null>} An error message, or null when fine
 */
export async function testCommandLineError({ values, positionals }) {
  const failUnder = values["fail-under"];
  const problems = [
    [positionals.length > 1, "one directory at most"],
    [values.html === "", "--html needs a file name"],
    [!["first", "full"].includes(values.diff), "--diff must be first or full"],
    [
      !REFERENCE_MODES.includes(values.reference),
      `--reference must be one of ${REFERENCE_MODES.join(", ")}`,
    ],
    [
      (values.xml === undefined) !== (values.xsl === undefined),
      "--xml and --xsl go together",
    ],
    [
      values.pairs !== undefined && values.xml !== undefined,
      "--pairs and --xml/--xsl exclude each other",
    ],
    [
      failUnder !== undefined &&
        !(Number(failUnder) >= 0 && Number(failUnder) <= 100),
      "--fail-under needs a number from 0 to 100",
    ],
  ];
  const found = problems.find(([bad]) => bad);
  if (found) return `${found[1]}\n\n${testUsageText()}`;
  const problem = await directoryError(positionals[0] ?? ".");
  return problem ? `${problem}\n` : null;
}
