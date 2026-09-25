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
 * @typedef {Object} KeyDefinition
 * @property {string} match - Pattern of the nodes to index
 * @property {string} use - Expression computing the key values
 * @property {Object<string, string>} [namespaces] - Prefixes in scope on the xsl:key element
 */

/**
 * @typedef {Object} KeyIndex
 * @property {Map<string, Node[]>} buckets - Key value to nodes, in document order
 * @property {Map<Node, number>} order - Document order position of every node
 */

/**
 * Lazily built, per-document indexes for all declared keys.
 */
export class KeyIndexRegistry {
  /**
   * @param {Object} options - Registry configuration
   * @param {Object<string, (KeyDefinition|KeyDefinition[])>} options.keys - Declared keys by name; several xsl:key elements may share a name
   * @param {(node: Node, pattern: string, definition: KeyDefinition) => boolean} options.matchesPattern - XSLT pattern matcher
   * @param {(node: Node, expression: string, definition: KeyDefinition) => string[]} options.evaluateUse - `use` evaluator returning key values
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

    const { buckets, order } = this.getIndex(name, doc);
    const wanted = Array.isArray(values) ? values : [values];
    if (wanted.length === 1) return [...(buckets.get(wanted[0]) || [])];

    const found = new Set();
    for (const value of wanted) {
      for (const node of buckets.get(value) || []) found.add(node);
    }
    return [...found].sort((a, b) => order.get(a) - order.get(b));
  }

  /**
   * Get (building if needed) the index of one key for one document.
   *
   * @param {string} name - The key name
   * @param {Document} doc - The document being indexed
   * @returns {KeyIndex} The index
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
   * Build the index of one key for one document, merging every declaration
   * of that key name.
   *
   * @param {string} name - The key name
   * @param {Document} doc - The document being indexed
   * @returns {KeyIndex} The index
   */
  buildIndex(name, doc) {
    const definitions = [this.keys[name]].flat();
    const buckets = new Map();
    const order = new Map();

    for (const node of documentOrderNodes(doc)) {
      order.set(node, order.size);

      for (const definition of definitions) {
        if (!this.matchesPattern(node, definition.match, definition)) continue;

        for (const value of this.evaluateUse(
          node,
          definition.use,
          definition,
        )) {
          const bucket = buckets.get(value);
          if (!bucket) buckets.set(value, [node]);
          else if (bucket[bucket.length - 1] !== node) bucket.push(node);
        }
      }
    }

    return { buckets, order };
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
