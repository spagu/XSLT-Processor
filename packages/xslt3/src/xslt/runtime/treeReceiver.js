/**
 * The receiver that builds the content of a node in a result tree
 * (XSLT 3.0 section 5.7.1, constructing complex content): adjacent
 * atomic values become text separated by spaces, document nodes are
 * replaced by their children, adjacent text is merged, attributes and
 * namespaces must come before children, and namespace declarations are
 * added where names need them.
 *
 * @module @tradik/xslt3/xslt/runtime/treeReceiver
 */

import { isArray, isAtomic, isFunctionItem } from "../../xdm/atomic.js";
import { canonicalString } from "../../xdm/lexical.js";
import { xsltError } from "../names.js";
import { copyNode } from "./copy.js";
import { DocumentContent } from "./documentContent.js";
import { NamespaceScope, prefixOf } from "./namespaceScope.js";

export { prefixOf };

/** Builds the children (and attributes) of an element or document. */
export class TreeReceiver extends NamespaceScope {
  /**
   * @param {Node} parent - Element, document or document fragment
   * @param {Map<string, string>} namespaces - In scope at the parent
   */
  constructor(parent, namespaces) {
    super(parent, namespaces);
    this.doc = parent.nodeType === 9 ? parent : parent.ownerDocument;
    this.hasChildren = false;
    this.lastAtomic = false;
    /** @type {boolean} the receiver of the top of a result tree */
    this.resultTree = false;
  }

  /**
   * Appends a child node.
   * @param {Node} node
   */
  append(node) {
    this.parent.appendChild(node);
    this.hasChildren = true;
    this.lastAtomic = false;
  }

  /**
   * Starts an element child.
   * @param {string} uri - Namespace URI, "" for none
   * @param {string} qname - Lexical name
   * @returns {TreeReceiver} the receiver of its content (`.parent` is it)
   */
  element(uri, qname) {
    const element = this.doc.createElementNS(uri || null, qname);
    this.append(element);
    const content = new TreeReceiver(element, this.namespaces);
    content.declare(prefixOf(qname), uri);
    return content;
  }

  /**
   * Checks that an attribute or namespace may be added now.
   * @param {string} what
   */
  checkAttributePosition(what) {
    if (this.parent.nodeType !== 1) {
      throw xsltError("XTDE0420", `A ${what} cannot be added to a document`);
    }
    if (this.hasChildren) {
      throw xsltError(
        "XTDE0410",
        `A ${what} cannot be added after the children of an element`,
      );
    }
  }

  /**
   * Adds an attribute (replacing one of the same name); its prefix is
   * changed when the element binds it to another namespace.
   * @param {string} uri
   * @param {string} qname
   * @param {string} value
   */
  attribute(uri, qname, value) {
    this.checkAttributePosition("attribute");
    let name = qname;
    if (uri) {
      let prefix = prefixOf(qname);
      const local = qname.slice(prefix.length ? prefix.length + 1 : 0);
      if (prefix === "" || !this.declare(prefix, uri)) {
        prefix = this.prefixFor(uri, prefix);
      }
      name = `${prefix}:${local}`;
      const existing = this.parent.getAttributeNodeNS(uri, local);
      if (existing) this.parent.removeAttributeNode(existing);
    }
    this.parent.setAttributeNS(uri || null, name, value);
    this.lastAtomic = false;
  }

  /**
   * Adds a namespace node.
   * @param {string} prefix
   * @param {string} uri
   */
  namespace(prefix, uri) {
    this.checkAttributePosition("namespace node");
    if (prefix === "" && this.parent.namespaceURI === null && uri !== "") {
      throw xsltError(
        "XTDE0440",
        "A default namespace cannot be added to an element in no namespace",
      );
    }
    if (
      !this.declareExplicit(prefix, uri) &&
      !(this.rebind(prefix, uri) && this.explicit.add(prefix))
    ) {
      throw xsltError(
        "XTDE0430",
        `The prefix "${prefix}" is already bound to another namespace`,
      );
    }
    this.lastAtomic = false;
  }

  /**
   * Adds text (merged with preceding text); zero-length text adds no node
   * but separates atomic values.
   * @param {string} text
   */
  text(text) {
    if (text === "") {
      this.lastAtomic = false;
      return;
    }
    const last = this.parent.lastChild;
    if (last && last.nodeType === 3) last.appendData(text);
    else this.append(this.doc.createTextNode(text));
    this.hasChildren = true;
    this.lastAtomic = false;
  }

  /** @param {string} text */
  comment(text) {
    this.append(this.doc.createComment(text));
  }

  /**
   * @param {string} target
   * @param {string} data
   */
  pi(target, data) {
    this.append(this.doc.createProcessingInstruction(target, data));
  }

  /** @param {import("../../xdm/atomic.js").AtomicValue} value */
  atomic(value) {
    const text = canonicalString(value);
    this.text(this.lastAtomic ? ` ${text}` : text);
    this.lastAtomic = true;
  }

  /**
   * Adds an item of a sequence: nodes are copied, arrays flattened.
   * @param {*} item
   */
  item(item) {
    if (isAtomic(item)) this.atomic(item);
    else if (isArray(item)) {
      for (const member of item.members) for (const x of member) this.item(x);
    } else if (isFunctionItem(item)) {
      // the top of a result tree is built by sequence normalization
      // (XSLT 3.0 section 2.3.6), whose error is SENR0001
      throw xsltError(
        this.resultTree ? "SENR0001" : "XTDE0450",
        "A function item cannot be added to a tree",
      );
    } else this.copy(item, true);
  }

  /**
   * Copies a node and its descendants.
   * @param {Node} node
   * @param {boolean} copyNamespaces
   */
  copy(node, copyNamespaces) {
    copyNode(node, this, copyNamespaces);
  }

  /** @returns {DocumentContent} the receiver of a document node's content */
  document() {
    this.lastAtomic = false;
    return new DocumentContent(this);
  }
}
