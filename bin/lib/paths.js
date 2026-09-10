/**
 * XSLT Processor CLI - Path Validation
 *
 * Every file the CLI reads or writes goes through this module first: the raw
 * command line argument is resolved to an absolute path and validated against
 * the file system before any read or write is attempted, so a malformed or
 * hostile argument fails with a clear message instead of reaching `fs`.
 */

'use strict';

import { statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * Error raised for a command line path that cannot be used.
 */
export class CliPathError extends Error {
  /**
   * @param {string} message - Human readable explanation
   */
  constructor(message) {
    super(message);
    this.name = 'CliPathError';
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
  if (typeof rawPath !== 'string' || rawPath.length === 0) {
    throw new CliPathError(`${label} path is missing`);
  }

  if (rawPath.includes('\0')) {
    throw new CliPathError(`${label} path contains a NUL byte`);
  }

  return resolve(rawPath);
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
 * @returns {string} The absolute path of an existing regular file
 * @throws {CliPathError} When the path is malformed, missing or not a file
 *
 * @example
 * const xmlFile = resolveInputPath('data.xml', 'XML');
 */
export function resolveInputPath(rawPath, label = 'Input') {
  const absolute = toAbsolutePath(rawPath, label);
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
 * @returns {string} The absolute path to write to
 * @throws {CliPathError} When the path is malformed or not writable as a file
 *
 * @example
 * const target = resolveOutputPath('build/result.html');
 */
export function resolveOutputPath(rawPath) {
  const absolute = toAbsolutePath(rawPath, 'Output');
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
