/**
 * xslt-processor
 *
 * JavaScript implementation of XSLTProcessor for browser environments.
 *
 * This package provides a JavaScript implementation of the W3C XSLTProcessor API
 * that can be used as a drop-in replacement for the native browser implementation.
 *
 * Specifications implemented:
 * - XPath 1.0: http://www.w3.org/TR/1999/REC-xpath-19991116
 * - XSLT 1.0: http://www.w3.org/TR/1999/REC-xslt-19991116
 * - DOM Level 3: http://www.w3.org/TR/2004/REC-DOM-Level-3-Core-20040407/
 *
 * @example
 * // ESM import
 * import { XSLTProcessor, installGlobal } from 'xslt-processor';
 *
 * // Install as global replacement
 * installGlobal();
 *
 * // Or use directly
 * const processor = new XSLTProcessor();
 * processor.importStylesheet(xsltDoc);
 * const result = processor.transformToFragment(xmlDoc, document);
 */

// Main XSLTProcessor class
export {
  XSLTProcessor,
  isNativeXSLTSupported,
  installGlobal,
  default,
} from "./XSLTProcessor.js";

// XPath module (for advanced users)
export {
  evaluate as evaluateXPath,
  select as selectXPath,
  selectFirst as selectFirstXPath,
  XPathEvaluator,
  XPathContext,
  XPathResultType,
  parse as parseXPath,
} from "./xpath/index.js";

// XSLT engine (for advanced users)
export { XsltEngine, XsltContext } from "./xslt/index.js";

/**
 * Version information
 */
export const VERSION = "1.0.4";

/**
 * Check if we're running in a browser environment
 */
export const isBrowser =
  typeof window !== "undefined" && typeof document !== "undefined";

/**
 * Check if we're running in Node.js
 */
export const isNode =
  typeof process !== "undefined" &&
  process.versions?.node != null;
