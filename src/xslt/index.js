/**
 * XSLT 1.0 Module
 * Based on W3C XSLT 1.0 Specification: http://www.w3.org/TR/1999/REC-xslt-19991116
 */

export { XsltContext, XsltEngine } from "./engine.js";

// XSLT vocabulary and function library (advanced usage)
export {
  XSLT_ELEMENTS,
  XSLT_NAMESPACE,
  isXsltElementAvailable,
} from "./elements.js";
export { VENDOR, VENDOR_URL, createXsltFunctions } from "./functions.js";
export { KeyIndexRegistry } from "./keys.js";
export { DEFAULT_DECIMAL_FORMAT, formatNumber } from "./formatNumber.js";
export { countXsltNumber } from "./number.js";
export { formatXsltNumber, toRoman } from "./numberFormat.js";
export { WhitespaceFilter, stripWhitespaceNodes } from "./whitespace.js";
export {
  NamespaceAliasMap,
  getXsltAttribute,
  lookupNamespaceUri,
  shouldCopyAttribute,
} from "./literalResult.js";
export {
  createResultDocument,
  importResultFragment,
  importResultNode,
} from "./resultTree.js";
export { isAbsoluteUri, resolveUri, stripFragment } from "./uri.js";
export {
  serializeResult,
  markRawText,
  isRawText,
  resolveOutputSettings,
} from "./serializer.js";
