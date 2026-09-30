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
  getOutputEncoding,
  replaceUnencodable,
  splitUnencodable,
} from "./encoding.js";
import {
  collectNamespaceDeclarations,
  createNamespaceScope,
} from "./namespaces.js";
import { getIndentableChildren } from "./indent.js";
import { isRawText } from "./rawText.js";
import { findRootElement } from "./settings.js";
import { ChunkBuffer } from "./chunks.js";

/**
 * Make comment text well-formed: XSLT 1.0 section 7.4 recovery inserts a
 * space after any `-` followed by another `-` or ending the comment.
 *
 * @param {string} text - The comment text
 * @returns {string} Text without `--` and without a trailing `-`
 *
 * @example
 * safeCommentText("a--b-"); // "a- -b- "
 */
export function safeCommentText(text) {
  return text.replace(/-(?=-|$)/g, "- ");
}

/** What a writing step yields when no chunk is full yet. */
const NO_CHUNKS = Object.freeze([]);

export class BaseWriter {
  /**
   * @param {object} settings - Normalized output settings
   * @param {{xhtml?: boolean}} [options] - Dialect options
   */
  constructor(settings, options = {}) {
    this.settings = settings;
    this.xhtml = options.xhtml === true;
    this.buffer = new ChunkBuffer();
    this.encoding = getOutputEncoding(settings.encoding);
    this.reference = (codePoint) => this.characterReference(codePoint);
  }

  /**
   * Replace the characters the output encoding cannot represent with
   * references (XSLT 1.0 section 16.1). Only escaped character data and
   * attribute values go through here: comments, processing instructions and
   * unescaped text cannot hold references and are written unchanged.
   *
   * @param {string} text - Escaped text or attribute value
   * @returns {string} Text holding only representable characters
   */
  encodeReferences(text) {
    return replaceUnencodable(text, this.encoding, this.reference);
  }

  /**
   * Write text as CDATA sections. A character the output encoding cannot
   * represent ends the section and is written as a reference between two
   * sections, since a CDATA section cannot hold references.
   *
   * @param {string} value - Text content
   * @returns {string} CDATA sections and references
   */
  cdataMarkup(value) {
    return splitUnencodable(value, this.encoding)
      .map(({ text, representable }) =>
        representable ? wrapCdata(text) : this.reference(text.codePointAt(0)),
      )
      .join("");
  }

  /**
   * Serialize a result tree node.
   *
   * @param {Node} node - Document, fragment or element to serialize
   * @returns {string} Serialized output
   */
  serialize(node) {
    let output = "";
    for (const chunk of this.chunks(node, Infinity)) output += chunk;
    return output;
  }

  /**
   * Serialize a result tree node incrementally: a chunk is yielded as soon
   * as `chunkSize` code units are written, so the first bytes are available
   * before the whole tree has been written and the output is never held as
   * one string.
   *
   * @param {Node} node - Document, fragment or element to serialize
   * @param {number} [chunkSize] - Chunk size in UTF-16 code units (see
   *   chunks.js); Infinity yields the whole output as one chunk
   * @yields {string} Non-empty chunks of at most `chunkSize` code units (one
   *   more when a surrogate pair straddles the boundary)
   * @returns {Generator<string, void, void>} The chunks, in order
   */
  *chunks(node, chunkSize) {
    this.buffer = new ChunkBuffer(chunkSize);
    this.writeProlog(node);
    yield* this.writeNode(node, createNamespaceScope(), 0, TEXT_MODE.ESCAPE);
    yield* this.buffer.take(true);
  }

  /**
   * Append markup to the output.
   *
   * @param {string} text - Markup
   * @returns {void}
   */
  write(text) {
    this.buffer.write(text);
  }

  /**
   * Yield the full chunks buffered so far. Called between nodes; a no-op
   * (no generator created) while the buffer is not full.
   *
   * @returns {Iterable<string>} Full chunks, possibly none
   */
  flush() {
    return this.buffer.full ? this.buffer.take() : NO_CHUNKS;
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
      this.write(
        `<?xml version="${version}" encoding="${encoding}"${standalonePart}?>\n`,
      );
    }

    const doctype = this.doctypeMarkup(findRootElement(node));
    if (doctype) {
      this.write(`${doctype}\n`);
    }
  }

  /**
   * Write any result tree node. Leaves (character data, comments, processing
   * instructions) are written at once; elements and result roots return the
   * generator writing them, so no generator is created per leaf.
   *
   * @param {Node} node - Node to write
   * @param {Map<string, string>} scope - Namespace scope in effect
   * @param {number} depth - Current indentation depth
   * @param {string} textMode - {@link TEXT_MODE} for character data children
   * @returns {Iterable<string>} Full chunks to yield (see {@link BaseWriter#chunks})
   */
  writeNode(node, scope, depth, textMode) {
    switch (node.nodeType) {
      case NODE_TYPE.ELEMENT:
        return this.writeElement(node, scope, depth);
      case NODE_TYPE.TEXT:
      case NODE_TYPE.CDATA_SECTION:
        this.writeText(node, textMode);
        break;
      case NODE_TYPE.COMMENT:
        this.write(`<!--${safeCommentText(node.nodeValue)}-->`);
        break;
      case NODE_TYPE.PROCESSING_INSTRUCTION:
        this.writeProcessingInstruction(node);
        break;
      case NODE_TYPE.DOCUMENT:
      case NODE_TYPE.DOCUMENT_FRAGMENT:
        return this.writeTopLevelNodes(node, scope, depth, textMode);
      default:
        break;
    }
    return NO_CHUNKS;
  }

  /**
   * Write the children of the result root (document or fragment), with a
   * line break after a comment that another node follows when the dialect
   * asks for it (`topLevelLineBreaks`).
   *
   * @param {Node} node - The result root
   * @param {Map<string, string>} scope - Namespace scope in effect
   * @param {number} depth - Current indentation depth
   * @param {string} textMode - {@link TEXT_MODE} for character data children
   * @returns {void}
   */
  *writeTopLevelNodes(node, scope, depth, textMode) {
    for (const child of node.childNodes) {
      yield* this.writeNode(child, scope, depth, textMode);
      const breaks =
        this.topLevelLineBreaks &&
        child.nodeType === NODE_TYPE.COMMENT &&
        child.nextSibling;
      if (breaks) this.write("\n");
      yield* this.flush();
    }
  }

  /**
   * Write every child of a node without adding whitespace.
   *
   * In CDATA mode (`cdata-section-elements`), adjacent character data nodes
   * are one text node of the XPath data model, so they are written as one
   * CDATA section, as libxslt does, not one section per DOM node; text
   * written with `disable-output-escaping` ends the run.
   *
   * @param {Node} node - Parent node
   * @param {Map<string, string>} scope - Namespace scope in effect
   * @param {number} depth - Current indentation depth
   * @param {string} textMode - {@link TEXT_MODE} for character data children
   * @returns {void}
   */
  *writeChildNodes(node, scope, depth, textMode) {
    let run = "";
    for (const child of node.childNodes) {
      const type = child.nodeType;
      const joins =
        textMode === TEXT_MODE.CDATA &&
        (type === NODE_TYPE.TEXT || type === NODE_TYPE.CDATA_SECTION) &&
        !isRawText(child);
      if (joins) {
        run += child.nodeValue;
        continue;
      }
      if (run) this.write(this.cdataMarkup(run));
      run = "";
      yield* this.writeNode(child, scope, depth, textMode);
      yield* this.flush();
    }
    if (run) this.write(this.cdataMarkup(run));
  }

  /**
   * Write an element with its namespaces, attributes and children.
   *
   * @param {Element} element - Element to write
   * @param {Map<string, string>} scope - Namespace scope inherited from the parent
   * @param {number} depth - Current indentation depth
   * @returns {void}
   */
  *writeElement(element, scope, depth) {
    const namespaces = collectNamespaceDeclarations(element, scope);
    const name = element.nodeName;

    this.write(
      `<${name}${this.namespaceMarkup(namespaces.declarations, element)}` +
        this.attributesMarkup(element),
    );

    const leading = this.leadingChildMarkup(element);
    if (!element.firstChild && !leading) {
      this.write(this.emptyElementMarkup(element, name));
      return;
    }

    this.write(">");
    yield* this.writeElementChildren(element, namespaces.scope, depth, leading);
    this.write(`</${name}>`);
  }

  /**
   * Write the children of an element, indenting element-only content.
   *
   * @param {Element} element - Parent element
   * @param {Map<string, string>} scope - Namespace scope in effect
   * @param {number} depth - Depth of the parent element
   * @param {string} [leading] - Markup the serializer adds before the
   *   children, indented like a child (see leadingChildMarkup)
   * @returns {void}
   */
  *writeElementChildren(element, scope, depth, leading = "") {
    const textMode = this.childTextMode(element);
    const indentable = this.indentableChildren(element, textMode);

    if (!indentable) {
      this.write(leading);
      yield* this.writeChildNodes(element, scope, depth, textMode);
      return;
    }

    const childIndent = `\n${INDENT_UNIT.repeat(depth + 1)}`;
    if (leading) this.write(childIndent + leading);
    for (const child of indentable) {
      this.write(childIndent);
      yield* this.writeNode(child, scope, depth + 1, textMode);
      yield* this.flush();
    }
    this.write(`\n${INDENT_UNIT.repeat(depth)}`);
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
   * @param {Element} [_element] - The element they are written on
   * @returns {string} Attribute markup, starting with a space when non-empty
   */
  namespaceMarkup(declarations, _element) {
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
      this.write(value);
      return;
    }

    const mode = this.resolveTextMode(node, textMode);
    if (mode === TEXT_MODE.CDATA) {
      this.write(this.cdataMarkup(value));
    } else if (mode === TEXT_MODE.RAW) {
      this.write(value);
    } else {
      this.write(this.escapeText(value));
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
    this.write(`<?${node.target}${separator}${data}${this.piTerminator}`);
  }
}
