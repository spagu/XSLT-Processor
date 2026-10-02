/**
 * The markup writer of the xml, xhtml and html output methods: writes the
 * normalized sequence (see sequence.js) as markup, with the method's rules
 * from dialect.js.
 *
 * The walk is iterative: every element whose children are being written
 * is a frame on an explicit stack, so a tree nested deeper than the
 * JavaScript call stack allows is written like any other, and the output
 * is handed out in chunks as it grows.
 *
 * @module @tradik/xslt3/serialize/markup/writer
 */

import { Expander } from "../output/expander.js";
import {
  checkDocument,
  childList,
  escapeNamespaceUri,
  isWhitespace,
} from "./content.js";
import { Dialect } from "./dialect.js";
import { fixupElement, XML_NAMESPACE } from "./namespaces.js";
import { contentTypeMeta, doctype, xmlDeclaration } from "./prolog.js";

/** Indentation added per level. */
const INDENT = "  ";

/** Writes markup for one serialization. */
export class MarkupWriter {
  /**
   * @param {import("../params/settings.js").Settings} settings
   * @param {import("../output/buffer.js").OutputBuffer} buffer
   */
  constructor(settings, buffer) {
    this.settings = settings;
    this.buffer = buffer;
    this.expander = new Expander(settings);
    this.dialect = new Dialect(settings);
    this.doctypePending = true;
    this.fixup = {
      top: true,
      unprefixed: this.dialect.unprefixed,
      undeclare: settings.undeclarePrefixes && settings.version === "1.1",
    };
  }

  /** @param {string} text - Markup */
  write(text) {
    this.buffer.write(text);
  }

  /**
   * Writes the normalized sequence.
   * @param {Array<string|Node>} entries - From normalizeSequence
   * @yields {string} chunks of output, when the buffer is full
   * @returns {Generator<string, void, void>}
   */
  *run(entries) {
    checkDocument(entries, this.settings);
    const declaration = xmlDeclaration(this.settings);
    const indent = this.settings.indent;
    const indentTop = indent && !entries.some((e) => typeof e === "string");
    this.write(declaration && indent ? `${declaration}\n` : declaration);
    const top = { depth: -1, scope: new Map(), preserve: false };
    for (let i = 0; i < entries.length; i++) {
      if (indentTop && i > 0) this.write("\n");
      const entry = entries[i];
      if (typeof entry === "string") this.write(this.expander.text(entry));
      else if (entry.nodeType === 1) yield* this.tree(entry, top);
      else this.leaf(entry, "escape");
      if (this.buffer.full) yield this.buffer.take();
    }
  }

  /**
   * Writes an element and its descendants.
   * @param {Element} element
   * @param {object} top - The frame of the document
   * @yields {string} chunks of output
   * @returns {Generator<string, void, void>}
   */
  *tree(element, top) {
    const stack = [];
    const root = this.openElement(element, top);
    if (root) stack.push(root);
    while (stack.length) {
      const frame = stack[stack.length - 1];
      if (frame.index === frame.children.length) {
        stack.pop();
        this.write(frame.end);
        continue;
      }
      const child = frame.children[frame.index++];
      if (frame.indent) this.write(`\n${INDENT.repeat(frame.depth + 1)}`);
      if (typeof child === "object" && child.nodeType === 1) {
        const opened = this.openElement(child, frame);
        if (opened) stack.push(opened);
      } else {
        this.leaf(child, frame.textMode);
      }
      if (this.buffer.full) yield this.buffer.take();
    }
  }

  /**
   * Writes character data, a comment or a processing instruction.
   * @param {string|Node} node
   * @param {"escape"|"cdata"|"raw"} textMode
   */
  leaf(node, textMode) {
    const { expander } = this;
    if (typeof node === "string") {
      this.write(expander[textMode === "escape" ? "text" : textMode](node));
    } else if (node.nodeType === 8) {
      this.write(`<!--${expander.unescaped(node.nodeValue)}-->`);
    } else {
      this.write(this.dialect.processingInstruction(node, expander));
    }
  }

  /**
   * Writes the start tag of an element, or the whole element when it is
   * empty.
   * @param {Element} element
   * @param {object} parent - Frame of the parent
   * @returns {object|null} the frame of its children, null when empty
   */
  openElement(element, parent) {
    const { dialect, settings } = this;
    this.fixup.top = parent.depth < 0;
    const fixed = fixupElement(element, parent.scope, this.fixup);
    const info = dialect.describe(element, fixed);
    if (this.doctypePending) {
      this.doctypePending = false;
      const declaration = doctype(settings, fixed.name);
      if (declaration) this.write(`${declaration}\n`);
    }
    let tag = `<${this.expander.unescaped(fixed.name)}`;
    for (const [prefix, uri] of fixed.declarations) {
      tag += ` xmlns${prefix ? `:${prefix}` : ""}="${escapeNamespaceUri(uri)}"`;
    }
    for (const attribute of fixed.attributes) {
      tag += dialect.attribute(info, attribute, this.expander);
    }
    const head =
      info.isHtml && info.lower === "head" && settings.includeContentType;
    let children = childList(element, head);
    const leading = head ? contentTypeMeta(settings) : "";
    if (!children.length && !leading) {
      this.write(tag + dialect.emptyElement(info));
      return null;
    }
    this.write(`${tag}>`);
    const space = element.getAttributeNS?.(XML_NAMESPACE, "space");
    const preserve =
      space === "preserve" || (space !== "default" && parent.preserve);
    const suppressed = parent.suppressed || dialect.suppressesIndent(info);
    const textMode = dialect.textMode(info);
    const indent =
      settings.indent &&
      !preserve &&
      !suppressed &&
      textMode !== "raw" &&
      children.some((child) => typeof child !== "string") &&
      children.every((c) => typeof c !== "string" || isWhitespace(c)) &&
      dialect.allowsIndent(children);
    if (indent) children = children.filter((c) => typeof c !== "string");
    const depth = parent.depth + 1;
    const lineStart = indent ? `\n${INDENT.repeat(depth)}` : "";
    if (leading) this.write(indent ? lineStart + INDENT + leading : leading);
    return {
      children,
      index: 0,
      indent,
      depth,
      scope: fixed.scope,
      textMode,
      preserve,
      suppressed,
      end: `${lineStart}</${fixed.name}>`,
    };
  }
}
