/**
 * Result Tree Writer
 *
 * Walks a result tree and turns it into markup. Everything that differs
 * between the xml, xhtml and html output methods of XSLT 1.0 section 16 is
 * delegated to the dialect hooks implemented by the concrete writers.
 */

import {
  INDENT_UNIT,
  NODE_TYPE,
  TEXT_MODE,
  XMLNS_NAMESPACE,
} from "./constants.js";
import { wrapCdata } from "./escape.js";
import {
  collectNamespaceDeclarations,
  createNamespaceScope,
} from "./namespaces.js";
import { getIndentableChildren } from "./indent.js";
import { isRawText } from "./rawText.js";
import { findRootElement } from "./settings.js";

export class BaseWriter {
  /**
   * @param {object} settings - Normalized output settings
   * @param {{xhtml?: boolean}} [options] - Dialect options
   */
  constructor(settings, options = {}) {
    this.settings = settings;
    this.xhtml = options.xhtml === true;
    this.parts = [];
  }

  /**
   * Serialize a result tree node.
   *
   * @param {Node} node - Document, fragment or element to serialize
   * @returns {string} Serialized output
   */
  serialize(node) {
    this.parts = [];
    this.writeProlog(node);
    this.writeNode(node, createNamespaceScope(), 0, TEXT_MODE.ESCAPE);
    return this.parts.join("");
  }

  /**
   * Write the XML declaration and the document type declaration.
   *
   * @param {Node} node - Result tree root
   * @returns {void}
   */
  writeProlog(node) {
    if (this.emitsXmlDeclaration) {
      const { version, encoding, standalone } = this.settings;
      const standalonePart = standalone ? ` standalone="${standalone}"` : "";
      this.parts.push(
        `<?xml version="${version}" encoding="${encoding}"${standalonePart}?>\n`,
      );
    }

    const doctype = this.doctypeMarkup(findRootElement(node));
    if (doctype) {
      this.parts.push(`${doctype}\n`);
    }
  }

  /**
   * Write any result tree node.
   *
   * @param {Node} node - Node to write
   * @param {Map<string, string>} scope - Namespace scope in effect
   * @param {number} depth - Current indentation depth
   * @param {string} textMode - {@link TEXT_MODE} for character data children
   * @returns {void}
   */
  writeNode(node, scope, depth, textMode) {
    switch (node.nodeType) {
      case NODE_TYPE.ELEMENT:
        this.writeElement(node, scope, depth);
        break;
      case NODE_TYPE.TEXT:
      case NODE_TYPE.CDATA_SECTION:
        this.writeText(node, textMode);
        break;
      case NODE_TYPE.COMMENT:
        this.parts.push(`<!--${node.nodeValue}-->`);
        break;
      case NODE_TYPE.PROCESSING_INSTRUCTION:
        this.writeProcessingInstruction(node);
        break;
      case NODE_TYPE.DOCUMENT:
      case NODE_TYPE.DOCUMENT_FRAGMENT:
        this.writeChildNodes(node, scope, depth, textMode);
        break;
      default:
        break;
    }
  }

  /**
   * Write every child of a node without adding whitespace.
   *
   * @param {Node} node - Parent node
   * @param {Map<string, string>} scope - Namespace scope in effect
   * @param {number} depth - Current indentation depth
   * @param {string} textMode - {@link TEXT_MODE} for character data children
   * @returns {void}
   */
  writeChildNodes(node, scope, depth, textMode) {
    for (const child of node.childNodes) {
      this.writeNode(child, scope, depth, textMode);
    }
  }

  /**
   * Write an element with its namespaces, attributes and children.
   *
   * @param {Element} element - Element to write
   * @param {Map<string, string>} scope - Namespace scope inherited from the parent
   * @param {number} depth - Current indentation depth
   * @returns {void}
   */
  writeElement(element, scope, depth) {
    const namespaces = this.emitsNamespaces
      ? collectNamespaceDeclarations(element, scope)
      : { declarations: [], scope };
    const name = element.nodeName;

    this.parts.push(
      `<${name}${this.namespaceMarkup(namespaces.declarations)}` +
        this.attributesMarkup(element),
    );

    if (!element.firstChild) {
      this.parts.push(this.emptyElementMarkup(element, name));
      return;
    }

    this.parts.push(">");
    this.writeElementChildren(element, namespaces.scope, depth);
    this.parts.push(`</${name}>`);
  }

  /**
   * Write the children of an element, indenting element-only content.
   *
   * @param {Element} element - Parent element
   * @param {Map<string, string>} scope - Namespace scope in effect
   * @param {number} depth - Depth of the parent element
   * @returns {void}
   */
  writeElementChildren(element, scope, depth) {
    const textMode = this.childTextMode(element);
    const indentable = this.indentableChildren(element, textMode);

    if (!indentable) {
      this.writeChildNodes(element, scope, depth, textMode);
      return;
    }

    const childIndent = `\n${INDENT_UNIT.repeat(depth + 1)}`;
    for (const child of indentable) {
      this.parts.push(childIndent);
      this.writeNode(child, scope, depth + 1, textMode);
    }
    this.parts.push(`\n${INDENT_UNIT.repeat(depth)}`);
  }

  /**
   * Determine the children to indent inside an element.
   *
   * @param {Element} element - Parent element
   * @param {string} textMode - {@link TEXT_MODE} for character data children
   * @returns {Node[]|null} Children to indent, or null when indenting is off
   */
  indentableChildren(element, textMode) {
    if (!this.settings.indent || textMode !== TEXT_MODE.ESCAPE) {
      return null;
    }
    if (!this.allowsIndentInside(element)) {
      return null;
    }
    return getIndentableChildren(element);
  }

  /**
   * Build the namespace declaration markup of an element.
   *
   * @param {Array<{prefix: string, uri: string}>} declarations - Declarations
   * @returns {string} Attribute markup, starting with a space when non-empty
   */
  namespaceMarkup(declarations) {
    return declarations
      .map(({ prefix, uri }) => {
        const name = prefix ? `xmlns:${prefix}` : "xmlns";
        return ` ${name}="${this.escapeAttribute(uri)}"`;
      })
      .join("");
  }

  /**
   * Build the attribute markup of an element, skipping namespace declarations.
   *
   * @param {Element} element - Element being written
   * @returns {string} Attribute markup, starting with a space when non-empty
   */
  attributesMarkup(element) {
    let markup = "";
    for (const attribute of Array.from(element.attributes || [])) {
      if (attribute.namespaceURI !== XMLNS_NAMESPACE) {
        markup += this.attributeMarkup(attribute);
      }
    }
    return markup;
  }

  /**
   * Build the markup of a single attribute.
   *
   * @param {Attr} attribute - Attribute to write
   * @returns {string} Attribute markup, starting with a space
   */
  attributeMarkup(attribute) {
    return ` ${attribute.name}="${this.escapeAttribute(attribute.value)}"`;
  }

  /**
   * Write a character data node.
   *
   * Nodes produced with `disable-output-escaping="yes"` are written verbatim.
   *
   * @param {Node} node - Text or CDATA section node
   * @param {string} textMode - {@link TEXT_MODE} requested by the parent
   * @returns {void}
   */
  writeText(node, textMode) {
    const value = node.nodeValue || "";

    if (isRawText(node)) {
      this.parts.push(value);
      return;
    }

    const mode = this.resolveTextMode(node, textMode);
    if (mode === TEXT_MODE.CDATA) {
      this.parts.push(wrapCdata(value));
    } else if (mode === TEXT_MODE.RAW) {
      this.parts.push(value);
    } else {
      this.parts.push(this.escapeText(value));
    }
  }

  /**
   * Resolve the effective text mode of a character data node.
   *
   * @param {Node} node - Text or CDATA section node
   * @param {string} textMode - {@link TEXT_MODE} requested by the parent
   * @returns {string} A {@link TEXT_MODE} value
   */
  resolveTextMode(node, textMode) {
    if (textMode !== TEXT_MODE.ESCAPE) {
      return textMode;
    }
    return node.nodeType === NODE_TYPE.CDATA_SECTION
      ? this.cdataNodeMode
      : TEXT_MODE.ESCAPE;
  }

  /**
   * Write a processing instruction node.
   *
   * @param {ProcessingInstruction} node - Node to write
   * @returns {void}
   */
  writeProcessingInstruction(node) {
    const data = node.nodeValue || "";
    const separator = data ? " " : "";
    this.parts.push(`<?${node.target}${separator}${data}${this.piTerminator}`);
  }
}
