/**
 * Decoding of the text resources read by fn:unparsed-text and its family
 * (F&O 3.1 section 14.6.1): the encoding comes from a byte order mark,
 * else from external information (the loader's `encoding`), else from the
 * XML declaration of an XML media type, else from the `$encoding`
 * argument, else UTF-8.
 *
 * @module @tradik/xslt3/functions/textDecoding
 */

import { XPathError } from "../errors.js";

/** A character that is not an XML 1.0 Char (lone surrogates included). */
const NON_XML = /[^\t\n\r\x20-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/u;

/**
 * What a text loader returns: the text itself, its bytes, or either with
 * external encoding information and a media type.
 * @typedef {string|Uint8Array|ArrayBuffer|{content: string|Uint8Array|ArrayBuffer, encoding?: string, mediaType?: string}} TextResource
 */

/**
 * The encoding a byte order mark announces.
 * @param {Uint8Array} bytes
 * @returns {string|null}
 */
function bomEncoding(bytes) {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return "utf-8";
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return "utf-16be";
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return "utf-16le";
  return null;
}

/**
 * The encoding of an XML document without byte order mark: UTF-16 by its
 * first bytes, else the encoding declaration, else UTF-8.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function xmlEncoding(bytes) {
  if (bytes[0] === 0x3c && bytes[1] === 0) return "utf-16le";
  if (bytes[0] === 0 && bytes[1] === 0x3c) return "utf-16be";
  const head = String.fromCharCode(...bytes.subarray(0, 200));
  return (
    /^<\?xml[^>]*?encoding\s*=\s*["']([^"']*)["']/.exec(head)?.[1] ?? "utf-8"
  );
}

/** @param {string} [type] @returns {boolean} whether it is an XML media type */
const isXmlMediaType = (type) =>
  /^(?:text|application)\/(?:[\w.-]+\+)?xml\b/i.test(type ?? "");

/**
 * A fatal TextDecoder; "utf-16" without byte order mark is big-endian.
 * @param {string} label
 * @returns {TextDecoder}
 * @throws {XPathError} FOUT1190 for an unsupported encoding
 */
export function textDecoder(label) {
  const name = /^utf-?16$/i.test(label.trim()) ? "utf-16be" : label;
  try {
    return new globalThis.TextDecoder(name, { fatal: true });
  } catch (error) {
    throw new XPathError("FOUT1190", `Unsupported encoding ${label}`, {
      cause: error,
    });
  }
}

/**
 * Decodes a text resource and checks its characters.
 * @param {TextResource} resource
 * @param {string} [encoding] - The `$encoding` argument
 * @returns {string} the text, without byte order mark
 * @throws {XPathError} FOUT1190 for an unsupported encoding, bytes that
 *   do not decode or characters that are not XML characters; FOUT1200
 *   when UTF-8, the encoding assumed for want of any information, fails
 */
export function decodeText(resource, encoding) {
  const requested = encoding === undefined ? null : textDecoder(encoding);
  const plain =
    typeof resource === "string" ||
    resource instanceof Uint8Array ||
    resource instanceof ArrayBuffer;
  const {
    content,
    encoding: external,
    mediaType,
  } = plain ? { content: resource } : resource;
  let text;
  if (typeof content === "string") {
    text = content;
  } else {
    const bytes = new Uint8Array(content);
    const label =
      bomEncoding(bytes) ??
      external ??
      (isXmlMediaType(mediaType) ? xmlEncoding(bytes) : null);
    const decoder = label ? textDecoder(label) : requested;
    try {
      text = (decoder ?? textDecoder("utf-8")).decode(bytes);
    } catch (error) {
      throw new XPathError(
        decoder ? "FOUT1190" : "FOUT1200",
        `The resource is not ${decoder?.encoding ?? "utf-8"} text`,
        { cause: error },
      );
    }
  }
  text = text.replace(/^\uFEFF/, "");
  if (NON_XML.test(text)) {
    throw new XPathError("FOUT1190", "The resource has a non-XML character");
  }
  return text;
}
