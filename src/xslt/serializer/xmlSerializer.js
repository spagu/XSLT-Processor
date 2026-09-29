/**
 * XML Output Serializer
 *
 * Implements the `xml` output method of XSLT 1.0 section 16.1 and, with the
 * `xhtml` option, the XHTML empty element convention. It is also the base of
 * the html serializer, which overrides the dialect hooks defined here.
 */

import { TEXT_MODE, VOID_ELEMENTS, XHTML_NAMESPACE } from "./constants.js";
import { escapeXmlAttribute, escapeXmlText } from "./escape.js";
import { characterReference } from "./encoding.js";
import { BaseWriter } from "./baseWriter.js";
import { expandedNameKey } from "./settings.js";

export class XmlWriter extends BaseWriter {
  /**
   * Whether an XML declaration has to be written.
   * @returns {boolean} True when the declaration is not omitted
   */
  get emitsXmlDeclaration() {
    return !this.settings.omitXmlDeclaration;
  }

  /**
   * Whether namespace declarations have to be written.
   * @returns {boolean} Always true for XML output
   */
  get emitsNamespaces() {
    return true;
  }

  /**
   * Terminator of a processing instruction.
   * @returns {string} The XML processing instruction terminator
   */
  get piTerminator() {
    return "?>";
  }

  /**
   * How a source CDATA section node has to be written.
   * @returns {string} A {@link TEXT_MODE} value
   */
  get cdataNodeMode() {
    return TEXT_MODE.CDATA;
  }

  /**
   * Build the document type declaration for the xml output method.
   *
   * @param {Element|null} rootElement - Result document element
   * @returns {string} Doctype markup, or an empty string when not applicable
   */
  doctypeMarkup(rootElement) {
    const { doctypePublic, doctypeSystem } = this.settings;
    if (!rootElement || !doctypeSystem) {
      return "";
    }

    const name = rootElement.nodeName;
    return doctypePublic
      ? `<!DOCTYPE ${name} PUBLIC "${doctypePublic}" "${doctypeSystem}">`
      : `<!DOCTYPE ${name} SYSTEM "${doctypeSystem}">`;
  }

  /**
   * Determine how the character data children of an element are written:
   * as CDATA sections when the expanded name of the element is listed in
   * `cdata-section-elements` (XSLT 1.0 section 16.1).
   *
   * @param {Element} element - Parent element
   * @returns {string} A {@link TEXT_MODE} value
   */
  childTextMode(element) {
    return this.isCdataSectionElement(element)
      ? TEXT_MODE.CDATA
      : TEXT_MODE.ESCAPE;
  }

  /**
   * Whether an element is listed in `cdata-section-elements`. Prefixed names
   * the engine passed unresolved are resolved with the element's in-scope
   * namespaces.
   *
   * @param {Element} element - Element to test
   * @returns {boolean} True when its text is written as CDATA sections
   */
  isCdataSectionElement(element) {
    const { cdataSectionElements, cdataSectionQNames = [] } = this.settings;
    const namespaceUri = element.namespaceURI || null;
    const { localName } = element;
    if (cdataSectionElements.has(expandedNameKey(namespaceUri, localName))) {
      return true;
    }
    return cdataSectionQNames.some(
      (qname) =>
        qname.localName === localName &&
        namespaceUri !== null &&
        element.lookupNamespaceURI(qname.prefix) === namespaceUri,
    );
  }

  /**
   * Markup the serializer itself adds as the first child of an element.
   *
   * @param {Element} _element - Element being written
   * @returns {string} Always empty for XML output
   */
  leadingChildMarkup(_element) {
    return "";
  }

  /**
   * Whether the content of an element may be re-indented.
   *
   * @param {Element} _element - Element being inspected
   * @returns {boolean} Always true for XML output
   */
  allowsIndentInside(_element) {
    return true;
  }

  /**
   * Build the markup closing an element that has no children.
   *
   * XHTML elements follow the XHTML compatibility guidelines, as libxml2
   * (Chrome) and the DOM serializer (Firefox) do: void elements become
   * `<br />` and every other empty element gets an explicit end tag, because
   * `<script/>` or `<div/>` break when XHTML reaches an HTML parser. Other
   * elements use the XML empty-element tag.
   *
   * @param {Element} element - Empty element
   * @param {string} name - Element name as written
   * @returns {string} Markup terminating the start tag
   */
  emptyElementMarkup(element, name) {
    if (!this.followsXhtmlConventions(element)) return "/>";
    return this.isVoidElement(element) ? " />" : `></${name}>`;
  }

  /**
   * Whether an element is written with the XHTML empty-element conventions:
   * elements in the XHTML namespace, and namespace-less elements when the
   * output method is `xhtml`.
   *
   * @param {Element} element - Element to test
   * @returns {boolean} True for XHTML elements
   */
  followsXhtmlConventions(element) {
    const namespace = element.namespaceURI || null;
    return namespace === XHTML_NAMESPACE || (this.xhtml && namespace === null);
  }

  /**
   * Test whether an element is an HTML void element.
   *
   * @param {Element} element - Element to test
   * @returns {boolean} True for void elements such as `br`
   */
  isVoidElement(element) {
    return VOID_ELEMENTS.has(String(element.localName).toLowerCase());
  }

  /**
   * Escape character data.
   *
   * @param {string} value - Text content
   * @returns {string} Escaped text
   */
  escapeText(value) {
    return this.encodeReferences(escapeXmlText(value));
  }

  /**
   * Escape an attribute value.
   *
   * @param {string} value - Attribute value
   * @returns {string} Escaped value
   */
  escapeAttribute(value) {
    return this.encodeReferences(escapeXmlAttribute(value));
  }

  /**
   * Reference to a character the output encoding cannot represent.
   *
   * @param {number} codePoint - The code point
   * @returns {string} A numeric character reference
   */
  characterReference(codePoint) {
    return characterReference(codePoint);
  }
}
