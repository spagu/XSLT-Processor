/**
 * File system safety helpers for the repository's build scripts.
 *
 * Paths that come from command line arguments are canonicalized with
 * `realpathSync` and must lie inside the repository or the system temporary
 * directory before any file system call uses them. External tools are run
 * from fixed system directories instead of being looked up in `PATH`.
 *
 * @module scripts/lib/fsSafety
 */

import { existsSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** Canonical path of the repository root. */
export const REPO_ROOT = realpathSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", ".."),
);

/** Canonical system temporary directory. */
export const TMP_ROOT = realpathSync(tmpdir());

/** Prefixes of paths inside the two allowed roots. */
const REPO_PREFIX = REPO_ROOT.endsWith(sep) ? REPO_ROOT : REPO_ROOT + sep;
const TMP_PREFIX = TMP_ROOT.endsWith(sep) ? TMP_ROOT : TMP_ROOT + sep;

/**
 * Canonicalize a path whose tail may not exist yet: the deepest existing
 * ancestor is resolved with `realpathSync` and the missing names are appended.
 *
 * @param {string} absolute - Absolute path
 * @returns {string} The canonical path
 */
function canonicalize(absolute) {
  const missing = [];
  let current = absolute;
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) break;
    missing.unshift(basename(current));
    current = parent;
  }
  return join(realpathSync(current), ...missing);
}

/**
 * Resolve a path from a command line argument and confine it to the
 * repository or the system temporary directory.
 *
 * @param {string} candidate - Path as given (relative to the working directory)
 * @returns {string} The canonical absolute path, inside an allowed root
 * @throws {Error} When the path is outside both roots
 */
export function confinePath(candidate) {
  if (
    typeof candidate !== "string" ||
    candidate.length === 0 ||
    candidate.includes("\0")
  ) {
    throw new Error(`Invalid path: ${JSON.stringify(candidate)}`);
  }
  const canonical = canonicalize(resolve(candidate));
  if (
    canonical === REPO_ROOT ||
    canonical.startsWith(REPO_PREFIX) ||
    canonical === TMP_ROOT ||
    canonical.startsWith(TMP_PREFIX)
  ) {
    return canonical;
  }
  throw new Error(
    `Path ${canonical} is outside the repository and the temporary directory`,
  );
}

/**
 * Absolute path of a system tool from fixed, root-owned directories, so that
 * a writable directory in `PATH` cannot shadow it.
 *
 * @param {string} name - Tool name, e.g. "tar" or "codesign"
 * @param {NodeJS.Platform} [platform] - Platform (for tests)
 * @param {(path: string) => boolean} [exists] - Existence check (for tests)
 * @returns {string} The absolute path of the tool
 * @throws {Error} When the tool is not installed in a system directory
 */
export function systemTool(
  name,
  platform = process.platform,
  exists = existsSync,
) {
  const candidates =
    platform === "win32"
      ? [
          join(
            process.env.SystemRoot ?? "C:\\Windows",
            "System32",
            `${name}.exe`,
          ),
        ]
      : [
          `/usr/bin/${name}`,
          `/bin/${name}`,
          `/usr/sbin/${name}`,
          `/sbin/${name}`,
        ];
  const found = candidates.find((path) => exists(path));
  if (!found) {
    throw new Error(`${name} not found in ${candidates.join(", ")}`);
  }
  return found;
}
