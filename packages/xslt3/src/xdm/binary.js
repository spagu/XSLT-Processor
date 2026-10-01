/**
 * xs:hexBinary and xs:base64Binary: lexical parsing per XSD 1.1 Part 2 and
 * canonical strings. Values are Uint8Arrays; no platform encoder (atob,
 * Buffer) is used, so the module runs anywhere.
 *
 * @module @tradik/xslt3/xdm/binary
 */

const alphabet =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const base64Pattern =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}[AEIMQUYcgkosw048]=|[A-Za-z0-9+/][AQgw]==)?$/;

/**
 * Parses xs:hexBinary (whitespace already collapsed).
 * @param {string} text
 * @returns {Uint8Array|null} null when invalid
 */
export function parseHexBinary(text) {
  if (text.length % 2 !== 0 || !/^[0-9A-Fa-f]*$/.test(text)) return null;
  const bytes = new Uint8Array(text.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(text.slice(2 * i, 2 * i + 2), 16);
  }
  return bytes;
}

/**
 * @param {Uint8Array} bytes
 * @returns {string} canonical xs:hexBinary (upper case)
 */
export function formatHexBinary(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/**
 * Parses xs:base64Binary (whitespace already collapsed; single spaces
 * between characters are allowed by the XSD grammar).
 * @param {string} text
 * @returns {Uint8Array|null} null when invalid
 */
export function parseBase64Binary(text) {
  const compact = text.replaceAll(" ", "");
  if (!base64Pattern.test(compact)) return null;
  const data = compact.replace(/=+$/, "");
  const bytes = new Uint8Array(Math.floor((data.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let index = 0;
  for (const char of data) {
    buffer = ((buffer << 6) | alphabet.indexOf(char)) & 0xfff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[index++] = (buffer >> bits) & 0xff;
    }
  }
  return bytes;
}

/**
 * @param {Uint8Array} bytes
 * @returns {string} canonical xs:base64Binary (no whitespace, padded)
 */
export function formatBase64Binary(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const chunk =
      (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const chars = Math.min(4, Math.ceil(((bytes.length - i) * 8) / 6));
    for (let j = 0; j < 4; j++) {
      out += j < chars ? alphabet[(chunk >> (18 - 6 * j)) & 63] : "=";
    }
  }
  return out;
}

/**
 * Compares two byte arrays lexicographically (op:hexBinary-less-than).
 * @param {Uint8Array} a
 * @param {Uint8Array} b
 * @returns {number} -1, 0 or 1
 */
export function compareBytes(a, b) {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return Math.sign(a.length - b.length);
}
