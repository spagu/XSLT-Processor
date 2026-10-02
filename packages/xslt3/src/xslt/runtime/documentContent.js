/**
 * The content of a document node added to a tree (XSLT 3.0 section
 * 5.7.1): its children go to the enclosing node, but attributes and
 * namespaces are errors (XTDE0420).
 *
 * @module @tradik/xslt3/xslt/runtime/documentContent
 */

import { isAtomic } from "../../xdm/atomic.js";
import { canonicalString } from "../../xdm/lexical.js";
import { xsltError } from "../names.js";
import { copyNode } from "./copy.js";

/** Receives the content of a document node inside a tree. */
export class DocumentContent {
  /** @param {object} target - Receiver of the enclosing node's content */
  constructor(target) {
    this.target = target;
    this.lastAtomic = false;
  }

  /**
   * @param {string} uri
   * @param {string} qname
   * @returns {object} the receiver of the new element's content
   */
  element(uri, qname) {
    this.lastAtomic = false;
    return this.target.element(uri, qname);
  }

  /** Raises XTDE0420. */
  attribute() {
    throw xsltError("XTDE0420", "A document node cannot have attributes");
  }

  /** Raises XTDE0420. */
  namespace() {
    throw xsltError("XTDE0420", "A document node cannot have namespaces");
  }

  /** @param {string} text */
  text(text) {
    this.lastAtomic = false;
    this.target.text(text);
  }

  /** @param {string} text */
  comment(text) {
    this.lastAtomic = false;
    this.target.comment(text);
  }

  /**
   * @param {string} target
   * @param {string} data
   */
  pi(target, data) {
    this.lastAtomic = false;
    this.target.pi(target, data);
  }

  /** @param {*} value - An atomic value */
  atomic(value) {
    const text = canonicalString(value);
    this.target.text(this.lastAtomic ? ` ${text}` : text);
    this.lastAtomic = true;
  }

  /** @param {*} item */
  item(item) {
    if (isAtomic(item)) this.atomic(item);
    else if (typeof item?.nodeType === "number") this.copy(item, true);
    else {
      this.lastAtomic = false;
      this.target.item(item);
    }
  }

  /**
   * @param {Node} node
   * @param {boolean} copyNamespaces
   */
  copy(node, copyNamespaces) {
    copyNode(node, this, copyNamespaces);
  }

  /** @returns {DocumentContent} itself */
  document() {
    this.lastAtomic = false;
    return this;
  }
}
