/**
 * Functions locating nodes and their namespaces (F&O 3.1 sections 13 and
 * 10.2): fn:path, fn:base-uri, fn:document-uri, fn:resolve-QName,
 * fn:in-scope-prefixes and fn:namespace-uri-for-prefix.
 *
 * @module @tradik/xslt3/functions/nodePaths
 */

import { XPathError } from "../errors.js";
import { AtomicValue } from "../xdm/atomic.js";
import { parseQName } from "../xdm/qname.js";
import { types } from "../xdm/types.js";
import { stringItem } from "../xpath/eval/atomics.js";
import {
  childrenOf,
  nodeLocalName,
  nodeNamespace,
  parentOf,
} from "../xpath/eval/domNodes.js";
import { resolveUri } from "../xpath/eval/uris.js";
import {
  inScopeNamespaces,
  XML_NAMESPACE,
} from "../xpath/eval/namespaceNodes.js";
import { focusNode } from "./focus.js";

/** @param {Node} node @returns {boolean} */
const isDocument = (node) => node.nodeType === 9 || node.nodeType === 11;

/**
 * @param {Node} node
 * @param {(n: Node) => boolean} same - Siblings counted for the position
 * @returns {number} 1-based position among the matching siblings
 */
function positionAmong(node, same) {
  const parent = parentOf(node);
  if (!parent) return 1;
  return childrenOf(parent).filter(same).indexOf(node) + 1;
}

/**
 * One step of fn:path.
 * @param {Node} node
 * @returns {string}
 */
function pathStep(node) {
  const name = `Q{${nodeNamespace(node)}}${nodeLocalName(node)}`;
  switch (node.nodeType) {
    case 1:
      return `${name}[${positionAmong(
        node,
        (n) =>
          n.nodeType === 1 &&
          `Q{${nodeNamespace(n)}}${nodeLocalName(n)}` === name,
      )}]`;
    case 2:
      return node.namespaceURI ? `@${name}` : `@${nodeLocalName(node)}`;
    case 7:
      return `processing-instruction(${nodeLocalName(node)})[${positionAmong(
        node,
        (n) => n.nodeType === 7 && nodeLocalName(n) === nodeLocalName(node),
      )}]`;
    case 8:
      return `comment()[${positionAmong(node, (n) => n.nodeType === 8)}]`;
    case 13:
      return node.localName
        ? `namespace::${node.localName}`
        : 'namespace::*[Q{http://www.w3.org/2005/xpath-functions}local-name()=""]';
    default:
      return `text()[${positionAmong(node, (n) => n.nodeType === 3 || n.nodeType === 4)}]`;
  }
}

/**
 * fn:path of a node.
 * @param {Node} node
 * @returns {string}
 */
function pathOf(node) {
  const steps = [];
  let current = node;
  for (; parentOf(current); current = parentOf(current)) {
    steps.unshift(pathStep(current));
  }
  if (isDocument(current)) return `/${steps.join("/")}`;
  const root = "Q{http://www.w3.org/2005/xpath-functions}root()";
  return steps.length ? `${root}/${steps.join("/")}` : root;
}

/**
 * Base URI of a node: its xml:base attributes resolved against the
 * document URI.
 * @param {Node} node
 * @returns {string|undefined}
 */
function baseUriOf(node) {
  const chain = [];
  for (let n = node; n; n = parentOf(n)) chain.unshift(n);
  const document = chain[0];
  let base = isDocument(document) ? documentUriOf(document) : undefined;
  for (const n of chain) {
    if (n.nodeType === 1 && n.hasAttributeNS(XML_NAMESPACE, "base")) {
      base = resolveUri(n.getAttributeNS(XML_NAMESPACE, "base"), base);
    }
  }
  return base;
}

/**
 * @param {Node} node - A document node
 * @returns {string|undefined} its URI, undefined when unknown
 */
function documentUriOf(node) {
  const uri = node.documentURI ?? node.URL;
  return uri && uri !== "about:blank" ? uri : undefined;
}

/** @param {string|undefined} uri @returns {Array} an optional xs:anyURI */
const anyUri = (uri) =>
  uri === undefined ? [] : [new AtomicValue(types.anyURI, uri)];

/**
 * fn:resolve-QName: a lexical QName resolved with the in-scope namespaces
 * of an element.
 * @param {Array<Array>} args
 * @returns {Array} an optional xs:QName
 * @throws {XPathError} FOCA0002 for an invalid lexical QName, FONS0004
 *   for an undeclared prefix
 */
function resolveQName([name, [element]]) {
  if (!name.length) return [];
  const namespaces = inScopeNamespaces(element);
  const resolve = (prefix) => namespaces.get(prefix) ?? (prefix ? null : "");
  const qname = parseQName(name[0].value, resolve);
  if (qname === null) {
    throw new XPathError("FOCA0002", `"${name[0].value}" is not a QName`);
  }
  return [new AtomicValue(types.QName, qname)];
}

/** Function definitions. */
export const nodePathFunctions = [
  {
    local: "path",
    params: [],
    returns: "xs:string?",
    focus: true,
    impl: (_, context) => [stringItem(pathOf(focusNode(context)))],
  },
  {
    local: "path",
    params: ["node()?"],
    returns: "xs:string?",
    impl: ([arg]) => (arg.length ? [stringItem(pathOf(arg[0]))] : []),
  },
  {
    local: "base-uri",
    params: [],
    returns: "xs:anyURI?",
    focus: true,
    impl: (_, context) => anyUri(baseUriOf(focusNode(context))),
  },
  {
    local: "base-uri",
    params: ["node()?"],
    returns: "xs:anyURI?",
    impl: ([arg]) => (arg.length ? anyUri(baseUriOf(arg[0])) : []),
  },
  {
    local: "document-uri",
    params: [],
    returns: "xs:anyURI?",
    focus: true,
    impl: (_, context) => {
      const node = focusNode(context);
      return isDocument(node) ? anyUri(documentUriOf(node)) : [];
    },
  },
  {
    local: "document-uri",
    params: ["node()?"],
    returns: "xs:anyURI?",
    impl: ([arg]) =>
      arg.length && isDocument(arg[0]) ? anyUri(documentUriOf(arg[0])) : [],
  },
  {
    local: "resolve-QName",
    params: ["xs:string?", "element()"],
    returns: "xs:QName?",
    impl: resolveQName,
  },
  {
    local: "in-scope-prefixes",
    params: ["element()"],
    returns: "xs:string*",
    impl: ([[element]]) =>
      [...inScopeNamespaces(element)]
        .filter(([, uri]) => uri !== "")
        .map(([prefix]) => stringItem(prefix)),
  },
  {
    local: "namespace-uri-for-prefix",
    params: ["xs:string?", "element()"],
    returns: "xs:anyURI?",
    impl: ([prefix, [element]]) => {
      const uri = inScopeNamespaces(element).get(prefix[0]?.value ?? "");
      return uri ? anyUri(uri) : [];
    },
  },
];
