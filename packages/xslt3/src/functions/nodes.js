/**
 * Functions on nodes (F&O 3.1 section 13): names, root, children,
 * innermost/outermost, generate-id and lang. Functions with an optional
 * node argument use the context item when it is omitted.
 *
 * @module @tradik/xslt3/functions/nodes
 */

import { AtomicValue } from "../xdm/atomic.js";
import { QNameValue } from "../xdm/qname.js";
import { types } from "../xdm/types.js";
import { booleanItem, stringItem } from "../xpath/eval/atomics.js";
import {
  childrenOf,
  nodeLocalName,
  nodeNamespace,
  nodePrefix,
  parentOf,
  rootOf,
} from "../xpath/eval/domNodes.js";
import { focusNode } from "./focus.js";
import { nodePathFunctions } from "./nodePaths.js";

/**
 * Definitions of a function of an optional node, with the context node as
 * default (arity 0 and 1).
 * @param {string} local
 * @param {string} returns
 * @param {(node: Node|undefined, context: object) => Array} impl - Called
 *   with undefined for an empty argument
 * @returns {object[]}
 */
export function nodeFunction(local, returns, impl) {
  return [
    {
      local,
      params: [],
      returns,
      focus: true,
      impl: (_, context) => impl(focusNode(context), context),
    },
    {
      local,
      params: ["node()?"],
      returns,
      impl: ([arg], context) => impl(arg[0], context),
    },
  ];
}

/** @param {Node} node @returns {boolean} whether the node kind has a name */
const isNamed = (node) =>
  [1, 2, 7].includes(node.nodeType) ||
  (node.nodeType === 13 && node.localName !== "");

/** @param {Node} node @returns {string} the lexical QName of a node */
function lexicalName(node) {
  if (!isNamed(node)) return "";
  const prefix = nodePrefix(node);
  const local = nodeLocalName(node);
  return prefix ? `${prefix}:${local}` : local;
}

/** @type {WeakMap<object, string>} */
const ids = new WeakMap();
let nextId = 0;

/**
 * @param {Node} node
 * @returns {string} an identifier unique to the node
 */
function generateId(node) {
  let id = ids.get(node);
  if (id === undefined) {
    id = `n${nextId++}`;
    ids.set(node, id);
  }
  return id;
}

/**
 * fn:lang: whether the xml:lang of a node matches a language.
 * @param {string} language
 * @param {Node} node
 * @returns {boolean}
 */
function matchesLanguage(language, node) {
  const xml = "http://www.w3.org/XML/1998/namespace";
  for (let n = node; n; n = parentOf(n)) {
    const value = n.nodeType === 1 ? n.getAttributeNS(xml, "lang") : null;
    if (value !== null && n.hasAttributeNS(xml, "lang")) {
      const actual = value.toLowerCase();
      const wanted = language.toLowerCase();
      return actual === wanted || actual.startsWith(`${wanted}-`);
    }
  }
  return false;
}

/**
 * The topmost or bottommost nodes of a set.
 * @param {Node[]} nodes
 * @param {object} context
 * @param {boolean} inner - innermost (else outermost)
 * @returns {Node[]}
 */
function nesting(nodes, context, inner) {
  const set = new Set(nodes);
  const hasAncestorIn = (node) => {
    for (let p = parentOf(node); p; p = parentOf(p)) {
      if (set.has(p)) return true;
    }
    return false;
  };
  const ancestors = new Set();
  if (inner) {
    for (const node of nodes) {
      for (let p = parentOf(node); p; p = parentOf(p)) ancestors.add(p);
    }
  }
  const kept = nodes.filter((node) =>
    inner ? !ancestors.has(node) : !hasAncestorIn(node),
  );
  return context.order.sort(kept);
}

/** Function definitions. */
export const nodeFunctions = [
  ...nodeFunction("name", "xs:string", (node) => [
    stringItem(node ? lexicalName(node) : ""),
  ]),
  ...nodeFunction("local-name", "xs:string", (node) => [
    stringItem(node && isNamed(node) ? nodeLocalName(node) : ""),
  ]),
  ...nodeFunction("namespace-uri", "xs:anyURI", (node) => [
    new AtomicValue(
      types.anyURI,
      node && (node.nodeType === 1 || node.nodeType === 2)
        ? nodeNamespace(node)
        : "",
    ),
  ]),
  ...nodeFunction("node-name", "xs:QName?", (node) =>
    node && isNamed(node)
      ? [
          new AtomicValue(
            types.QName,
            new QNameValue(
              nodeNamespace(node),
              nodeLocalName(node),
              nodePrefix(node),
            ),
          ),
        ]
      : [],
  ),
  ...nodeFunction("root", "node()?", (node) => (node ? [rootOf(node)] : [])),
  ...nodeFunction("has-children", "xs:boolean", (node) => [
    booleanItem(Boolean(node) && childrenOf(node).length > 0),
  ]),
  ...nodeFunction("nilled", "xs:boolean?", (node) =>
    node?.nodeType === 1 ? [booleanItem(false)] : [],
  ),
  ...nodeFunction("generate-id", "xs:string", (node) => [
    stringItem(node ? generateId(node) : ""),
  ]),
  {
    local: "innermost",
    params: ["node()*"],
    returns: "node()*",
    impl: ([nodes], context) => nesting(nodes, context, true),
  },
  {
    local: "outermost",
    params: ["node()*"],
    returns: "node()*",
    impl: ([nodes], context) => nesting(nodes, context, false),
  },
  {
    local: "lang",
    params: ["xs:string?"],
    returns: "xs:boolean",
    focus: true,
    impl: ([language], context) => [
      booleanItem(
        matchesLanguage(language[0]?.value ?? "", focusNode(context)),
      ),
    ],
  },
  {
    local: "lang",
    params: ["xs:string?", "node()"],
    returns: "xs:boolean",
    impl: ([language, [node]]) => [
      booleanItem(matchesLanguage(language[0]?.value ?? "", node)),
    ],
  },
  ...nodePathFunctions,
];
