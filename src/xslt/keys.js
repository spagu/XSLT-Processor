/**
 * `xsl:key` indexing for the XSLT `key()` function.
 *
 * Indexes are built lazily, once per (document, key name) pair, and cached in a
 * `WeakMap` so source documents stay garbage collectable. The registry is
 * deliberately decoupled from the engine: pattern matching and `use` evaluation
 * are injected as callbacks.
 */

"use strict";

/**
 * Lazily built, per-document indexes for all declared keys.
 */
export class KeyIndexRegistry {
  /**
   * @param {Object} options - Registry configuration
   * @param {Object<string, {match: string, use: string}>} options.keys - Declared keys by name
   * @param {(node: Node, pattern: string) => boolean} options.matchesPattern - XSLT pattern matcher
   * @param {(node: Node, expression: string) => string[]} options.evaluateUse - `use` evaluator returning key values
   */
  constructor({ keys, matchesPattern, evaluateUse }) {
    this.keys = keys;
    this.matchesPattern = matchesPattern;
    this.evaluateUse = evaluateUse;
    this.cache = new WeakMap();
  }

  /**
   * Drop every cached index, for example after the key declarations changed.
   *
   * @returns {void}
   *
   * @example
   * registry.clear();
   */
  clear() {
    this.cache = new WeakMap();
  }

  /**
   * Look up the nodes indexed under one or more key values.
   *
   * @param {string} name - The key name
   * @param {string|string[]} values - One key value, or several to union
   * @param {Document} doc - The document to search
   * @returns {Node[]} Matching nodes in document order, without duplicates
   * @throws {Error} When the key name was never declared
   *
   * @example
   * registry.lookup('byId', 'a1', xmlDoc);
   */
  lookup(name, values, doc) {
    if (!Object.hasOwn(this.keys, name)) {
      throw new Error(`Undefined key: ${name}`);
    }

    const index = this.getIndex(name, doc);
    const wanted = Array.isArray(values) ? values : [values];
    const result = [];

    for (const value of wanted) {
      for (const node of index.get(value) || []) {
        if (!result.includes(node)) result.push(node);
      }
    }

    return result;
  }

  /**
   * Get (building if needed) the index of one key for one document.
   *
   * @param {string} name - The key name
   * @param {Document} doc - The document being indexed
   * @returns {Map<string, Node[]>} Key value to nodes
   */
  getIndex(name, doc) {
    let byName = this.cache.get(doc);
    if (!byName) {
      byName = new Map();
      this.cache.set(doc, byName);
    }

    let index = byName.get(name);
    if (!index) {
      index = this.buildIndex(name, doc);
      byName.set(name, index);
    }

    return index;
  }

  /**
   * Build the index of one key for one document.
   *
   * @param {string} name - The key name
   * @param {Document} doc - The document being indexed
   * @returns {Map<string, Node[]>} Key value to nodes
   */
  buildIndex(name, doc) {
    const { match, use } = this.keys[name];
    const index = new Map();

    for (const node of documentOrderNodes(doc)) {
      if (!this.matchesPattern(node, match)) continue;

      for (const value of this.evaluateUse(node, use)) {
        const bucket = index.get(value);
        if (bucket) bucket.push(node);
        else index.set(value, [node]);
      }
    }

    return index;
  }
}

/**
 * Walk a document in document order, including attribute nodes.
 *
 * @param {Node} root - The document or subtree root
 * @yields {Node} Every node of the subtree
 */
function* documentOrderNodes(root) {
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    yield current;

    if (current.nodeType === 1 && current.attributes) {
      for (const attribute of current.attributes) yield attribute;
    }

    const children = current.childNodes;
    if (children) {
      for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
    }
  }
}
