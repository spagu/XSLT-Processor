/**
 * HTML Output Serializer
 *
 * Implements the `html` output method of XSLT 1.0 section 16.2 on top of the
 * XML writer: no XML declaration, no namespace declarations, void elements
 * without a closing slash, minimized boolean attributes and unescaped
 * script/style content.
 */

import {
  PRESERVE_SPACE_ELEMENTS,
  RAW_TEXT_ELEMENTS,
  TEXT_MODE,
} from "./constants.js";
import { escapeHtmlAttribute, escapeHtmlText } from "./escape.js";
import { XmlWriter } from "./xmlSerializer.js";

export class HtmlWriter extends XmlWriter {
  /**
   * The html output method never writes an XML declaration.
   * @returns {boolean} Always false
   */
  get emitsXmlDeclaration() {
    return false;
  }

  /**
   * The html output method never writes namespace declarations.
   * @returns {boolean} Always false
   */
  get emitsNamespaces() {
    return false;
  }

  /**
   * HTML processing instructions are terminated by `>` alone.
   * @returns {string} The HTML processing instruction terminator
   */
  get piTerminator() {
    return ">";
  }

  /**
   * HTML has no CDATA sections, so such nodes are escaped as text.
   * @returns {string} A {@link TEXT_MODE} value
   */
  get cdataNodeMode() {
    return TEXT_MODE.ESCAPE;
  }

  /**
   * Build the document type declaration for the html output method.
   *
   * @param {Element|null} rootElement - Result document element
   * @returns {string} Doctype markup, or an empty string when not applicable
   */
  doctypeMarkup(rootElement) {
    const { doctypePublic, doctypeSystem } = this.settings;
    if (!doctypePublic && !doctypeSystem) {
      return "";
    }

    const name = rootElement ? rootElement.nodeName : "html";
    if (doctypePublic && doctypeSystem) {
      return `<!DOCTYPE ${name} PUBLIC "${doctypePublic}" "${doctypeSystem}">`;
    }
    if (doctypePublic) {
      return `<!DOCTYPE ${name} PUBLIC "${doctypePublic}">`;
    }
    return `<!DOCTYPE ${name} SYSTEM "${doctypeSystem}">`;
  }

  /**
   * Script and style content is written verbatim.
   *
   * @param {Element} element - Parent element
   * @returns {string} A {@link TEXT_MODE} value
   */
  childTextMode(element) {
    return RAW_TEXT_ELEMENTS.has(String(element.localName).toLowerCase())
      ? TEXT_MODE.RAW
      : TEXT_MODE.ESCAPE;
  }

  /**
   * Content of `pre`, `script`, `style` and `textarea` is never re-indented.
   *
   * @param {Element} element - Element being inspected
   * @returns {boolean} True when the content may be indented
   */
  allowsIndentInside(element) {
    return !PRESERVE_SPACE_ELEMENTS.has(
      String(element.localName).toLowerCase(),
    );
  }

  /**
   * Void elements have no end tag; every other element gets one.
   *
   * @param {Element} element - Empty element
   * @param {string} name - Element name as written
   * @returns {string} Markup terminating the start tag
   */
  emptyElementMarkup(element, name) {
    return this.isVoidElement(element) ? ">" : `></${name}>`;
  }

  /**
   * Boolean attributes are minimized to their name alone.
   *
   * @param {Attr} attribute - Attribute to write
   * @returns {string} Attribute markup, starting with a space
   */
  attributeMarkup(attribute) {
    const { name, value } = attribute;
    if (String(value).toLowerCase() === name.toLowerCase()) {
      return ` ${name}`;
    }
    return ` ${name}="${this.escapeAttribute(value)}"`;
  }

  /**
   * Escape character data for HTML.
   *
   * @param {string} value - Text content
   * @returns {string} Escaped text
   */
  escapeText(value) {
    return escapeHtmlText(value);
  }

  /**
   * Escape an attribute value for HTML.
   *
   * @param {string} value - Attribute value
   * @returns {string} Escaped value
   */
  escapeAttribute(value) {
    return escapeHtmlAttribute(value);
  }
}
