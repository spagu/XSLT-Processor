/**
 * XPath 1.0 node-set functions (section 4.1), plus `sum()` (4.4) and `lang()`
 * (4.3), which also take node-sets or walk the tree.
 *
 * Functions whose argument must be a node-set raise a type error for any other
 * value, as libxslt does ("count() expects a node-set"). A single node, which
 * is how this processor represents a result tree fragment, is accepted as a
 * node-set of that node: XSLT 1.0 forbids it, but libxslt accepts
 * `count($rtf)` and stylesheets rely on it.
 *
 * @module xpath/nodeSetFunctions
 */

"use strict";

import { splitXmlSpace } from "./strings.js";
import { parentOf } from "./axes.js";
import { NAMESPACE_NODE } from "./namespaceNodes.js";

/** Qualified name of the attribute read by `lang()`. */
const XML_LANG = "xml:lang";

/**
 * Whether a node has an expanded name made of a namespace URI and a local
 * part: elements and attributes (XPath 5.2, 5.3).
 *
 * @param {Node} node - Any node
 * @returns {boolean} True for element and attribute nodes
 */
function hasQualifiedName(node) {
  const type = node.nodeType;
  return type === 1 || type === 2;
}

/**
 * Whether a node has a name without a namespace part: processing
 * instructions (their target) and namespace nodes (their prefix).
 *
 * @param {Node} node - Any node
 * @returns {boolean} True for processing instruction and namespace nodes
 */
function hasLocalNameOnly(node) {
  const type = node.nodeType;
  return type === 7 || type === NAMESPACE_NODE;
}

/**
 * The element whose `xml:lang` decides the language of a node: the node
 * itself for an element, the element of an attribute or namespace node, the
 * parent of any other node.
 *
 * @param {Node} node - Context node
 * @returns {Node|null} The first node to inspect
 */
function languageStart(node) {
  return node.nodeType === 1 ? node : parentOf(node);
}

/**
 * Build the node-set functions for an evaluator.
 *
 * @param {import('./evaluator.js').XPathEvaluator} evaluator - The evaluator
 * @returns {Object<string, Function>} Functions by name
 */
export function createNodeSetFunctions(evaluator) {
  /**
   * Evaluate an argument that must be a node-set.
   *
   * @param {string} name - Function name, for the error message
   * @param {object} arg - Argument expression
   * @param {import('./evaluator.js').XPathContext} ctx - Evaluation context
   * @returns {Node[]} The node-set
   * @throws {TypeError} When the argument is not a node-set
   */
  const nodeSetArgument = (name, arg, ctx) => {
    const value = evaluator.evaluate(arg, ctx);
    if (Array.isArray(value)) return value;
    if (value?.nodeType) return [value];
    throw new TypeError(`${name}() expects a node-set`);
  };

  /**
   * The node a name function applies to: the context node without argument,
   * otherwise the first node of the node-set argument.
   *
   * @param {string} name - Function name, for the error message
   * @param {object[]} args - Argument expressions
   * @param {import('./evaluator.js').XPathContext} ctx - Evaluation context
   * @returns {Node|undefined} The node, undefined for an empty node-set
   */
  const nameTarget = (name, args, ctx) =>
    args.length === 0 ? ctx.node : nodeSetArgument(name, args[0], ctx)[0];

  return {
    count: (args, ctx) => nodeSetArgument("count", args[0], ctx).length,

    /**
     * `id(object)`: every whitespace separated token of the argument (of the
     * string value of every node, for a node-set) names an ID; the result is
     * in document order without duplicates.
     */
    id: (args, ctx) => {
      const value = evaluator.evaluate(args[0], ctx);
      const strings = Array.isArray(value)
        ? value.map((node) => evaluator.getStringValue(node))
        : [evaluator.toString(value)];
      const doc = ctx.node.ownerDocument || ctx.node;
      const found = new Set();
      for (const string of strings) {
        for (const token of splitXmlSpace(string)) {
          const element = doc.getElementById(token);
          if (element) found.add(element);
        }
      }
      return evaluator.sortByDocumentOrder([...found]);
    },

    "local-name": (args, ctx) => {
      const node = nameTarget("local-name", args, ctx);
      if (!node) return "";
      if (hasQualifiedName(node)) return node.localName;
      return hasLocalNameOnly(node) ? node.nodeName : "";
    },

    "namespace-uri": (args, ctx) => {
      const node = nameTarget("namespace-uri", args, ctx);
      return node && hasQualifiedName(node) ? node.namespaceURI || "" : "";
    },

    name: (args, ctx) => {
      const node = nameTarget("name", args, ctx);
      if (!node) return "";
      return hasQualifiedName(node) || hasLocalNameOnly(node)
        ? node.nodeName
        : "";
    },

    sum: (args, ctx) =>
      nodeSetArgument("sum", args[0], ctx).reduce(
        (total, node) =>
          total + evaluator.toNumber(evaluator.getStringValue(node)),
        0,
      ),

    /**
     * `lang(string)`: whether the `xml:lang` of the nearest element at or
     * above the context node (an attribute or text node looks from its
     * element) is the language or one of its sublanguages. A plain `lang`
     * attribute is not `xml:lang` and is ignored.
     */
    lang: (args, ctx) => {
      const wanted = evaluator.toString(evaluator.evaluate(args[0], ctx));
      const lang = wanted.toLowerCase();
      for (
        let node = languageStart(ctx.node);
        node?.nodeType === 1;
        node = node.parentNode
      ) {
        // The xml prefix is always bound to one namespace, so the qualified
        // name also finds attributes created without a namespace URI
        if (node.hasAttribute(XML_LANG)) {
          const actual = node.getAttribute(XML_LANG).toLowerCase();
          return actual === lang || actual.startsWith(`${lang}-`);
        }
      }
      return false;
    },
  };
}
