/**
 * XSLT Output Serializer
 *
 * Serializes a result tree to a string honoring the `xsl:output` settings of
 * the stylesheet (XSLT 1.0 section 16): output method, indentation, XML
 * declaration, document type declaration, CDATA sections and
 * `disable-output-escaping`.
 *
 * @example
 * import { serializeResult } from './serializer.js';
 *
 * serializeResult(resultDocument, { method: 'xml', indent: 'yes' });
 * // '<?xml version="1.0" encoding="UTF-8"?>\n<BAR>\n  <QUX/>\n</BAR>'
 */

import { resolveOutputSettings } from "./serializer/settings.js";
import { XmlWriter } from "./serializer/xmlSerializer.js";
import { HtmlWriter } from "./serializer/htmlSerializer.js";
import { textChunks } from "./serializer/textSerializer.js";
import { toChunkSize } from "./serializer/chunks.js";

export { markRawText, isRawText, rawTextNodes } from "./serializer/rawText.js";
export {
  resolveOutputSettings,
  detectOutputMethod,
  findRootElement,
} from "./serializer/settings.js";
export { XmlWriter } from "./serializer/xmlSerializer.js";
export { HtmlWriter } from "./serializer/htmlSerializer.js";
export { serializeText, textChunks } from "./serializer/textSerializer.js";
export {
  ChunkBuffer,
  DEFAULT_CHUNK_SIZE,
  toChunkSize,
} from "./serializer/chunks.js";

/**
 * Serialize a transformation result incrementally, honoring the same
 * `xsl:output` settings as {@link serializeResult}. The result tree must be
 * complete (XSLT 1.0 builds it in memory); what is bounded is the output
 * text: chunks are yielded as soon as they are full, so a consumer can write
 * them out while the rest is being serialized.
 *
 * @param {Node|null} node - Result document, fragment or element
 * @param {object} [outputSettings] - `xsl:output` settings (see serializeResult)
 * @param {{chunkSize?: number}} [options] - `chunkSize` in UTF-16 code units,
 *   {@link DEFAULT_CHUNK_SIZE} (16 KiB) by default, Infinity for one chunk
 * @yields {string} Non-empty chunks of at most `chunkSize` code units (one
 *   more when a surrogate pair straddles the boundary)
 * @returns {Iterator<string>} The chunks; joined, they equal
 *   `serializeResult(node, outputSettings)`
 * @throws {RangeError} When `chunkSize` is not a positive integer or Infinity
 *
 * @example
 * for (const chunk of serializeChunks(resultDocument, { method: "xml" })) {
 *   stream.write(chunk);
 * }
 */
export function serializeChunks(node, outputSettings = {}, options = {}) {
  const chunkSize = toChunkSize(options.chunkSize);
  if (!node) return [][Symbol.iterator]();

  const settings = resolveOutputSettings(outputSettings, node);

  if (settings.method === "text") {
    return textChunks(node, chunkSize);
  }
  const writer =
    settings.method === "html"
      ? new HtmlWriter(settings)
      : new XmlWriter(settings, { xhtml: settings.method === "xhtml" });
  return writer.chunks(node, chunkSize);
}

/**
 * Serialize a transformation result to a string.
 *
 * @param {Node|null} node - Result document, fragment or element
 * @param {object} [outputSettings] - `xsl:output` settings, as collected by the
 *   XSLT engine (`method`, `version`, `encoding`, `standalone`, `indent`,
 *   `omitXmlDeclaration`, `doctypePublic`, `doctypeSystem`, `mediaType`,
 *   `cdataSectionElements`)
 * @returns {string} The serialized result, or an empty string for a null node
 */
export function serializeResult(node, outputSettings = {}) {
  const chunks = serializeChunks(node, outputSettings, { chunkSize: Infinity });
  let output = "";
  for (const chunk of chunks) output += chunk;
  return output;
}
