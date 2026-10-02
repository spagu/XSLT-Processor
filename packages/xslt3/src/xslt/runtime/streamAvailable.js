/**
 * fn:stream-available (XSLT 3.0 section 18.1): whether a call of
 * xsl:source-document with streamable="yes" on the URI would start
 * successfully. The processor does not stream, so this holds when the
 * resource is a well-formed document or, as a streaming parser would see
 * it, a resource that starts with a well-formed prolog and an element
 * (a later well-formedness error is only met while streaming).
 *
 * @module @tradik/xslt3/xslt/runtime/streamAvailable
 */

import { booleanItem } from "../../functions/support.js";

/** XML declaration, comments, processing instructions and whitespace. */
const MISC = String.raw`(?:\s+|<!--[\s\S]*?-->|<\?[\s\S]*?\?>)*`;

/** A prolog (with an optional document type declaration), then a tag. */
const STARTS_WITH_ELEMENT = new RegExp(
  `^\\uFEFF?${MISC}(?:<!DOCTYPE[^\\[>]*(?:\\[[\\s\\S]*?\\]\\s*)?>${MISC})?<[\\p{L}_:]`,
  "u",
);

/**
 * Whether a text starts as an XML document with an element.
 * @param {string} text
 * @returns {boolean}
 */
export const startsWithElement = (text) => STARTS_WITH_ELEMENT.test(text);

/**
 * Whether a document is available for streaming.
 * @param {string} uri
 * @param {object} context - XPath dynamic context
 * @returns {boolean}
 */
function available(uri, context) {
  try {
    const document = context.loadDocument(uri);
    if (document.documentElement) return true;
  } catch {
    // not a well-formed document: perhaps one that starts well
  }
  try {
    return startsWithElement(context.loadText(uri));
  } catch {
    return false;
  }
}

/** Function definitions. */
export const streamAvailableFunctions = [
  {
    local: "stream-available",
    params: ["xs:string?"],
    returns: "xs:boolean",
    impl: ([uri], context) => [
      booleanItem(uri.length > 0 && available(uri[0].value, context)),
    ],
  },
];
