/**
 * The receiver that collects the result of a sequence constructor as a
 * sequence (variables and parameters with `as`, function bodies,
 * xsl:sequence content...): constructed nodes are parentless, existing
 * nodes are kept as they are.
 *
 * @module @tradik/xslt3/xslt/runtime/sequenceReceiver
 */

import { NamespaceNode } from "../../xpath/eval/namespaceNodes.js";
import { copyNode } from "./copy.js";
import { prefixOf, TreeReceiver } from "./treeReceiver.js";

/** Collects items. */
export class SequenceReceiver {
  /**
   * @param {() => Document} scratch - Gives the document that owns new
   *   nodes
   */
  constructor(scratch) {
    this.scratch = scratch;
    /** @type {Array} the items received */
    this.items = [];
  }

  /**
   * @param {string} uri
   * @param {string} qname
   * @returns {TreeReceiver} the receiver of the new element's content
   */
  element(uri, qname) {
    const element = this.scratch().createElementNS(uri || null, qname);
    this.items.push(element);
    const content = new TreeReceiver(element, new Map());
    content.declare(prefixOf(qname), uri);
    content.onReplace = (old, renamed) => {
      this.items[this.items.indexOf(old)] = renamed;
    };
    return content;
  }

  /**
   * @param {string} uri
   * @param {string} qname
   * @param {string} value
   */
  attribute(uri, qname, value) {
    let name = qname;
    if (uri && !prefixOf(qname)) name = `ns0:${qname}`;
    const attribute = this.scratch().createAttributeNS(uri || null, name);
    attribute.value = value;
    attribute.nodeValue = value;
    this.items.push(attribute);
  }

  /**
   * @param {string} prefix
   * @param {string} uri
   */
  namespace(prefix, uri) {
    this.items.push(new NamespaceNode(null, prefix, uri));
  }

  /** @param {string} text */
  text(text) {
    this.items.push(this.scratch().createTextNode(text));
  }

  /** @param {string} text */
  comment(text) {
    this.items.push(this.scratch().createComment(text));
  }

  /**
   * @param {string} target
   * @param {string} data
   */
  pi(target, data) {
    this.items.push(this.scratch().createProcessingInstruction(target, data));
  }

  /** @param {*} item - Any item, kept as it is */
  item(item) {
    this.items.push(item);
  }

  /**
   * Adds a copy of a node.
   * @param {Node} node
   * @param {boolean} copyNamespaces
   */
  copy(node, copyNamespaces) {
    copyNode(node, this, copyNamespaces);
  }

  /** @returns {TreeReceiver} the receiver of a new document node */
  document() {
    const fragment = this.scratch().createDocumentFragment();
    this.items.push(fragment);
    return new TreeReceiver(fragment, new Map());
  }
}
