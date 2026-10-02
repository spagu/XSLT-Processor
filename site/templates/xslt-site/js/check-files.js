/**
 * From what the visitor dropped to the `{ path, text }` list the analysis
 * reads: zip archives are opened, the common top folder is taken off the
 * paths, directories the command line never scans (node_modules, dist…) and
 * file types the checker does not read are left out, the size and file caps
 * are enforced, and binary files (a NUL byte in the first 8 KB) are skipped.
 * No DOM access, so the site tests run it in Node.js.
 *
 * @module check-files
 */

import { listZipEntries, readEntry } from "./check-unzip.js";

/** Caps of one check: bytes read in all, files read, bytes sniffed for NUL. */
export const LIMITS = Object.freeze({
  maxBytes: 50 * 1024 * 1024,
  maxFiles: 5000,
  sniffBytes: 8192,
});

const textDecoder = new globalThis.TextDecoder();

/**
 * @typedef {object} Source
 * @property {string} path - Path as dropped, `/` separators
 * @property {number} size - Size in bytes
 * @property {() => Promise<Uint8Array>} read - Reads the bytes
 */

/**
 * @typedef {object} Collected
 * @property {Array<{path: string, text: string}>} files - What to analyse
 * @property {Array<{path: string, reason: string}>} skipped - Files that
 *   could not be read, with the reason
 * @property {number} notRead - Files left out by type or directory
 * @property {string} folder - The common top folder taken off ("" if none)
 */

/**
 * Tell whether a path is a zip archive.
 *
 * @param {string} path - File path
 * @returns {boolean} True for *.zip
 */
export const isZip = (path) => /\.zip$/i.test(path);

/**
 * The text of a file, or null for a binary one (a NUL byte in its head).
 *
 * @param {Uint8Array} bytes - File contents
 * @param {number} [sniffBytes] - Bytes searched for NUL
 * @returns {string|null} UTF-8 text without a byte order mark, or null
 */
export function decodeText(bytes, sniffBytes = LIMITS.sniffBytes) {
  if (bytes.subarray(0, sniffBytes).includes(0)) return null;
  return textDecoder.decode(bytes);
}

/**
 * The folder every path starts with, when they all share one.
 *
 * @param {string[]} paths - Paths with `/` separators
 * @returns {string} The folder name, or "" when there is none
 */
export function commonFolder(paths) {
  const first = paths[0]?.split("/")[0] ?? "";
  const shared =
    paths.length > 0 && paths.every((path) => path.startsWith(`${first}/`));
  return shared ? first : "";
}

/**
 * Open the zip archives among the sources: each file entry becomes a source.
 *
 * @param {Source[]} sources - What was dropped
 * @param {{ limits: typeof LIMITS, skipped: Array<object> }} state - Caps
 *   and the skipped list, which receives unreadable archives
 * @returns {Promise<{ sources: Source[], bytes: number }>} Plain sources and
 *   the bytes of the archives read
 * @throws {Error} When the archives alone exceed the size cap
 */
async function expandZips(sources, { limits, skipped }) {
  const bytes = sources
    .filter((source) => isZip(source.path))
    .reduce((sum, source) => sum + source.size, 0);
  if (bytes > limits.maxBytes) throw new Error(tooLarge(limits));
  const opened = await Promise.all(
    sources.map((source) =>
      isZip(source.path) ? openZip(source) : { sources: [source] },
    ),
  );
  for (const { failure } of opened) {
    if (failure) skipped.push(failure);
  }
  return { sources: opened.flatMap((zip) => zip.sources), bytes };
}

/**
 * The file entries of one zip archive, as sources.
 *
 * @param {Source} source - The archive
 * @returns {Promise<{sources: Source[], failure?: object}>} Its files, or
 *   none and why it could not be read
 */
async function openZip(source) {
  try {
    const archive = await source.read();
    const files = listZipEntries(archive).filter((entry) => !entry.directory);
    return {
      sources: files.map((entry) => ({
        path: entry.name,
        size: entry.size,
        read: () => readEntry(archive, entry),
      })),
    };
  } catch (error) {
    const failure = { path: source.path, reason: error.message };
    return { sources: [], failure };
  }
}

/**
 * Read one kept file.
 *
 * @param {Source} source - The file
 * @param {number} sniffBytes - Bytes searched for NUL
 * @returns {Promise<{file?: {path: string, text: string}, failure?: object}>}
 *   The text, or why it was skipped
 */
async function readSource(source, sniffBytes) {
  try {
    const text = decodeText(await source.read(), sniffBytes);
    return text === null
      ? { failure: { path: source.path, reason: "binary" } }
      : { file: { path: source.path, text } };
  } catch (error) {
    return { failure: { path: source.path, reason: error.message } };
  }
}

/**
 * The message for files over the size cap.
 *
 * @param {typeof LIMITS} limits - The caps
 * @returns {string} The message
 */
function tooLarge(limits) {
  const megabytes = Math.round(limits.maxBytes / 1024 / 1024);
  return `The files are larger than ${megabytes} MB together. Check a part of the project, or run npx xslt-migrate-check . on your machine, which has no limit.`;
}

/**
 * Collect the files to analyse.
 *
 * @param {Source[]} dropped - Files and zip archives the visitor gave
 * @param {object} options - What to keep
 * @param {(path: string) => boolean} options.isAnalysed - The checker reads
 *   this file (root-relative path)
 * @param {(name: string) => boolean} options.isIgnoredDir - The command
 *   line never scans a directory of this name
 * @param {typeof LIMITS} [options.limits] - Caps
 * @returns {Promise<Collected>} The files and what was left out
 * @throws {Error} With a message for the visitor when a cap is exceeded
 */
export async function collectFiles(dropped, options) {
  const { isAnalysed, isIgnoredDir, limits = LIMITS } = options;
  const skipped = [];
  const expanded = await expandZips(dropped, { limits, skipped });
  const folder = commonFolder(expanded.sources.map((s) => s.path));
  const cut = folder ? folder.length + 1 : 0;
  const keep = [];
  for (const source of expanded.sources) {
    const path = source.path.slice(cut);
    const dirs = path.split("/").slice(0, -1);
    if (dirs.some(isIgnoredDir) || !isAnalysed(path)) continue;
    keep.push({ ...source, path });
  }
  if (keep.length > limits.maxFiles) {
    throw new Error(
      `More than ${limits.maxFiles.toLocaleString("en")} files to read. Check a part of the project, or run npx xslt-migrate-check . on your machine, which has no limit.`,
    );
  }
  let bytes = expanded.bytes;
  for (const source of keep) bytes += source.size;
  if (bytes > limits.maxBytes) throw new Error(tooLarge(limits));
  const read = await Promise.all(
    keep.map((source) => readSource(source, limits.sniffBytes)),
  );
  const files = [];
  for (const { file, failure } of read) {
    if (file) files.push(file);
    else skipped.push(failure);
  }
  return {
    files,
    skipped,
    notRead: expanded.sources.length - keep.length,
    folder,
  };
}
