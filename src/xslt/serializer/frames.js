/**
 * Open Node Frames
 *
 * The writer walks the result tree without recursion: every element (and
 * the result root) whose children are being written is a frame on an
 * explicit stack, so the depth of the tree is bounded by memory, not by the
 * JavaScript call stack. A frame hands out its children one at a time
 * ({@link ContentFrame#nextChild}) and knows the markup that closes it
 * (`end`), written when it has no child left.
 *
 * Three kinds of content exist, as in XSLT 1.0 section 16 output:
 * - {@link ContentFrame}: children written as they are, adjacent character
 *   data joined into one CDATA section in `cdata-section-elements`;
 * - {@link TopLevelFrame}: the children of the result root (document or
 *   fragment), with libxslt's line break after a top-level comment;
 * - {@link IndentFrame}: element-only content, each child on its own
 *   indented line (`indent="yes"`).
 *
 * @module xslt/serializer/frames
 */

import { INDENT_UNIT, NODE_TYPE, TEXT_MODE } from "./constants.js";
import { isRawText } from "./rawText.js";

/**
 * Children of a node written without adding whitespace.
 *
 * In CDATA mode (`cdata-section-elements`), adjacent character data nodes
 * are one text node of the XPath data model, so they are written as one
 * CDATA section, as libxslt does, not one section per DOM node; text
 * written with `disable-output-escaping` ends the run.
 */
export class ContentFrame {
  /**
   * @param {Node} parent - Node whose children are written
   * @param {Map<string, string>} scope - Namespace scope for the children
   * @param {number} depth - Indentation depth of the children
   * @param {string} textMode - {@link TEXT_MODE} for character data children
   * @param {string} end - Markup written once every child is written
   */
  constructor(parent, scope, depth, textMode, end) {
    this.scope = scope;
    this.depth = depth;
    this.textMode = textMode;
    this.end = end;
    this.next = parent.firstChild;
    this.joinsText = textMode === TEXT_MODE.CDATA;
  }

  /**
   * Whether a child joins the pending CDATA run instead of being written.
   *
   * @param {Node} child - Child node
   * @returns {boolean} True for escaped character data in CDATA mode
   */
  joins(child) {
    const type = child.nodeType;
    return (
      (type === NODE_TYPE.TEXT || type === NODE_TYPE.CDATA_SECTION) &&
      !isRawText(child)
    );
  }

  /**
   * The next child to write. In CDATA mode the character data before it is
   * written first, as one CDATA section.
   *
   * @param {import('./baseWriter.js').BaseWriter} writer - The writer
   * @returns {Node|null} The child, or null when every child is written
   */
  nextChild(writer) {
    let child = this.next;
    if (this.joinsText) {
      let run = "";
      while (child && this.joins(child)) {
        run += child.nodeValue;
        child = child.nextSibling;
      }
      if (run) writer.write(writer.cdataMarkup(run));
    }
    this.next = child ? child.nextSibling : null;
    return child;
  }
}

/**
 * Children of the result root (document or fragment). A line break follows
 * a comment that another node follows when the dialect asks for it
 * (`topLevelLineBreaks`); comments are leaves, so the break is written just
 * before that next node.
 */
export class TopLevelFrame extends ContentFrame {
  /**
   * @param {Node} parent - The result root
   * @param {Map<string, string>} scope - Namespace scope for the children
   * @param {number} depth - Indentation depth of the children
   * @param {string} textMode - {@link TEXT_MODE} for character data children
   * @param {boolean} lineBreaks - Whether a top-level comment ends a line
   */
  constructor(parent, scope, depth, textMode, lineBreaks) {
    super(parent, scope, depth, textMode, "");
    this.lineBreaks = lineBreaks;
    this.afterComment = false;
  }

  /**
   * The next top-level node, preceded by a line break after a comment.
   *
   * @param {import('./baseWriter.js').BaseWriter} writer - The writer
   * @returns {Node|null} The child, or null when every child is written
   */
  nextChild(writer) {
    const child = super.nextChild(writer);
    if (child && this.afterComment) writer.write("\n");
    this.afterComment =
      this.lineBreaks && child?.nodeType === NODE_TYPE.COMMENT;
    return child;
  }
}

/**
 * Element-only content written with `indent="yes"`: each child starts a new
 * line indented one level deeper than the parent, and the end tag of the
 * parent starts a line at the parent's own indentation.
 */
export class IndentFrame {
  /**
   * @param {Node[]} children - Children to indent (see indent.js)
   * @param {Map<string, string>} scope - Namespace scope for the children
   * @param {number} depth - Indentation depth of the parent element
   * @param {string} textMode - {@link TEXT_MODE} for character data children
   * @param {string} endTag - End tag of the parent element
   */
  constructor(children, scope, depth, textMode, endTag) {
    this.children = children;
    this.index = 0;
    this.scope = scope;
    this.depth = depth + 1;
    this.textMode = textMode;
    this.lineStart = IndentFrame.lineStart(this.depth);
    this.end = IndentFrame.lineStart(depth) + endTag;
  }

  /**
   * A line break followed by the indentation of a depth.
   *
   * @param {number} depth - Indentation depth
   * @returns {string} The line start
   *
   * @example
   * IndentFrame.lineStart(2); // "\n    "
   */
  static lineStart(depth) {
    return `\n${INDENT_UNIT.repeat(depth)}`;
  }

  /**
   * The next child to write, on a new indented line.
   *
   * @param {import('./baseWriter.js').BaseWriter} writer - The writer
   * @returns {Node|null} The child, or null when every child is written
   */
  nextChild(writer) {
    if (this.index === this.children.length) return null;
    writer.write(this.lineStart);
    return this.children[this.index++];
  }
}
