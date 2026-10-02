/**
 * Project scan: walks a directory, runs the detectors on each file by its
 * extension and collects the findings in one result object.
 *
 * @module xslt-migrate-check/scan
 */

import { Buffer } from "node:buffer";
import { open, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import {
  HEAD_BYTES,
  SCRIPT_EXTENSIONS,
  STYLESHEET_EXTENSIONS,
  XML_EXTENSIONS,
  detectStylesheet,
  detectUsages,
  detectXmlStylesheetPi,
  isStylesheetHead,
} from "./detectors.js";
import { walkFiles } from "./walker.js";

/** npm packages that run XSLT on the server or replace the browser's. */
export const SERVER_SIDE_PACKAGES = Object.freeze([
  "@tradik/xslt-processor",
  "xslt-processor",
  "saxon-js",
  "libxslt",
  "xslt3",
  "xsltproc",
]);

/**
 * @typedef {object} ScanResult
 * @property {number} scannedFiles - Files read
 * @property {Array<{file: string, line: number, text: string}>} usages -
 *   Browser-side XSLTProcessor usages and HTML links to XSL
 * @property {Array<object>} stylesheets - XSL stylesheets with their facts
 * @property {Array<object>} xmlDocuments - XML files with an xml-stylesheet PI
 * @property {Array<{file: string, count: number}>} migrated - Files that
 *   already load @tradik/xslt-processor
 * @property {string[]} serverSide - Server-side XSLT packages in package.json
 */

/**
 * Read the first HEAD_BYTES of a file as UTF-8 text.
 *
 * @param {string} path - File path
 * @returns {Promise<string>} The head of the file
 */
export async function readHead(path) {
  const handle = await open(path, "r");
  try {
    const buffer = Buffer.alloc(HEAD_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, HEAD_BYTES, 0);
    return buffer.toString("utf8", 0, bytesRead);
  } finally {
    await handle.close();
  }
}

/**
 * Record the XSLTProcessor usages of a script or template file.
 *
 * @param {string} path - File path
 * @param {string} file - Report path
 * @param {string} extension - Lower-case extension
 * @param {ScanResult} result - Accumulator
 * @returns {Promise<void>} Resolves when recorded
 */
async function inspectScript(path, file, extension, result) {
  const content = await readFile(path, "utf8");
  const { matches, migrated } = detectUsages(content, extension);
  if (matches.length === 0) return;
  if (migrated) {
    result.migrated.push({ file, count: matches.length });
    return;
  }
  for (const match of matches) result.usages.push({ file, ...match });
}

/**
 * Record the facts of an XSL stylesheet.
 *
 * @param {string} path - File path
 * @param {string} file - Report path
 * @param {ScanResult} result - Accumulator
 * @returns {Promise<void>} Resolves when recorded
 */
async function inspectStylesheet(path, file, result) {
  const content = await readFile(path, "utf8");
  result.stylesheets.push({ file, ...detectStylesheet(content) });
}

/**
 * Decide what an XML file is (stylesheet, rendered document, other) and
 * record it.
 *
 * @param {string} path - File path
 * @param {string} file - Report path
 * @param {ScanResult} result - Accumulator
 * @returns {Promise<void>} Resolves when recorded
 */
async function inspectXml(path, file, result) {
  const head = await readHead(path);
  if (isStylesheetHead(head)) {
    await inspectStylesheet(path, file, result);
    return;
  }
  const instruction = detectXmlStylesheetPi(head);
  if (instruction) result.xmlDocuments.push({ file, ...instruction });
}

/**
 * Route one file to the detector for its extension.
 *
 * @param {{path: string, relativePath: string}} walked - A walked file
 * @param {ScanResult} result - Accumulator
 * @returns {Promise<void>} Resolves when the file has been inspected
 */
export async function inspectFile({ path, relativePath }, result) {
  const extension = extname(path).toLowerCase();
  if (SCRIPT_EXTENSIONS.has(extension)) {
    await inspectScript(path, relativePath, extension, result);
  } else if (STYLESHEET_EXTENSIONS.has(extension)) {
    await inspectStylesheet(path, relativePath, result);
  } else if (XML_EXTENSIONS.has(extension)) {
    await inspectXml(path, relativePath, result);
  }
}

/**
 * List the server-side XSLT packages that the root package.json depends on.
 * A missing or unreadable package.json yields an empty list.
 *
 * @param {string} rootDir - Directory holding package.json
 * @returns {Promise<string[]>} Matching package names, in SERVER_SIDE_PACKAGES order
 */
export async function readServerSidePackages(rootDir) {
  let manifest;
  try {
    manifest = JSON.parse(
      await readFile(join(rootDir, "package.json"), "utf8"),
    );
  } catch {
    return [];
  }
  const declared = new Set();
  for (const field of [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
  ]) {
    for (const name of Object.keys(manifest[field] || {})) declared.add(name);
  }
  return SERVER_SIDE_PACKAGES.filter((name) => declared.has(name));
}

/**
 * Scan a project directory for XSLT that depends on the browser.
 *
 * @param {string} rootDir - Directory to scan
 * @param {object} [options] - Scan options
 * @param {string[]} [options.ignore] - Extra directory patterns to skip
 * @returns {Promise<ScanResult>} Everything found
 */
export async function scanDirectory(rootDir, { ignore = [] } = {}) {
  const result = {
    scannedFiles: 0,
    usages: [],
    stylesheets: [],
    xmlDocuments: [],
    migrated: [],
    serverSide: [],
  };
  for await (const walked of walkFiles(rootDir, { ignore })) {
    result.scannedFiles += 1;
    await inspectFile(walked, result);
  }
  result.serverSide = await readServerSidePackages(rootDir);
  return result;
}
