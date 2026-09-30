/**
 * Conformance runner - test case discovery.
 *
 * Mirrors the discovery rules of libxslt's `tests/runtest.c`:
 * - every `name.xsl` with a sibling `name.xml` is a case; the expected
 *   result is `name.out` (libxslt writes no `.out` for an empty result);
 * - in `REC/`, every `stand*.xml` is also a standalone case: the stylesheet
 *   is found through its `<?xml-stylesheet?>` processing instruction and the
 *   expected result is `name.stand.out`.
 *
 * libxslt also compares its diagnostics with `.err` files. The message texts
 * are implementation specific and are not compared; the runner only uses
 * them to tell a failing case (no `.out`, the `.err` reports an error) from
 * a case whose result is empty (no `.out`, the `.err` only holds
 * xsl:message output or warnings).
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Directories of the libxslt test tree that exercise plain XSLT 1.0.
 *
 * Left out on purpose: `exslt/`, `extensions/`, `plugins/` and `xinclude/`
 * (extensions outside XSLT 1.0), `docbook/`, `xmlspec/`, `XSLTMark/`,
 * `multiple/` and `fuzz/` (not part of libxslt's own `runtest` either).
 */
export const SUITE_DIRECTORIES = Object.freeze([
  "REC",
  "REC2",
  "general",
  "keys",
  "numbers",
  "namespaces",
  "documents",
  "encoding",
  "reports",
]);

/**
 * @typedef {Object} ConformanceCase
 * @property {string} id - Stable identifier, `dir/name` or `dir/name#stand`
 * @property {string} directory - Suite directory (`REC`, `general`, ...)
 * @property {string} category - Report category (spec chapter for `REC`)
 * @property {string} dir - Absolute directory of the case files
 * @property {string|null} stylesheet - Absolute `.xsl` path, null when
 *   standalone (the stylesheet is referenced by the source document)
 * @property {string} source - Absolute source document path
 * @property {string|null} expected - Absolute expected output path, null
 *   when libxslt produces no result for the case
 * @property {boolean} expectsError - Whether libxslt rejects the case: no
 *   expected output and an `.err` file reporting an error
 */

/** Diagnostics of libxslt that mean the stylesheet or transformation failed. */
const ERROR_DIAGNOSTIC = /error|no result for|no namespace bound/i;

/**
 * Cases whose `.err` reads like an error although libxslt only counts a
 * warning and still transforms (xslt.c, xsltParseStylesheetDecimalFormat:
 * `style->warnings++`). Their expected result is empty, not a rejection.
 */
const WARNING_ONLY_CASES = new Set([
  "general/bug-202",
  "general/bug-203",
  "general/bug-204",
]);

/**
 * Derive the report category of a case.
 *
 * `REC/test-7.1.4-1` belongs to chapter 7 of the XSLT 1.0 Recommendation,
 * every other directory is its own category.
 *
 * @param {string} directory - Suite directory
 * @param {string} name - Case base name
 * @returns {string} Category label
 *
 * @example
 * categoryOf("REC", "test-7.1.4-1"); // "REC §7"
 * categoryOf("general", "bug-1-"); // "general"
 */
export function categoryOf(directory, name) {
  if (directory === "REC") {
    const chapter = /^(?:test|stand)-(\d+)/.exec(name);
    if (chapter) return `REC §${chapter[1]}`;
  }
  return directory;
}

/**
 * Describe the expected result of a case from its `.out` and `.err` files.
 *
 * @param {string} dir - Directory of the case files
 * @param {Set<string>} files - File names present in the directory
 * @param {string} outName - File name of the expected output
 * @param {string} errName - File name of the expected diagnostics
 * @param {string} [id] - Case id, for cases libxslt only warns about
 * @returns {{expected: string|null, expectsError: boolean}} Expectation
 */
function expectation(dir, files, outName, errName, id) {
  if (files.has(outName)) {
    return { expected: join(dir, outName), expectsError: false };
  }
  const diagnostics = files.has(errName)
    ? readFileSync(join(dir, errName), "utf8")
    : "";
  const expectsError =
    !WARNING_ONLY_CASES.has(id) && ERROR_DIAGNOSTIC.test(diagnostics);
  return { expected: null, expectsError };
}

/**
 * List the cases of one suite directory.
 *
 * @param {string} testsDir - Absolute path of the libxslt `tests/` directory
 * @param {string} directory - Suite directory name
 * @returns {ConformanceCase[]} Cases sorted by id
 */
export function discoverDirectory(testsDir, directory) {
  const dir = join(testsDir, directory);
  if (!existsSync(dir)) return [];
  const files = new Set(readdirSync(dir));
  const cases = [];

  for (const file of files) {
    if (!file.endsWith(".xsl")) continue;
    const name = file.slice(0, -4);
    if (!files.has(`${name}.xml`)) continue;
    cases.push({
      id: `${directory}/${name}`,
      directory,
      category: categoryOf(directory, name),
      dir,
      stylesheet: join(dir, file),
      source: join(dir, `${name}.xml`),
      ...expectation(
        dir,
        files,
        `${name}.out`,
        `${name}.err`,
        `${directory}/${name}`,
      ),
    });
  }

  if (directory === "REC") {
    for (const file of files) {
      if (!file.startsWith("stand") || !file.endsWith(".xml")) continue;
      const name = file.slice(0, -4);
      cases.push({
        id: `${directory}/${name}#stand`,
        directory,
        category: categoryOf(directory, name),
        dir,
        stylesheet: null,
        source: join(dir, file),
        ...expectation(dir, files, `${name}.stand.out`, `${name}.stand.err`),
      });
    }
  }

  return cases.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * List every case of the suite.
 *
 * @param {string} testsDir - Absolute path of the libxslt `tests/` directory
 * @param {string[]} [directories] - Suite directories to include
 * @returns {ConformanceCase[]} All cases, grouped by directory
 */
export function discoverCases(testsDir, directories = SUITE_DIRECTORIES) {
  return directories.flatMap((directory) =>
    discoverDirectory(testsDir, directory),
  );
}
