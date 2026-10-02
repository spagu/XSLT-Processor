/**
 * File access of the engines: reads the pair's files and the files a
 * stylesheet includes or loads, confined to the scanned directory.
 *
 * @module xslt-migrate-check/compat/engines/files
 */

import { readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { URL, fileURLToPath } from "node:url";

/**
 * Resolve a reference to a file inside the project.
 *
 * @param {string} rootDir - The scanned directory
 * @param {string} href - The reference
 * @param {string} baseUri - The file URL it is relative to
 * @returns {string} The file path
 * @throws {Error} For a non-file URL or a path outside the project
 */
export function confinedPath(rootDir, href, baseUri) {
  const url = new URL(href, baseUri);
  if (url.protocol !== "file:") {
    throw new Error(`refusing ${href}: not a local file`);
  }
  const path = fileURLToPath(url);
  const root = resolve(rootDir);
  if (path !== root && !path.startsWith(root + sep)) {
    throw new Error(`refusing ${href}: outside ${root}`);
  }
  return path;
}

/**
 * Read a referenced file as text.
 *
 * @param {string} rootDir - The scanned directory
 * @param {string} href - The reference
 * @param {string} baseUri - The file URL it is relative to
 * @returns {string} The text
 */
export function readConfined(rootDir, href, baseUri) {
  // Confined to the directory the user asked to test. NOSONAR
  return readFileSync(confinedPath(rootDir, href, baseUri), "utf8"); // NOSONAR
}
