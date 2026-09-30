/**
 * Asynchronous XML Input
 *
 * Reads the input of the asynchronous API: a DOM node, a string, a WHATWG
 * `ReadableStream` or an async iterable of strings or bytes (a Node.js
 * `Readable`, a `Response.body`, a generator...). XSLT 1.0 gives templates
 * random access to the whole source tree (any axis, `key()`, `id()`), so a
 * stream is read to its end and parsed once: input streaming bounds nothing,
 * it only lets callers pass what they have without collecting it first.
 *
 * @module io/readSource
 */

import { decodeXml } from "./decode.js";
import { parseXml, resolveDomParser } from "../xslt/domParsing.js";
import { throwIfAborted } from "../async/abort.js";

/**
 * @typedef {string|Uint8Array|ArrayBuffer} SourceChunk
 */

/**
 * Whether a value is a WHATWG ReadableStream (or anything with getReader).
 *
 * @param {unknown} value - Candidate
 * @returns {boolean} True for readable streams
 */
function isReadableStream(value) {
  return typeof value?.getReader === "function";
}

/**
 * Iterate a ReadableStream through its reader, which every implementation
 * has (not every browser makes streams async iterable).
 *
 * @param {ReadableStream} stream - The stream
 * @yields {SourceChunk} Its chunks
 * @returns {AsyncGenerator<SourceChunk, void, void>} The chunks
 */
async function* readerChunks(stream) {
  const reader = stream.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Bytes of a binary chunk.
 *
 * @param {Uint8Array|ArrayBuffer} chunk - The chunk
 * @returns {Uint8Array|null} Its bytes, or null for a non-binary value
 */
function toBytes(chunk) {
  if (chunk instanceof Uint8Array) return chunk;
  if (chunk instanceof ArrayBuffer) return new Uint8Array(chunk);
  return null;
}

/**
 * Concatenate byte chunks.
 *
 * @param {Uint8Array[]} chunks - The chunks
 * @returns {Uint8Array} All bytes
 */
function concatBytes(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

/**
 * Read a stream of strings or bytes to its end. Strings are joined; bytes are
 * decoded as a whole (byte order mark, XML declaration encoding, else UTF-8),
 * so a multi-byte character split between chunks is decoded correctly.
 *
 * @param {ReadableStream<SourceChunk>|AsyncIterable<SourceChunk>} stream - Input
 * @param {AbortSignal} [signal] - Cancels the read between chunks
 * @returns {Promise<string>} The text
 * @throws {TypeError} When a chunk is neither a string nor bytes, or strings
 *   and bytes are mixed
 * @throws {*} The abort reason when `signal` is aborted
 *
 * @example
 * await readText(Readable.from(["<a>", "</a>"])); // "<a></a>"
 */
export async function readText(stream, signal) {
  const iterable = isReadableStream(stream) ? readerChunks(stream) : stream;
  const texts = [];
  const binary = [];
  for await (const chunk of iterable) {
    throwIfAborted(signal);
    const bytes = typeof chunk === "string" ? null : toBytes(chunk);
    if (bytes === null && typeof chunk !== "string") {
      throw new TypeError(
        "XML input streams must yield strings, Uint8Arrays or ArrayBuffers",
      );
    }
    if (bytes) binary.push(bytes);
    else texts.push(chunk);
    if (texts.length > 0 && binary.length > 0) {
      throw new TypeError("XML input streams cannot mix strings and bytes");
    }
  }
  throwIfAborted(signal);
  return binary.length > 0 ? decodeXml(concatBytes(binary)) : texts.join("");
}

/**
 * Whether a value can be read by {@link readText}.
 *
 * @param {unknown} value - Candidate
 * @returns {boolean} True for readable streams and async iterables
 */
export function isStreamSource(value) {
  return (
    isReadableStream(value) ||
    typeof value?.[Symbol.asyncIterator] === "function"
  );
}

/**
 * Turn any supported input into a DOM node: a node is returned as is, bytes
 * are decoded, a stream is read to its end, and text is parsed with the
 * configured DOMParser (see domParsing.js).
 *
 * @param {Node|string|Uint8Array|ArrayBuffer|ReadableStream|AsyncIterable} source - Input
 * @param {object} [options] - Reading options
 * @param {AbortSignal} [options.signal] - Cancels the read
 * @param {import('../xslt/domParsing.js').DomParserLike|null} [options.domParser] -
 *   Parser to use instead of the global DOMParser
 * @param {Document|null} [options.referenceDoc] - Document whose window may
 *   provide a DOMParser
 * @returns {Promise<Node>} The source node
 * @throws {TypeError} For unsupported inputs
 * @throws {Error} When the markup is not well formed
 *
 * @example
 * const doc = await readSource(response.body);
 */
export async function readSource(source, options = {}) {
  const { signal, domParser = null, referenceDoc = null } = options;
  throwIfAborted(signal);
  if (typeof source?.nodeType === "number") return source;

  let text;
  const bytes = toBytes(source);
  if (typeof source === "string") text = source;
  else if (bytes) text = decodeXml(bytes);
  else if (isStreamSource(source)) text = await readText(source, signal);
  else {
    throw new TypeError(
      "The source must be a Node, a string, bytes, a ReadableStream or an async iterable",
    );
  }
  return parseXml(text, resolveDomParser(domParser, referenceDoc));
}
