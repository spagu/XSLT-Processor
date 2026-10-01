/**
 * The functions XSLT adds to XPath (XSLT 3.0 section 20): current(),
 * current-group(), current-grouping-key(), regex-group(), key(),
 * document() and the unparsed entity functions, with the availability
 * functions (availability.js) and copy-of()/snapshot() (copyFunctions.js).
 * They read the XSLT context from the XPath dynamic context
 * (`context.xc`, see context.js).
 *
 * @module @tradik/xslt3/xslt/runtime/functions
 */

import { stringItem } from "../../xpath/eval/atomics.js";
import { rootOf } from "../../xpath/eval/domNodes.js";
import { resolveUri } from "../../xpath/eval/uris.js";
import { AtomicValue, isNode } from "../../xdm/atomic.js";
import { types } from "../../xdm/types.js";
import { stringValue } from "../../xdm/nodes.js";
import { xsltError } from "../names.js";
import { availabilityFunctions, nameArgument } from "./availability.js";
import { copyFunctions } from "./copyFunctions.js";
import { keyLookup } from "./keys.js";

/**
 * Whether a node is a node of the subtree rooted at another.
 * @param {Node} node
 * @param {Node} top
 * @returns {boolean}
 */
function within(node, top) {
  for (let a = node; a; a = a.parentNode ?? a.ownerElement) {
    if (a === top) return true;
  }
  return false;
}

/**
 * key().
 * @param {Array} args
 * @param {object} context
 * @returns {Array}
 */
function key([[name], values, top], context) {
  const { uri, local } = nameArgument(name.value, context, "XTDE1260");
  let root = top?.[0];
  if (!top) {
    if (!isNode(context.contextItem)) {
      throw xsltError("XTDE1270", "key() needs a context node");
    }
    root = rootOf(context.contextItem);
    if (root.nodeType !== 9 && root.nodeType !== 11) {
      throw xsltError("XTDE1270", "key() needs a node in a document");
    }
  }
  const nodes = keyLookup(context.xc, `{${uri}}${local}`, values, rootOf(root));
  return root === rootOf(root) ? nodes : nodes.filter((n) => within(n, root));
}

/**
 * document().
 * @param {Array} args
 * @param {object} context
 * @returns {Array}
 */
function documentFunction([items, base], context) {
  const results = [];
  for (const item of items) {
    const fixedBase = base?.length
      ? (rootOf(base[0]).documentURI ?? context.staticBaseUri)
      : null;
    const baseUri =
      fixedBase ??
      (isNode(item)
        ? (rootOf(item).documentURI ?? context.staticBaseUri)
        : context.staticBaseUri);
    const uri = resolveUri(stringValue(item).replace(/#.*$/, ""), baseUri);
    const own = context.xc.tx.stylesheet.moduleDocuments.get(uri);
    results.push(own ?? context.loadDocument(uri));
  }
  return context.order.sort(results);
}

/** XSLT functions, as function library definitions. */
export const xsltFunctions = [
  ...availabilityFunctions,
  ...copyFunctions,
  {
    local: "current",
    params: [],
    returns: "item()",
    impl: (_, context) => {
      if (context.xc.item === undefined) {
        throw xsltError("XPDY0002", "current() has no current item");
      }
      return [context.xc.item];
    },
  },
  {
    local: "current-group",
    params: [],
    returns: "item()*",
    impl: (_, context) => context.xc.group ?? [],
  },
  {
    local: "current-grouping-key",
    params: [],
    returns: "xs:anyAtomicType*",
    impl: (_, context) => context.xc.groupKey ?? [],
  },
  {
    local: "regex-group",
    params: ["xs:integer"],
    returns: "xs:string",
    impl: ([[n]], context) => [
      stringItem(context.xc.regex?.[Number(n.value)] ?? ""),
    ],
  },
  {
    local: "key",
    params: ["xs:string", "xs:anyAtomicType*"],
    returns: "node()*",
    focus: true,
    impl: key,
  },
  {
    local: "key",
    params: ["xs:string", "xs:anyAtomicType*", "node()"],
    returns: "node()*",
    impl: key,
  },
  {
    local: "document",
    params: ["item()*"],
    returns: "node()*",
    impl: documentFunction,
  },
  {
    local: "document",
    params: ["item()*", "node()"],
    returns: "node()*",
    impl: documentFunction,
  },
  {
    local: "current-output-uri",
    params: [],
    returns: "xs:anyURI?",
    impl: (_, context) => {
      const { temporary, outputUri } = context.xc;
      return temporary || outputUri === undefined
        ? []
        : [new AtomicValue(types.anyURI, outputUri)];
    },
  },
  ...["unparsed-entity-uri", "unparsed-entity-public-id"].map((local) => ({
    local,
    params: ["xs:string"],
    returns: "xs:string",
    impl: () => [stringItem("")],
  })),
];
