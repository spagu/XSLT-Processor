/**
 * XSLT and XQuery Serialization 3.1: turns an XDM sequence into text with
 * the xml, xhtml, html, text, json or adaptive output method.
 *
 * ```js
 * serialize(items, { method: "xml", indent: true }); // a string
 * for (const chunk of serializeChunks(items, { method: "html" })) write(chunk);
 * serializeToBytes(items, { encoding: "UTF-16" }); // a Uint8Array
 * ```
 *
 * Parameters are given by their camelCase names (`omitXmlDeclaration`) or
 * the hyphenated names of the specification (`"omit-xml-declaration"`);
 * see params/settings.js for the values and the defaults. Errors are
 * XPathErrors with the codes of Serialization 3.1 (SENR0001, SERE00xx,
 * SEPM00xx, SESU00xx).
 *
 * @module @tradik/xslt3/serialize
 */

import { DEFAULT_CHUNK_SIZE, OutputBuffer } from "./output/buffer.js";
import { encodeText } from "./output/encoding.js";
import { Expander } from "./output/expander.js";
import { MarkupWriter } from "./markup/writer.js";
import { AdaptiveWriter } from "./methods/adaptive.js";
import { JsonWriter } from "./methods/json.js";
import { writeText } from "./methods/text.js";
import { normalizeSettings } from "./params/settings.js";
import { normalizeSequence } from "./sequence.js";

export { DEFAULT_CHUNK_SIZE } from "./output/buffer.js";
export { normalizeSettings } from "./params/settings.js";
export { OUTPUT_NAMESPACE } from "./params/names.js";

/**
 * @param {*} value - A sequence (JS array) or a single item
 * @returns {Array}
 */
const toSequence = (value) => (Array.isArray(value) ? value : [value]);

/**
 * Serializes nodes inside JSON or adaptive output: a whole serialization
 * with another method, without an XML declaration.
 * @param {import("./params/settings.js").Settings} settings
 * @param {string} method
 * @returns {(node: Node) => string}
 */
const nodeSerializer = (settings, method) => (node) => {
  const nested = { ...settings, method, omitXmlDeclaration: true };
  return [...chunksOf([node], nested, new OutputBuffer(Infinity))].join("");
};

/**
 * @param {Array} sequence
 * @param {import("./params/settings.js").Settings} settings
 * @param {OutputBuffer} buffer
 * @yields {string} the output in chunks
 * @returns {Generator<string, void, void>}
 */
function* chunksOf(sequence, settings, buffer) {
  const { method } = settings;
  if (method === "json") {
    const node = nodeSerializer(settings, settings.jsonNodeOutputMethod);
    const writer = new JsonWriter(settings, new Expander(settings), node);
    buffer.write(writer.sequence(sequence, 0));
  } else if (method === "adaptive") {
    const writer = new AdaptiveWriter(
      new Expander(settings),
      nodeSerializer(settings, "xml"),
    );
    const separator = settings.itemSeparator ?? "\n";
    sequence.forEach((item, index) => {
      buffer.write((index ? separator : "") + writer.item(item));
    });
  } else {
    const entries = normalizeSequence(sequence, settings.itemSeparator);
    yield* method === "text"
      ? writeText(entries, settings, buffer)
      : new MarkupWriter(settings, buffer).run(entries);
  }
  const rest = buffer.take();
  if (rest) yield rest;
}

/**
 * Serializes a sequence in chunks, as the output is produced, so a large
 * result can be streamed.
 * @param {*} sequence - XDM items (array) or one item
 * @param {Record<string, *>} [params] - Serialization parameters
 * @param {{chunkSize?: number}} [options] - Chunk size in UTF-16 code
 *   units (default {@link DEFAULT_CHUNK_SIZE}); a chunk can be longer
 *   when one text node or attribute is
 * @returns {Generator<string, void, void>} the chunks
 * @throws {import("../errors.js").XPathError} serialization errors (on
 *   creation for parameter errors, while iterating for the others)
 */
export function serializeChunks(sequence, params = {}, options = {}) {
  const settings = normalizeSettings(params);
  const buffer = new OutputBuffer(options.chunkSize ?? DEFAULT_CHUNK_SIZE);
  return chunksOf(toSequence(sequence), settings, buffer);
}

/**
 * Serializes a sequence to a string.
 * @param {*} sequence - XDM items (array) or one item
 * @param {Record<string, *>} [params] - Serialization parameters
 * @returns {string}
 * @throws {import("../errors.js").XPathError} serialization errors
 * @example serialize([doc], { method: "xml", omitXmlDeclaration: true })
 */
export function serialize(sequence, params = {}) {
  const settings = normalizeSettings(params);
  const buffer = new OutputBuffer(Infinity);
  return [...chunksOf(toSequence(sequence), settings, buffer)].join("");
}

/**
 * Serializes a sequence to bytes in the requested encoding, with a byte
 * order mark when byte-order-mark is set (by default for "UTF-16").
 * @param {*} sequence - XDM items (array) or one item
 * @param {Record<string, *>} [params] - Serialization parameters
 * @returns {Uint8Array}
 * @throws {import("../errors.js").XPathError} serialization errors
 */
export function serializeToBytes(sequence, params = {}) {
  const settings = normalizeSettings(params);
  const buffer = new OutputBuffer(Infinity);
  const text = [...chunksOf(toSequence(sequence), settings, buffer)].join("");
  return encodeText(text, settings.encoding, settings.byteOrderMark);
}
