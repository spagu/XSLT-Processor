/**
 * Output encodings: which characters an encoding can represent (the others
 * are written as character references, or are an error where references
 * are not possible) and the conversion of the serialized string to bytes.
 *
 * Supported: UTF-8, UTF-16 (big-endian, or UTF-16BE/UTF-16LE), ISO-8859-1,
 * US-ASCII, and the single-byte encodings of the WHATWG Encoding Standard
 * that the platform's TextDecoder knows (windows-1252, ISO-8859-2, KOI8-R,
 * ...). Other encodings are a SESU0007 error.
 *
 * @module @tradik/xslt3/serialize/output/encoding
 */

import { XPathError } from "../../errors.js";

/**
 * @typedef {object} Encoding
 * @property {string} name - The name as requested (written in the XML
 *   declaration and the HTML content type)
 * @property {string} kind - "utf-8", "utf-16be", "utf-16le" or "single-byte"
 * @property {((codePoint: number) => boolean)|null} encodable - null when
 *   every character can be encoded
 * @property {Map<number, number>} [table] - Code point to byte
 */

const ALIASES = {
  "utf-8": "utf-8",
  utf8: "utf-8",
  "utf-16": "utf-16be",
  utf16: "utf-16be",
  "utf-16be": "utf-16be",
  "utf-16le": "utf-16le",
  "iso-8859-1": "latin1",
  iso_8859_1: "latin1",
  "iso_8859-1": "latin1",
  latin1: "latin1",
  l1: "latin1",
  "us-ascii": "ascii",
  ascii: "ascii",
  "iso-646": "ascii",
};

/** Canonical names of the WHATWG single-byte encodings. */
const SINGLE_BYTE = new Set([
  "ibm866",
  "koi8-r",
  "koi8-u",
  "macintosh",
  "windows-874",
  "x-mac-cyrillic",
  ...[2, 3, 4, 5, 6, 7, 8, 10, 13, 14, 15, 16].map((n) => `iso-8859-${n}`),
  ...[0, 1, 2, 3, 4, 5, 6, 7, 8].map((n) => `windows-125${n}`),
]);

/** What a decoder returns for a byte it does not map. */
const REPLACEMENT_CHARACTER = String.fromCharCode(0xfffd);

/** @type {Map<string, Map<number, number>>} tables by canonical name */
const tables = new Map();

/**
 * Code point to byte table of a single-byte encoding, from the platform
 * decoder.
 * @param {string} canonical - Canonical WHATWG name
 * @returns {Map<number, number>}
 */
function singleByteTable(canonical) {
  let table = tables.get(canonical);
  if (!table) {
    const decoder = new globalThis.TextDecoder(canonical);
    table = new Map();
    for (let byte = 0; byte < 256; byte++) {
      const char = decoder.decode(Uint8Array.of(byte));
      if (char !== REPLACEMENT_CHARACTER) table.set(char.codePointAt(0), byte);
    }
    tables.set(canonical, table);
  }
  return table;
}

/**
 * The canonical WHATWG name of an encoding label, or null.
 * @param {string} label
 * @returns {string|null}
 */
function whatwgName(label) {
  try {
    return new globalThis.TextDecoder(label).encoding;
  } catch {
    return null;
  }
}

/**
 * Resolves the encoding parameter.
 * @param {string} name - Encoding name, case-insensitive
 * @returns {Encoding}
 * @throws {XPathError} SESU0007 when the encoding is not supported
 */
export function resolveEncoding(name) {
  const alias = ALIASES[name.trim().toLowerCase()];
  if (alias === "latin1" || alias === "ascii") {
    const limit = alias === "latin1" ? 0xff : 0x7f;
    return { name, kind: "single-byte", encodable: (cp) => cp <= limit };
  }
  if (alias) return { name, kind: alias, encodable: null };
  const canonical = whatwgName(name.trim());
  if (canonical === null || !SINGLE_BYTE.has(canonical)) {
    throw new XPathError("SESU0007", `Unsupported encoding ${name}`);
  }
  const table = singleByteTable(canonical);
  return { name, kind: "single-byte", encodable: (cp) => table.has(cp), table };
}

/** U+FEFF, written first with byte-order-mark. */
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);

/**
 * Encodes serialized text (already free of unencodable characters).
 * @param {string} text
 * @param {Encoding} encoding
 * @param {boolean} byteOrderMark - Start with the byte order mark (UTF-8
 *   and UTF-16 only)
 * @returns {Uint8Array}
 */
export function encodeText(text, encoding, byteOrderMark) {
  const { kind } = encoding;
  const content =
    byteOrderMark && kind !== "single-byte" ? BYTE_ORDER_MARK + text : text;
  if (kind === "utf-8") return new globalThis.TextEncoder().encode(content);
  if (kind === "single-byte") {
    const bytes = new Uint8Array(content.length);
    for (let i = 0; i < content.length; i++) {
      const cp = content.charCodeAt(i);
      bytes[i] = encoding.table ? encoding.table.get(cp) : cp;
    }
    return bytes;
  }
  const bytes = new Uint8Array(content.length * 2);
  const view = new DataView(bytes.buffer);
  const littleEndian = kind === "utf-16le";
  for (let i = 0; i < content.length; i++) {
    view.setUint16(i * 2, content.charCodeAt(i), littleEndian);
  }
  return bytes;
}
