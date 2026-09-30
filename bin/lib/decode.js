/**
 * XSLT Processor CLI - Character Encoding Detection
 *
 * Thin wrapper: the decoding core (XML 1.0 Appendix F: byte order mark, then
 * the XML declaration, then UTF-8) lives in src/io/decode.js, shared with the
 * asynchronous API.
 */

"use strict";

export {
  EncodingError,
  decodeXml,
  detectEncoding,
} from "../../src/io/decode.js";
