/**
 * The analysis without the command line: `analyzeFiles()` takes file texts
 * and returns the analysis object the CLI renders (findings, summary,
 * recommendations, risk). No Node.js built-ins anywhere in its imports, so
 * the website runs the same code in the browser:
 *
 *   import { analyzeFiles } from "xslt-migrate-check/analyze";
 *
 * @module xslt-migrate-check/analyze
 */

import { markIncludes } from "./analysis/includes.js";
import { analyze } from "./analysis/index.js";
import { emptyScan, inspectText } from "./analysis/inspect.js";
import { serverSidePackages } from "./manifest.js";
import { VERSION } from "./version.js";

export { toJson } from "./analysis/index.js";
export { isAnalysed } from "./analysis/inspect.js";

/**
 * @typedef {object} ProjectFile
 * @property {string} path - Path relative to the project, `/` separators
 * @property {string|null} [text] - The text; null or absent for a file that
 *   was listed but not read (it is only counted)
 */

/**
 * Build the scan result of a list of files.
 *
 * @param {ProjectFile[]} files - The project's files
 * @param {object} [options] - Options
 * @param {(path: string) => boolean} [options.exists] - Tells whether an
 *   include target exists; by default, whether it is among `files`
 * @returns {import("./analysis/inspect.js").ScanResult} The scan result
 */
export function buildScan(files, { exists } = {}) {
  const result = emptyScan();
  result.scannedFiles = files.length;
  for (const { path, text } of files) {
    if (typeof text === "string") inspectText(path, text, result);
  }
  const paths = new Set(files.map((file) => file.path));
  markIncludes(result.stylesheets, exists ?? ((path) => paths.has(path)));
  const manifest = files.find((file) => file.path === "package.json");
  result.serverSide = serverSidePackages(manifest?.text);
  return result;
}

/**
 * Analyse a project given as file texts.
 *
 * @param {ProjectFile[]} files - The project's files
 * @param {object} [options] - Options
 * @param {string} [options.directory] - Directory label ("./")
 * @param {number} [options.durationMs] - Scan time to report (0)
 * @param {(path: string) => boolean} [options.exists] - See buildScan
 * @returns {import("./analysis/index.js").Analysis} The analysis
 */
export function analyzeFiles(files, options = {}) {
  const { directory = "./", durationMs = 0, exists } = options;
  return analyze(buildScan(files, { exists }), {
    version: VERSION,
    directory,
    durationMs,
  });
}
