/**
 * Node tests (XPath 3.1 section 3.3.2.2) and kind tests (section 2.5.5.3)
 * compiled to predicates on DOM nodes.
 *
 * @module @tradik/xslt3/xpath/eval/nodeTests
 */

import { XPathError } from "../../errors.js";
import {
  childrenOf,
  isXdmNode,
  nodeLocalName,
  nodeNamespace,
} from "./domNodes.js";
import { clark, namespaceOf } from "./staticContext.js";
import { untypedMatches } from "./typeNames.js";

/**
 * A compiled kind test.
 * @typedef {object} KindTest
 * @property {string|null} kind - XDM node kind, null for node()
 * @property {string|null} name - Clark name required, null for any
 * @property {(node: Node) => boolean} matches - Applies to nodes only
 */

/** nodeType of the principal node kind of an axis. */
const principal = (axis) =>
  axis === "attribute" ? 2 : axis === "namespace" ? 13 : 1;

/**
 * @param {Node} node
 * @returns {string} Clark name of a node
 */
const nodeName = (node) => clark(nodeNamespace(node), nodeLocalName(node));

/**
 * Element or attribute test with an optional name and type.
 * @param {object} test - ElementTest or AttributeTest
 * @param {"element"|"attribute"} kind
 * @param {import("./staticContext.js").StaticContext} sc
 * @returns {KindTest}
 */
function namedKindTest(test, kind, sc) {
  const nodeType = kind === "element" ? 1 : 2;
  const defaultNs = kind === "element" ? sc.defaultElementNamespace : "";
  const name = test.name
    ? clark(namespaceOf(test.name, sc, defaultNs), test.name.local)
    : null;
  const typed = test.typeName ? untypedMatches(test.typeName, kind, sc) : true;
  return {
    kind,
    name,
    matches: (node) =>
      typed &&
      node.nodeType === nodeType &&
      (name === null || nodeName(node) === name),
  };
}

/** Kind test compilers by node type. */
const kindTests = {
  AnyKindTest: () => ({ kind: null, name: null, matches: () => true }),
  TextTest: () => ({
    kind: "text",
    name: null,
    matches: (node) => node.nodeType === 3 || node.nodeType === 4,
  }),
  CommentTest: () => ({
    kind: "comment",
    name: null,
    matches: (node) => node.nodeType === 8,
  }),
  NamespaceNodeTest: () => ({
    kind: "namespace",
    name: null,
    matches: (node) => node.nodeType === 13,
  }),
  PITest: (test) => ({
    kind: "processing-instruction",
    name: test.target === null ? null : clark("", test.target),
    matches: (node) =>
      node.nodeType === 7 &&
      (test.target === null || nodeLocalName(node) === test.target),
  }),
  ElementTest: (test, sc) => namedKindTest(test, "element", sc),
  AttributeTest: (test, sc) => namedKindTest(test, "attribute", sc),
  SchemaElementTest: (test, sc) => {
    namespaceOf(test.name, sc, sc.defaultElementNamespace);
    throw new XPathError(
      "XPST0008",
      `No element declaration for schema-element(${test.name.local})`,
    );
  },
  SchemaAttributeTest: (test, sc) => {
    namespaceOf(test.name, sc, "");
    throw new XPathError(
      "XPST0008",
      `No attribute declaration for schema-attribute(${test.name.local})`,
    );
  },
  DocumentTest: (test, sc) => {
    const element = test.elementTest && compileKindTest(test.elementTest, sc);
    const matches = (node) => {
      if (node.nodeType !== 9 && node.nodeType !== 11) return false;
      if (!element) return true;
      const children = childrenOf(node);
      const elements = children.filter((child) => child.nodeType === 1);
      const others = children.every(
        (child) =>
          child.nodeType === 1 || child.nodeType === 7 || child.nodeType === 8,
      );
      return elements.length === 1 && others && element.matches(elements[0]);
    };
    return { kind: "document", name: null, element, matches };
  },
};

/**
 * @param {import("../syntax/typeAst.js").KindTest} test
 * @param {import("./staticContext.js").StaticContext} sc
 * @returns {KindTest}
 * @throws {XPathError} XPST0008 for schema-element(), schema-attribute()
 *   and unknown type names, XPST0081 for undeclared prefixes
 */
export function compileKindTest(test, sc) {
  return kindTests[test.type](test, sc);
}

/**
 * Compiles the node test of an axis step.
 * @param {import("../syntax/typeAst.js").NodeTest} test
 * @param {string} axis
 * @param {import("./staticContext.js").StaticContext} sc
 * @returns {(node: Node) => boolean} the test, false for the nodes that
 *   are not XDM nodes
 */
export function compileNodeTest(test, axis, sc) {
  const nodeType = principal(axis);
  if (test.type === "NameTest") {
    const defaultNs = nodeType === 1 ? sc.defaultElementNamespace : "";
    const uri = namespaceOf(test.name, sc, defaultNs);
    const local = test.name.local;
    // nodeLocalName() of the principal node kinds, without a second read
    // of nodeType
    const matches = (node) =>
      node.nodeType === nodeType &&
      (node.localName ?? node.nodeName) === local &&
      nodeNamespace(node) === uri;
    // The name, for axes that can look a node up by name (attribute)
    matches.qname = { uri, local };
    return matches;
  }
  if (test.type === "Wildcard") {
    const uri = test.prefix !== null ? namespaceOf(test, sc, "") : test.uri;
    const { local } = test;
    return (node) =>
      node.nodeType === nodeType &&
      (local === null || nodeLocalName(node) === local) &&
      (uri === null || nodeNamespace(node) === uri);
  }
  // node() on an axis: any XDM node, not a document type node
  if (test.type === "AnyKindTest") return isXdmNode;
  return compileKindTest(test, sc).matches;
}
