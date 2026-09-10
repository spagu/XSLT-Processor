/**
 * XML Output Serializer
 *
 * Implements the `xml` output method of XSLT 1.0 section 16.1 and, with the
 * `xhtml` option, the XHTML empty element convention. It is also the base of
 * the html serializer, which overrides the dialect hooks defined here.
 */

import { TEXT_MODE, VOID_ELEMENTS } from "./constants.js";
import { escapeXmlAttribute, escapeXmlText } from "./escape.js";
import { BaseWriter } from "./baseWriter.js";

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
   * Determine how the character data children of an element are written.
   *
   * @param {Element} element - Parent element
   * @returns {string} A {@link TEXT_MODE} value
   */
  childTextMode(element) {
    const names = this.settings.cdataSectionElements;
    return names.has(element.nodeName) || names.has(element.localName)
      ? TEXT_MODE.CDATA
      : TEXT_MODE.ESCAPE;
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
   * @param {Element} element - Empty element
   * @param {string} _name - Element name as written
   * @returns {string} Markup terminating the start tag
   */
  emptyElementMarkup(element, _name) {
    return this.xhtml && this.isVoidElement(element) ? " />" : "/>";
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
    return escapeXmlText(value);
  }

  /**
   * Escape an attribute value.
   *
   * @param {string} value - Attribute value
   * @returns {string} Escaped value
   */
  escapeAttribute(value) {
    return escapeXmlAttribute(value);
  }
}
