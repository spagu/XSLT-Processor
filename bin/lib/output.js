/**
 * XSLT Processor CLI - Result Output
 *
 * Writes the serialized result byte for byte: `-o file` and redirected stdout
 * receive exactly what the stylesheet produced. Only an interactive terminal
 * gets a trailing newline appended, so the shell prompt starts on its own line.
 */

"use strict";

import { writeFile } from "node:fs/promises";

/**
 * Compute the text written to stdout.
 *
 * @param {string} output - Serialized transformation result
 * @param {boolean} isTty - Whether stdout is an interactive terminal
 * @returns {string} The output, with a newline appended only for a terminal
 *   when it does not already end with one
 *
 * @example
 * forStdout('<a/>', false); // '<a/>'
 * forStdout('<a/>', true);  // '<a/>\n'
 */
export function forStdout(output, isTty) {
  return isTty && !output.endsWith("\n") ? `${output}\n` : output;
}

/**
 * Write the transformation result to a file or to stdout.
 *
 * @param {string} output - Serialized transformation result
 * @param {string|undefined} target - Validated absolute output path, if any
 * @param {object} [streams] - Output streams (for tests)
 * @param {NodeJS.WriteStream} [streams.stdout] - Result stream
 * @param {NodeJS.WriteStream} [streams.stderr] - Status message stream
 * @returns {Promise<void>} Resolves once the result has been written
 */
export async function writeResult(
  output,
  target,
  { stdout = process.stdout, stderr = process.stderr } = {},
) {
  if (target) {
    await writeFile(target, output, "utf-8");
    stderr.write(`Output written to ${target}\n`);
    return;
  }
  stdout.write(forStdout(output, Boolean(stdout.isTTY)));
}
