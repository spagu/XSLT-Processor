/**
 * XSLT Processor CLI - Path Validation
 *
 * Every file the CLI reads or writes goes through this module first: the raw
 * command line argument is resolved, canonicalized with `realpathSync`, checked
 * to lie inside the trusted base directory and validated against the file
 * system before any read or write is attempted. The base directory is the
 * current working directory, or `XSLT_BASE_DIR` when that variable is set.
 */

"use strict";

import { realpathSync, statSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";

/**
 * Error raised for a command line path that cannot be used.
 */
export class CliPathError extends Error {
  /**
   * @param {string} message - Human readable explanation
   */
  constructor(message) {
    super(message);
    this.name = "CliPathError";
  }
}

/**
 * Resolve a raw path argument to an absolute path.
 *
 * @param {string} rawPath - Raw command line argument
 * @param {string} label - Human readable role of the path, used in errors
 * @returns {string} The absolute path
 * @throws {CliPathError} When the argument is empty or contains a NUL byte
 */
function toAbsolutePath(rawPath, label) {
  if (typeof rawPath !== "string" || rawPath.length === 0) {
    throw new CliPathError(`${label} path is missing`);
  }

  if (rawPath.includes("\0")) {
    throw new CliPathError(`${label} path contains a NUL byte`);
  }

  return resolve(rawPath);
}

/**
 * Canonicalize an existing path, turning a missing entry into a CLI error.
 *
 * @param {string} absolute - Absolute path that should exist
 * @param {string} message - Error message when nothing exists there
 * @returns {string} The canonical path with symbolic links resolved
 * @throws {CliPathError} When the path does not exist
 */
function canonicalize(absolute, message) {
  try {
    return realpathSync(absolute);
  } catch {
    throw new CliPathError(message);
  }
}

/**
 * Ensure a canonical path lies inside the trusted base directory.
 *
 * This is the security boundary of the CLI: whatever the caller typed, the
 * canonical path must be the base directory itself or a descendant of it.
 *
 * @param {string} canonical - Canonical absolute path
 * @param {string} baseDir - Canonical absolute base directory
 * @param {string} label - Human readable role of the path, used in errors
 * @returns {string} The same path, now known to be inside baseDir
 * @throws {CliPathError} When the path escapes the base directory
 */
function assertInsideBase(canonical, baseDir, label) {
  const inside =
    canonical === baseDir ||
    (canonical.startsWith(baseDir) && canonical.startsWith(baseDir + sep));

  if (!inside) {
    throw new CliPathError(
      `${label} path is outside the allowed base directory (${baseDir}): ${canonical}. ` +
        "Run the command from that directory or set XSLT_BASE_DIR.",
    );
  }

  return canonical;
}

/**
 * Resolve the trusted base directory all file arguments are confined to.
 *
 * Uses `XSLT_BASE_DIR` when set, otherwise the current working directory.
 *
 * @returns {string} The canonical absolute path of an existing directory
 * @throws {CliPathError} When the configured directory does not exist or is not a directory
 *
 * @example
 * const baseDir = resolveBaseDir(); // process.cwd() unless XSLT_BASE_DIR is set
 */
export function resolveBaseDir() {
  const configured = process.env.XSLT_BASE_DIR || process.cwd();
  const absolute = toAbsolutePath(configured, "Base directory");
  const canonical = canonicalize(
    absolute,
    `Base directory does not exist: ${absolute}`,
  );

  if (!statSync(canonical).isDirectory()) {
    throw new CliPathError(`Base directory is not a directory: ${canonical}`);
  }

  return canonical;
}

/**
 * Validate a path the CLI is going to read.
 *
 * @param {string} rawPath - Raw command line argument
 * @param {string} label - Human readable role of the path, used in errors
 * @param {string} baseDir - Canonical base directory from resolveBaseDir()
 * @returns {string} The canonical path of an existing regular file inside baseDir
 * @throws {CliPathError} When the path is malformed, missing, outside baseDir or not a file
 *
 * @example
 * const xmlFile = resolveInputPath("data.xml", "XML", resolveBaseDir());
 */
export function resolveInputPath(rawPath, label, baseDir) {
  const absolute = toAbsolutePath(rawPath, label);
  const canonical = assertInsideBase(
    canonicalize(absolute, `File not found: ${absolute}`),
    baseDir,
    label,
  );

  if (!statSync(canonical).isFile()) {
    throw new CliPathError(`${label} path is not a file: ${canonical}`);
  }

  return canonical;
}

/**
 * Validate a path the CLI is going to write.
 *
 * The file itself may be missing, but its parent directory has to exist, lie
 * inside the base directory, and an existing target has to be a regular file.
 *
 * @param {string} rawPath - Raw command line argument
 * @param {string} baseDir - Canonical base directory from resolveBaseDir()
 * @returns {string} The canonical path to write to
 * @throws {CliPathError} When the path is malformed, outside baseDir or not writable as a file
 *
 * @example
 * const target = resolveOutputPath("build/result.html", resolveBaseDir());
 */
export function resolveOutputPath(rawPath, baseDir) {
  const absolute = toAbsolutePath(rawPath, "Output");
  const parent = canonicalize(
    dirname(absolute),
    `Output directory does not exist: ${dirname(absolute)}`,
  );

  if (!statSync(parent).isDirectory()) {
    throw new CliPathError(`Output directory is not a directory: ${parent}`);
  }

  const canonical = assertInsideBase(
    join(parent, basename(absolute)),
    baseDir,
    "Output",
  );
  const targetStats = statSync(canonical, { throwIfNoEntry: false });

  if (targetStats && !targetStats.isFile()) {
    throw new CliPathError(`Output path is not a file: ${canonical}`);
  }

  return canonical;
}
