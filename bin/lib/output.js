/**
 * XSLT Processor CLI - Result Output
 *
 * Writes the serialized result byte for byte: `-o file` and redirected stdout
 * receive exactly what the stylesheet produced, encoded in the `xsl:output`
 * encoding (UTF-8 by default; UTF-16 with a byte order mark; ISO-8859-1,
 * US-ASCII, windows-125x and the other single-byte encodings byte per
 * character). Encodings without an encoder (Shift_JIS, EUC-KR, ...) are
 * written as UTF-8 with a warning. Only an interactive terminal gets a
 * trailing newline appended, so the shell prompt starts on its own line.
 */

"use strict";

import { writeFile } from "node:fs/promises";
import {
  encodeOutput,
  getOutputEncoding,
} from "../../src/xslt/serializer/encoding.js";

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
 * @param {object} [options] - Encoding and output streams
 * @param {string} [options.encoding] - The `xsl:output` encoding, UTF-8 by default
 * @param {NodeJS.WriteStream} [options.stdout] - Result stream
 * @param {NodeJS.WriteStream} [options.stderr] - Status message stream
 * @returns {Promise<void>} Resolves once the result has been written
 */
export async function writeResult(
  output,
  target,
  { encoding = "UTF-8", stdout = process.stdout, stderr = process.stderr } = {},
) {
  if (!getOutputEncoding(encoding).isExact) {
    stderr.write(
      `Warning: cannot write the ${encoding} encoding, writing UTF-8 instead\n`,
    );
  }
  if (target) {
    await writeFile(target, encodeOutput(output, encoding));
    stderr.write(`Output written to ${target}\n`);
    return;
  }
  stdout.write(
    encodeOutput(forStdout(output, Boolean(stdout.isTTY)), encoding),
  );
}
