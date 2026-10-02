/**
 * Directory walker: lists the regular files of a project tree, leaving out
 * dependencies, build output, version control data and symbolic links.
 *
 * @module xslt-migrate-check/walker
 */

import { lstat, readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";

/** Directory names that are never scanned. */
export const DEFAULT_IGNORED_DIRS = Object.freeze([
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  "coverage",
  "vendor",
  ".next",
  ".nuxt",
  ".svelte-kit",
  "target",
]);

/** Files larger than this many bytes are skipped (5 MB). */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

/**
 * Turn a directory-name pattern into a regular expression. `*` matches any
 * run of characters; everything else is literal.
 *
 * @param {string} pattern - Pattern such as `generated-*`
 * @returns {RegExp} Anchored expression for a directory basename
 */
function patternToRegExp(pattern) {
  const escaped = pattern
    .replaceAll(/[.+?^${}()|[\]\\]/g, String.raw`\$&`)
    .replaceAll("*", ".*");
  return new RegExp(`^${escaped}$`);
}

/**
 * Build a predicate that tells whether a directory basename is skipped.
 *
 * @param {string[]} [extra] - Patterns given with `--ignore`
 * @returns {(name: string) => boolean} Predicate on a directory basename
 */
export function createIgnoreMatcher(extra = []) {
  const patterns = [...DEFAULT_IGNORED_DIRS, ...extra].map(patternToRegExp);
  return (name) => patterns.some((expression) => expression.test(name));
}

/**
 * Convert a path to forward slashes, so reports read the same everywhere.
 *
 * @param {string} path - A path in the platform's notation
 * @returns {string} The path with `/` separators
 */
export function toPosix(path) {
  return path.split(sep).join("/");
}

/**
 * @typedef {object} WalkedFile
 * @property {string} path - Absolute or root-relative path as joined
 * @property {string} relativePath - Path relative to the root, with `/`
 * @property {number} size - File size in bytes
 */

/**
 * Walk a directory tree depth first, in sorted order. Directories that cannot
 * be read are skipped, as are symbolic links and files over MAX_FILE_BYTES.
 *
 * @param {string} rootDir - Directory to scan
 * @param {object} [options] - Walk options
 * @param {string[]} [options.ignore] - Extra directory patterns to skip
 * @yields {WalkedFile} Each regular file found
 * @returns {AsyncGenerator<WalkedFile>} The files of the tree
 */
export async function* walkFiles(rootDir, { ignore = [] } = {}) {
  const isIgnored = createIgnoreMatcher(ignore);
  yield* walkDirectory(rootDir, rootDir, isIgnored);
}

/**
 * Recursive step of walkFiles for one directory.
 *
 * @param {string} rootDir - Directory the walk started from
 * @param {string} dir - Directory being listed
 * @param {(name: string) => boolean} isIgnored - Directory filter
 * @yields {WalkedFile} Each regular file below `dir`
 * @returns {AsyncGenerator<WalkedFile>} The files below `dir`
 */
async function* walkDirectory(rootDir, dir, isIgnored) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  // Code point order, the same on every platform
  entries.sort((a, b) => (a.name > b.name) - (a.name < b.name));
  const kept = entries.filter((entry) => !entry.isSymbolicLink());
  // Sizes of the regular files, read together rather than one await per file
  const sizes = await Promise.all(
    kept.map((entry) =>
      entry.isFile() ? lstat(join(dir, entry.name)).then((s) => s.size) : null,
    ),
  );
  for (const [index, entry] of kept.entries()) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (isIgnored(entry.name)) continue;
      yield* walkDirectory(rootDir, path, isIgnored);
      continue;
    }
    const size = sizes[index];
    if (size === null || size > MAX_FILE_BYTES) continue;
    yield { path, relativePath: toPosix(relative(rootDir, path)), size };
  }
}
