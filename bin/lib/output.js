/**
 * XSLT Processor CLI - Result Output
 *
 * Writes the serialized result byte for byte, chunk by chunk as it is
 * serialized (waiting for stdout to drain when its buffer is full): `-o file`
 * and redirected stdout receive exactly what the stylesheet produced, encoded
 * in the `xsl:output` encoding (UTF-8 by default; UTF-16 with a byte order mark; ISO-8859-1,
 * US-ASCII, windows-125x and the other single-byte encodings byte per
 * character). Encodings without an encoder (Shift_JIS, EUC-KR, ...) are
 * written as UTF-8 with a warning. Only an interactive terminal gets a
 * trailing newline appended, so the shell prompt starts on its own line.
 */

"use strict";

import { open } from "node:fs/promises";
import {
  createOutputEncoder,
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
 * Write bytes to a stream, waiting for `drain` when its buffer is full
 * (backpressure), so a large result is never queued whole in memory.
 *
 * @param {NodeJS.WritableStream} stream - Destination
 * @param {Uint8Array} bytes - Bytes to write
 * @returns {Promise<void>|undefined} Pending until the stream drains, if it must
 */
function writeBytes(stream, bytes) {
  if (stream.write(bytes) === false) {
    return new Promise((resolve) => stream.once("drain", resolve));
  }
  return undefined;
}

/**
 * Encode chunks of serialized output and hand the bytes to a sink. At least
 * one (possibly empty) chunk is encoded, so an empty UTF-16 result still
 * gets its byte order mark.
 *
 * @param {Iterable<string>} chunks - Serialized output
 * @param {(text: string) => Uint8Array} encode - Output encoder
 * @param {(bytes: Uint8Array) => (Promise<unknown>|unknown)} sink - Writer
 * @returns {Promise<string>} The last chunk ("" when none)
 */
async function pump(chunks, encode, sink) {
  let last = null;
  for (const chunk of chunks) {
    await sink(encode(chunk));
    last = chunk;
  }
  if (last === null) {
    last = "";
    await sink(encode(last));
  }
  return last;
}

/**
 * Write the transformation result to a file or to stdout, chunk by chunk.
 *
 * @param {string|Iterable<string>} output - Serialized transformation
 *   result, whole or in chunks (see streamTransformation)
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
  const chunks = typeof output === "string" ? [output] : output;
  const encode = createOutputEncoder(encoding);
  if (target) {
    const file = await open(target, "w");
    try {
      await pump(chunks, encode, (bytes) => file.write(bytes));
    } finally {
      await file.close();
    }
    stderr.write(`Output written to ${target}\n`);
    return;
  }
  const last = await pump(chunks, encode, (bytes) => writeBytes(stdout, bytes));
  if (forStdout(last, Boolean(stdout.isTTY)) !== last) {
    await writeBytes(stdout, encode("\n"));
  }
}
