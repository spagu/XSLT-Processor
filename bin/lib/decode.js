/**
 * XSLT Processor CLI - Character Encoding Detection
 *
 * Turns the raw bytes of an XML file into text following XML 1.0 Appendix F
 * ("Autodetection of Character Encodings"): a byte order mark wins, then the
 * `encoding` pseudo-attribute of the XML declaration, then UTF-8. Decoding is
 * done with TextDecoder, so every WHATWG encoding label is accepted
 * (ISO-8859-x, windows-125x, Shift_JIS, EUC-KR, ...).
 */

"use strict";

import { TextDecoder } from "node:util";

/** Byte order marks, longest first, with the encoding they announce. */
const BYTE_ORDER_MARKS = [
  { bytes: [0xef, 0xbb, 0xbf], encoding: "utf-8" },
  { bytes: [0xff, 0xfe], encoding: "utf-16le" },
  { bytes: [0xfe, 0xff], encoding: "utf-16be" },
];

/** First bytes of `<?` in UTF-16 without a byte order mark. */
const UTF16_SIGNATURES = [
  { bytes: [0x3c, 0x00, 0x3f, 0x00], encoding: "utf-16le" },
  { bytes: [0x00, 0x3c, 0x00, 0x3f], encoding: "utf-16be" },
];

/** How many leading bytes are scanned for the XML declaration. */
const DECLARATION_SCAN_LENGTH = 1024;

/** Matches the encoding pseudo-attribute of an XML declaration. */
const ENCODING_DECLARATION =
  /^<\?xml\s[^>]*?\bencoding\s*=\s*(["'])([A-Za-z][\w.:-]*)\1/;

/**
 * Error raised when a file declares an encoding the runtime cannot decode.
 */
export class EncodingError extends Error {
  /**
   * @param {string} message - Human readable explanation
   */
  constructor(message) {
    super(message);
    this.name = "EncodingError";
  }
}

/**
 * Check whether a buffer starts with the given bytes.
 *
 * @param {Uint8Array} buffer - Raw file content
 * @param {number[]} bytes - Expected leading bytes
 * @returns {boolean} True when the buffer starts with bytes
 */
function startsWith(buffer, bytes) {
  return bytes.every((byte, index) => buffer[index] === byte);
}

/**
 * Read the encoding pseudo-attribute from an ASCII compatible XML declaration.
 *
 * @param {Uint8Array} buffer - Raw file content
 * @returns {string|null} The declared encoding label, or null when absent
 */
function readDeclaredEncoding(buffer) {
  const prefix = new TextDecoder("latin1").decode(
    buffer.subarray(0, DECLARATION_SCAN_LENGTH),
  );
  const match = ENCODING_DECLARATION.exec(prefix);
  return match ? match[2] : null;
}

/**
 * Detect the character encoding of an XML file (XML 1.0 Appendix F).
 *
 * A UTF-16 label declared in an ASCII compatible file cannot be right (the
 * declaration itself was readable as single bytes), so it falls back to
 * UTF-8, as browsers do.
 *
 * @param {Uint8Array} buffer - Raw file content
 * @returns {{encoding: string, bomLength: number}} Encoding label and the
 *   number of byte order mark bytes to skip
 *
 * @example
 * detectEncoding(Buffer.from('<?xml version="1.0" encoding="ISO-8859-1"?><a/>'));
 * // { encoding: 'ISO-8859-1', bomLength: 0 }
 */
export function detectEncoding(buffer) {
  const bom = BYTE_ORDER_MARKS.find(({ bytes }) => startsWith(buffer, bytes));
  if (bom) {
    return { encoding: bom.encoding, bomLength: bom.bytes.length };
  }

  const utf16 = UTF16_SIGNATURES.find(({ bytes }) => startsWith(buffer, bytes));
  if (utf16) {
    return { encoding: utf16.encoding, bomLength: 0 };
  }

  const declared = readDeclaredEncoding(buffer);
  if (!declared || /^utf-?16/i.test(declared)) {
    return { encoding: "utf-8", bomLength: 0 };
  }

  return { encoding: declared, bomLength: 0 };
}

/**
 * Decode the raw bytes of an XML file into a string without byte order mark.
 *
 * Malformed byte sequences become U+FFFD instead of aborting the run.
 *
 * @param {Uint8Array} buffer - Raw file content
 * @param {string} [label] - Human readable file name used in errors
 * @returns {string} The decoded document text
 * @throws {EncodingError} When the declared encoding is not supported
 *
 * @example
 * decodeXml(readFileSync('latin1.xml')); // '<?xml ... encoding="ISO-8859-1"?><a>café</a>'
 */
export function decodeXml(buffer, label = "document") {
  const { encoding, bomLength } = detectEncoding(buffer);
  let decoder;

  try {
    decoder = new TextDecoder(encoding, { fatal: false, ignoreBOM: true });
  } catch {
    throw new EncodingError(
      `Unsupported encoding "${encoding}" declared in ${label}`,
    );
  }

  return decoder.decode(buffer.subarray(bomLength));
}
