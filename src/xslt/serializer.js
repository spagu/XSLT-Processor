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
import { serializeText } from "./serializer/textSerializer.js";

export { markRawText, isRawText, rawTextNodes } from "./serializer/rawText.js";
export {
  resolveOutputSettings,
  detectOutputMethod,
  findRootElement,
} from "./serializer/settings.js";
export { XmlWriter } from "./serializer/xmlSerializer.js";
export { HtmlWriter } from "./serializer/htmlSerializer.js";
export { serializeText } from "./serializer/textSerializer.js";

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
  if (!node) {
    return "";
  }

  const settings = resolveOutputSettings(outputSettings, node);

  if (settings.method === "text") {
    return serializeText(node);
  }
  if (settings.method === "html") {
    return new HtmlWriter(settings).serialize(node);
  }
  return new XmlWriter(settings, {
    xhtml: settings.method === "xhtml",
  }).serialize(node);
}
