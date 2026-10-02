/**
 * Project scan on disk: walks a directory, reads the files the analysis
 * needs and hands their texts to the pure analysis (../analyze.js). Include
 * targets are checked on disk, so a target in an ignored directory still
 * counts as found.
 *
 * @module xslt-migrate-check/scan
 */

import { statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { buildScan, isAnalysed } from "./analyze.js";
import { walkFiles } from "./walker.js";

/**
 * Tell whether a path is a regular file.
 *
 * @param {string} path - File path
 * @returns {boolean} True when it exists and is a file
 */
export function isFile(path) {
  try {
    // The path is inside the directory the user asked to scan (the tool's
    // input by design); it is only checked, never read. NOSONAR
    return statSync(path).isFile(); // NOSONAR
  } catch {
    return false;
  }
}

/**
 * Read a walked file when the analysis needs it.
 *
 * @param {import("./walker.js").WalkedFile} walked - A walked file
 * @returns {Promise<import("./analyze.js").ProjectFile>} Its path and text
 *   (null for a file the analysis does not read)
 */
export async function readWalked({ path, relativePath }) {
  if (!isAnalysed(relativePath)) return { path: relativePath, text: null };
  // Files below the directory the user asked to scan. NOSONAR
  return { path: relativePath, text: await readFile(path, "utf8") }; // NOSONAR
}

/**
 * List and read the files of a project.
 *
 * @param {string} rootDir - Directory to scan
 * @param {object} [options] - Scan options
 * @param {string[]} [options.ignore] - Extra directory patterns to skip
 * @returns {Promise<import("./analyze.js").ProjectFile[]>} The files
 */
export async function readProject(rootDir, { ignore = [] } = {}) {
  const walked = [];
  for await (const file of walkFiles(rootDir, { ignore })) walked.push(file);
  return Promise.all(walked.map(readWalked));
}

/**
 * Scan a project directory for XSLT that depends on the browser.
 *
 * @param {string} rootDir - Directory to scan
 * @param {object} [options] - Scan options
 * @param {string[]} [options.ignore] - Extra directory patterns to skip
 * @returns {Promise<import("./analysis/inspect.js").ScanResult>} Everything
 *   found
 */
export async function scanDirectory(rootDir, options = {}) {
  const files = await readProject(rootDir, options);
  return buildScan(files, {
    exists: (target) => isFile(join(rootDir, target)),
  });
}
