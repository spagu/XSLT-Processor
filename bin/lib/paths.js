/**
 * XSLT Processor CLI - Path Validation
 *
 * Every file the CLI reads or writes goes through this module first: the raw
 * command line argument is resolved to an absolute path, confined to the base
 * directory (the working directory unless `--base-dir` says otherwise) and
 * validated against the file system before any read or write is attempted, so
 * a malformed or hostile argument fails with a clear message instead of
 * reaching `fs`.
 */

"use strict";

import { statSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";

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
 * Ensure an absolute path lies inside the allowed base directory.
 *
 * This is the actual security boundary of the CLI: whatever the caller typed,
 * the canonical path must be the base directory itself or a descendant of it.
 *
 * @param {string} absolute - Canonical absolute path
 * @param {string} baseDir - Canonical absolute base directory
 * @param {string} label - Human readable role of the path, used in errors
 * @returns {string} The same absolute path, now known to be inside baseDir
 * @throws {CliPathError} When the path escapes the base directory
 */
function assertInsideBase(absolute, baseDir, label) {
  if (absolute !== baseDir && !absolute.startsWith(baseDir + sep)) {
    throw new CliPathError(
      `${label} path is outside the allowed base directory (${baseDir}): ${absolute}. ` +
        "Use --base-dir to allow another directory.",
    );
  }
  return absolute;
}

/**
 * Resolve and validate the base directory all other paths are confined to.
 *
 * @param {string} [rawPath] - Raw `--base-dir` argument; defaults to the working directory
 * @returns {string} The absolute path of an existing directory
 * @throws {CliPathError} When the argument is malformed or not a directory
 *
 * @example
 * const baseDir = resolveBaseDir(); // process.cwd()
 */
export function resolveBaseDir(rawPath = process.cwd()) {
  const absolute = toAbsolutePath(rawPath, "Base directory");
  const stats = statOrNothing(absolute);

  if (!stats || !stats.isDirectory()) {
    throw new CliPathError(`Base directory is not a directory: ${absolute}`);
  }

  return absolute;
}

/**
 * Stat a path without throwing when nothing exists there.
 *
 * @param {string} target - Absolute path to stat
 * @returns {import('node:fs').Stats|undefined} The stats, or undefined
 */
function statOrNothing(target) {
  return statSync(target, { throwIfNoEntry: false });
}

/**
 * Validate a path the CLI is going to read.
 *
 * @param {string} rawPath - Raw command line argument
 * @param {string} [label] - Human readable role of the path, used in errors
 * @param {string} [baseDir] - Directory the path must live in (see resolveBaseDir)
 * @returns {string} The absolute path of an existing regular file
 * @throws {CliPathError} When the path is malformed, missing or not a file
 *
 * @example
 * const xmlFile = resolveInputPath('data.xml', 'XML');
 */
export function resolveInputPath(
  rawPath,
  label = "Input",
  baseDir = process.cwd(),
) {
  const absolute = assertInsideBase(
    toAbsolutePath(rawPath, label),
    baseDir,
    label,
  );
  const stats = statOrNothing(absolute);

  if (!stats) {
    throw new CliPathError(`File not found: ${absolute}`);
  }

  if (!stats.isFile()) {
    throw new CliPathError(`${label} path is not a file: ${absolute}`);
  }

  return absolute;
}

/**
 * Validate a path the CLI is going to write.
 *
 * The file itself may be missing, but its parent directory has to exist and an
 * existing target has to be a regular file.
 *
 * @param {string} rawPath - Raw command line argument
 * @param {string} [baseDir] - Directory the path must live in (see resolveBaseDir)
 * @returns {string} The absolute path to write to
 * @throws {CliPathError} When the path is malformed or not writable as a file
 *
 * @example
 * const target = resolveOutputPath('build/result.html');
 */
export function resolveOutputPath(rawPath, baseDir = process.cwd()) {
  const absolute = assertInsideBase(
    toAbsolutePath(rawPath, "Output"),
    baseDir,
    "Output",
  );
  const parent = dirname(absolute);
  const parentStats = statOrNothing(parent);

  if (!parentStats) {
    throw new CliPathError(`Output directory does not exist: ${parent}`);
  }

  if (!parentStats.isDirectory()) {
    throw new CliPathError(`Output directory is not a directory: ${parent}`);
  }

  const targetStats = statOrNothing(absolute);
  if (targetStats && !targetStats.isFile()) {
    throw new CliPathError(`Output path is not a file: ${absolute}`);
  }

  return absolute;
}
