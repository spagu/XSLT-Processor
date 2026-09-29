/**
 * HTML Output Serializer
 *
 * Implements the `html` output method of XSLT 1.0 section 16.2 on top of the
 * XML writer: no XML declaration, no namespace declarations, void elements
 * without a closing slash, minimized boolean attributes and unescaped
 * script/style content.
 */

import {
  NODE_TYPE,
  PRESERVE_SPACE_ELEMENTS,
  RAW_TEXT_ELEMENTS,
  TEXT_MODE,
  URI_ATTRIBUTES,
  URI_ATTRIBUTES_OF_A,
} from "./constants.js";
import {
  escapeHtmlAttribute,
  escapeHtmlText,
  escapeUriAttribute,
} from "./escape.js";
import { htmlCharacterReference } from "./htmlEntities.js";
import { XmlWriter } from "./xmlSerializer.js";

/**
 * Whether a `head` element already declares the content type or character
 * set: a `meta` child with `http-equiv="Content-Type"` or a `charset`
 * attribute (names and the http-equiv value compared case-insensitively).
 *
 * @param {Element} head - The head element
 * @returns {boolean} True when no meta element has to be added
 */
function hasContentTypeMeta(head) {
  for (const child of head.childNodes) {
    if (
      child.nodeType !== NODE_TYPE.ELEMENT ||
      child.localName.toLowerCase() !== "meta"
    ) {
      continue;
    }
    for (const { name, value } of child.attributes) {
      const lower = name.toLowerCase();
      if (lower === "charset") return true;
      if (lower === "http-equiv" && value.toLowerCase() === "content-type") {
        return true;
      }
    }
  }
  return false;
}

/**
 * Whether the html output method %-escapes an attribute, as libxml2 does:
 * `href`, `action` and `src`, and `name` on `a` (names compared
 * case-insensitively), when neither the attribute nor its element is in a
 * namespace.
 *
 * @param {Attr} attribute - Attribute being written
 * @returns {boolean} True for URI attributes
 */
function isUriAttribute(attribute) {
  const element = attribute.ownerElement;
  if (attribute.namespaceURI || element.namespaceURI) return false;
  const name = attribute.localName.toLowerCase();
  return (
    URI_ATTRIBUTES.has(name) ||
    (URI_ATTRIBUTES_OF_A.has(name) && element.localName.toLowerCase() === "a")
  );
}

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
   * Boolean attributes are minimized to their name alone; URI attributes
   * are %-escaped (see isUriAttribute).
   *
   * @param {Attr} attribute - Attribute to write
   * @returns {string} Attribute markup, starting with a space
   */
  attributeMarkup(attribute) {
    const { name, value } = attribute;
    if (String(value).toLowerCase() === name.toLowerCase()) {
      return ` ${name}`;
    }
    const written = isUriAttribute(attribute)
      ? escapeUriAttribute(value)
      : value;
    return ` ${name}="${this.escapeAttribute(written)}"`;
  }

  /**
   * The content type `meta` element libxslt (and so Chrome) writes as the
   * first child of an HTML `head` element that does not already have one
   * (XSLT 1.0 section 16.2 recommends it). Firefox does not add it.
   *
   * @param {Element} element - Element being written
   * @returns {string} The meta element markup, or an empty string
   */
  leadingChildMarkup(element) {
    if (
      element.namespaceURI ||
      element.localName.toLowerCase() !== "head" ||
      hasContentTypeMeta(element)
    ) {
      return "";
    }
    const { mediaType, encoding } = this.settings;
    const content = `${mediaType || "text/html"}; charset=${encoding}`;
    return `<meta http-equiv="Content-Type" content="${this.escapeAttribute(content)}">`;
  }

  /**
   * Escape character data for HTML.
   *
   * @param {string} value - Text content
   * @returns {string} Escaped text
   */
  escapeText(value) {
    return this.encodeReferences(escapeHtmlText(value));
  }

  /**
   * Escape an attribute value for HTML.
   *
   * @param {string} value - Attribute value
   * @returns {string} Escaped value
   */
  escapeAttribute(value) {
    return this.encodeReferences(escapeHtmlAttribute(value));
  }

  /**
   * Reference to a character the output encoding cannot represent: an HTML
   * entity reference where HTML 4.01 has one, as libxslt writes.
   *
   * @param {number} codePoint - The code point
   * @returns {string} An entity or numeric character reference
   */
  characterReference(codePoint) {
    return htmlCharacterReference(codePoint);
  }
}
