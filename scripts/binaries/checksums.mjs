/**
 * Standalone binaries - checksums
 *
 * Writes checksums.sha256 for the executables in a directory, in the
 * `sha256sum` format ("<hex digest>  <file name>"), so users can verify a
 * download with `sha256sum --check --ignore-missing checksums.sha256`
 * (Linux), `shasum -a 256 --check --ignore-missing checksums.sha256`
 * (macOS) or `Get-FileHash` (Windows).
 */

import { confinePath } from "../lib/fsSafety.mjs";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sha256 } from "./node-dist.mjs";

/** Name of the checksum file. */
export const CHECKSUMS_FILE = "checksums.sha256";

/** Release executables: xslt-<os>-<arch>[.exe]. */
const BINARY_NAME = /^xslt-(linux|darwin|windows)-(x64|arm64)(\.exe)?$/;

/**
 * Format checksum lines, sorted by file name.
 *
 * @param {Array<{name: string, digest: string}>} entries - Files and digests
 * @returns {string} The checksum file content
 *
 * @example
 * formatChecksums([{ name: "xslt-linux-x64", digest: "ab" }]);
 * // 'ab  xslt-linux-x64\n'
 */
export function formatChecksums(entries) {
  return [...entries]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ name, digest }) => `${digest}  ${name}\n`)
    .join("");
}

/**
 * Hash every release executable of a directory into checksums.sha256.
 *
 * @param {string} dir - Directory holding the executables
 * @returns {string} Path of the written checksum file
 * @throws {Error} When the directory holds no executable
 */
export function writeChecksums(outDir) {
  const dir = confinePath(outDir);
  const entries = readdirSync(dir)
    .filter((name) => BINARY_NAME.test(name))
    .map((name) => ({ name, digest: sha256(readFileSync(join(dir, name))) }));
  if (entries.length === 0) {
    throw new Error(`No xslt-<os>-<arch> executables in ${dir}`);
  }
  const file = join(dir, CHECKSUMS_FILE);
  writeFileSync(file, formatChecksums(entries));
  return file;
}
