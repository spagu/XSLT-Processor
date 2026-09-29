/**
 * Output Encodings
 *
 * The `encoding` attribute of `xsl:output` names the character encoding of the
 * serialized result. A character the encoding cannot represent is written as
 * a character reference (XSLT 1.0 section 16.1: `&#8364;` in ISO-8859-1), so
 * the serialized string only holds characters the declared encoding has, and
 * turning it into bytes (see {@link encodeOutput}, used by the CLI) is
 * lossless.
 *
 * Supported encodings:
 * - UTF-8 and UTF-16 (every label TextDecoder maps to them) represent every
 *   character; UTF-16 output starts with a byte order mark;
 * - ISO-8859-1 / latin1 (up to U+00FF) and US-ASCII (up to U+007F), handled
 *   here because the WHATWG Encoding Standard aliases both to windows-1252;
 * - every other single-byte encoding known to TextDecoder (windows-125x,
 *   ISO-8859-x, KOI8-R/U, IBM866, macintosh, ...): its repertoire is read
 *   lazily by decoding the 256 byte values once;
 * - multi-byte encodings other than UTF (Shift_JIS, EUC-JP, GBK, Big5, ...) and
 *   unknown labels are treated as able to represent every character: no
 *   character reference is written, and {@link encodeOutput} falls back to
 *   UTF-8 bytes (`isExact` is false so callers can warn).
 *
 * @module xslt/serializer/encoding
 */

/** Labels of US-ASCII (IANA names and aliases). */
const ASCII_LABELS = new Set([
  "ascii",
  "us-ascii",
  "ansi_x3.4-1968",
  "iso646-us",
  "iso-ir-6",
  "csascii",
  "us",
]);

/** Labels of ISO-8859-1 (IANA names and aliases). */
const LATIN1_LABELS = new Set([
  "iso-8859-1",
  "iso8859-1",
  "iso88591",
  "iso_8859-1",
  "iso_8859-1:1987",
  "latin1",
  "l1",
  "cp819",
  "ibm819",
  "csisolatin1",
  "iso-ir-100",
]);

/** Canonical WHATWG names of the single-byte encodings. */
const SINGLE_BYTE_ENCODINGS = new Set([
  "ibm866",
  "iso-8859-2",
  "iso-8859-3",
  "iso-8859-4",
  "iso-8859-5",
  "iso-8859-6",
  "iso-8859-7",
  "iso-8859-8",
  "iso-8859-8-i",
  "iso-8859-10",
  "iso-8859-13",
  "iso-8859-14",
  "iso-8859-15",
  "iso-8859-16",
  "koi8-r",
  "koi8-u",
  "macintosh",
  "windows-874",
  "windows-1250",
  "windows-1251",
  "windows-1252",
  "windows-1253",
  "windows-1254",
  "windows-1255",
  "windows-1256",
  "windows-1257",
  "windows-1258",
  "x-mac-cyrillic",
]);

/**
 * @typedef {Object} OutputEncoding
 * @property {string} name - Canonical name ("utf-8", "utf-16le", "iso-8859-1"...)
 * @property {boolean} isUnicode - True when every character is representable
 * @property {boolean} isExact - False when bytes fall back to UTF-8
 * @property {Map<number, number>|null} bytes - Byte of every representable
 *   code point, for single-byte encodings
 */

/** Encodings already resolved, by lower-cased label. */
const cache = new Map();

/**
 * Build a single-byte encoding whose bytes map to the same code points.
 *
 * @param {string} name - Canonical name
 * @param {number} last - Highest byte value (0x7F or 0xFF)
 * @returns {OutputEncoding} The encoding
 */
function identityEncoding(name, last) {
  const bytes = new Map();
  for (let byte = 0; byte <= last; byte++) bytes.set(byte, byte);
  return { name, isUnicode: false, isExact: true, bytes };
}

/**
 * Build a single-byte encoding from the repertoire TextDecoder reports.
 *
 * @param {TextDecoder} decoder - Decoder of the encoding
 * @returns {OutputEncoding} The encoding
 */
function tableEncoding(decoder) {
  const bytes = new Map();
  for (let byte = 0; byte <= 0xff; byte++) {
    const codePoint = decoder.decode(Uint8Array.of(byte)).codePointAt(0);
    if (codePoint !== 0xfffd && !bytes.has(codePoint)) {
      bytes.set(codePoint, byte);
    }
  }
  return { name: decoder.encoding, isUnicode: false, isExact: true, bytes };
}

/**
 * Resolve an encoding label that is not ASCII or ISO-8859-1.
 *
 * @param {string} label - Lower-cased, trimmed label
 * @returns {OutputEncoding} The encoding
 */
function resolveWithDecoder(label) {
  let decoder;
  try {
    decoder = new globalThis.TextDecoder(label);
  } catch {
    return { name: label, isUnicode: true, isExact: false, bytes: null };
  }
  const name = decoder.encoding;
  if (SINGLE_BYTE_ENCODINGS.has(name)) return tableEncoding(decoder);
  const isExact = name === "utf-8" || name.startsWith("utf-16");
  return { name, isUnicode: true, isExact, bytes: null };
}

/**
 * Resolve the `encoding` of `xsl:output`.
 *
 * @param {string} [label] - Encoding label, UTF-8 when absent
 * @returns {OutputEncoding} The encoding
 *
 * @example
 * getOutputEncoding("ISO-8859-1").bytes.has(0x20ac); // false
 */
export function getOutputEncoding(label = "UTF-8") {
  const key = String(label).trim().toLowerCase();
  let encoding = cache.get(key);
  if (!encoding) {
    if (ASCII_LABELS.has(key)) encoding = identityEncoding("us-ascii", 0x7f);
    else if (LATIN1_LABELS.has(key)) {
      encoding = identityEncoding("iso-8859-1", 0xff);
    } else encoding = resolveWithDecoder(key);
    cache.set(key, encoding);
  }
  return encoding;
}

/**
 * Numeric character reference of a code point.
 *
 * @param {number} codePoint - The code point
 * @returns {string} `&#N;`
 */
export function characterReference(codePoint) {
  return `&#${codePoint};`;
}

/** Characters outside ASCII, as whole code points. */
const NON_ASCII = /[\u{80}-\u{10FFFF}]/gu;

/**
 * Replace every character an encoding cannot represent.
 *
 * Every supported encoding is a superset of ASCII, so only non-ASCII
 * characters are checked.
 *
 * @param {string} text - Text to write
 * @param {OutputEncoding} encoding - The output encoding
 * @param {(codePoint: number) => string} [reference] - Replacement of an
 *   unrepresentable code point; a numeric character reference by default
 * @returns {string} Text holding only representable characters
 *
 * @example
 * replaceUnencodable("€é", getOutputEncoding("latin1")); // "&#8364;é"
 */
export function replaceUnencodable(
  text,
  encoding,
  reference = characterReference,
) {
  if (encoding.isUnicode) return text;
  return text.replace(NON_ASCII, (character) => {
    const codePoint = character.codePointAt(0);
    return encoding.bytes.has(codePoint) ? character : reference(codePoint);
  });
}

/**
 * Split text into runs an encoding can and cannot represent, as needed to
 * write a CDATA section, which cannot hold character references.
 *
 * @param {string} text - Text to write
 * @param {OutputEncoding} encoding - The output encoding
 * @returns {Array<{text: string, representable: boolean}>} The runs, in order;
 *   an unrepresentable run holds one code point
 */
export function splitUnencodable(text, encoding) {
  if (encoding.isUnicode) return [{ text, representable: true }];
  const runs = [];
  let start = 0;
  for (const match of text.matchAll(NON_ASCII)) {
    if (encoding.bytes.has(match[0].codePointAt(0))) continue;
    if (match.index > start) {
      runs.push({ text: text.slice(start, match.index), representable: true });
    }
    runs.push({ text: match[0], representable: false });
    start = match.index + match[0].length;
  }
  if (start < text.length || runs.length === 0) {
    runs.push({ text: text.slice(start), representable: true });
  }
  return runs;
}

/**
 * Encode UTF-16 code units with a byte order mark.
 *
 * @param {string} text - Text to encode
 * @param {boolean} bigEndian - Byte order
 * @returns {Uint8Array} The bytes
 */
function encodeUtf16(text, bigEndian) {
  const bytes = new Uint8Array(2 + text.length * 2);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, 0xfeff, !bigEndian);
  for (let i = 0; i < text.length; i++) {
    view.setUint16(2 + i * 2, text.charCodeAt(i), !bigEndian);
  }
  return bytes;
}

/**
 * Encode text with a single-byte encoding; a character without a byte
 * (possible only in comments and processing instructions, which cannot hold
 * references) becomes a character reference, as libxml2 does.
 *
 * @param {string} text - Text to encode
 * @param {Map<number, number>} table - Byte of every representable code point
 * @returns {Uint8Array} The bytes
 */
function encodeSingleByte(text, table) {
  const bytes = [];
  for (const character of text) {
    const codePoint = character.codePointAt(0);
    const byte = table.get(codePoint);
    if (byte === undefined) {
      for (const unit of characterReference(codePoint)) {
        bytes.push(unit.charCodeAt(0));
      }
    } else {
      bytes.push(byte);
    }
  }
  return Uint8Array.from(bytes);
}

/**
 * Turn serialized output into the bytes of its declared encoding.
 *
 * UTF-8 is written without a byte order mark, UTF-16 with one. Encodings
 * without an encoder here (multi-byte encodings other than UTF, unknown
 * labels) are written as UTF-8; `getOutputEncoding(label).isExact` is false
 * for them.
 *
 * @param {string} text - Serialized output
 * @param {string} [label] - The `xsl:output` encoding, UTF-8 when absent
 * @returns {Uint8Array} The encoded bytes
 *
 * @example
 * encodeOutput("é", "ISO-8859-1"); // Uint8Array [0xe9]
 */
export function encodeOutput(text, label) {
  const encoding = getOutputEncoding(label);
  if (encoding.bytes) return encodeSingleByte(text, encoding.bytes);
  if (encoding.name === "utf-16le") return encodeUtf16(text, false);
  if (encoding.name === "utf-16be") return encodeUtf16(text, true);
  return new globalThis.TextEncoder().encode(text);
}
