/**
 * Byte order marks in serialized text, for the assertions that look at
 * the start of the output (byte-order-mark serialization parameter).
 *
 * @module test-suites/lib/byteOrderMark
 */

import { normalizeSettings } from "../../src/serialize/index.js";

/**
 * Serialized text as the bytes would decode: with the byte order mark
 * that byte-order-mark asks for (Unicode encodings only).
 *
 * @param {string} text - Serialized text
 * @param {object} params - Serialization parameters of the result
 * @returns {string} The text
 */
export function withByteOrderMark(text, params) {
  const { byteOrderMark, encoding } = normalizeSettings(params);
  return byteOrderMark && encoding.kind !== "single-byte"
    ? `\uFEFF${text}`
    : text;
}
