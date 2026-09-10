/**
 * Serializer Constants
 *
 * Shared node type codes, namespace URIs and HTML element tables used by the
 * XSLT 1.0 output serializers (XSLT 1.0 section 16).
 */

/**
 * DOM node type codes used by the serializers.
 */
export const NODE_TYPE = {
  ELEMENT: 1,
  TEXT: 3,
  CDATA_SECTION: 4,
  PROCESSING_INSTRUCTION: 7,
  COMMENT: 8,
  DOCUMENT: 9,
  DOCUMENT_FRAGMENT: 11,
};

/**
 * Namespace URI reserved for namespace declaration attributes.
 */
export const XMLNS_NAMESPACE = "http://www.w3.org/2000/xmlns/";

/**
 * Namespace URI bound to the reserved `xml` prefix.
 */
export const XML_NAMESPACE = "http://www.w3.org/XML/1998/namespace";

/**
 * How the text children of an element have to be written out.
 */
export const TEXT_MODE = {
  ESCAPE: "escape",
  CDATA: "cdata",
  RAW: "raw",
};

/**
 * HTML elements that never have an end tag.
 */
export const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

/**
 * HTML elements whose character data must not be escaped.
 */
export const RAW_TEXT_ELEMENTS = new Set(["script", "style"]);

/**
 * HTML elements whose content must never be re-indented.
 */
export const PRESERVE_SPACE_ELEMENTS = new Set([
  "pre",
  "script",
  "style",
  "textarea",
]);

/**
 * Indentation unit used when `indent="yes"` is requested.
 */
export const INDENT_UNIT = "  ";
