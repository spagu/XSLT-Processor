/**
 * The steps of path patterns: axis steps tested on a node (with their
 * predicates evaluated among the node's siblings when they depend on the
 * position), and the rooted steps key(), id(), doc(), $var, tested by
 * membership. Also the default priorities of single-step patterns.
 *
 * @module @tradik/xslt3/xslt/patterns/steps
 */

import { compileNode } from "../../xpath/eval/compiler.js";
import {
  attributesOf,
  childrenOf,
  parentOf,
} from "../../xpath/eval/domNodes.js";
import { compileNodeTest } from "../../xpath/eval/nodeTests.js";
import { isPositionIndependent } from "../../xpath/eval/positional.js";
import { compilePredicate } from "../../xpath/eval/predicates.js";
import { namespaceOf } from "../../xpath/eval/staticContext.js";
import { xsltError } from "../names.js";

/** Node kinds an axis step can match, by axis. */
const AXIS_KINDS = {
  child: (node) => [1, 3, 4, 7, 8].includes(node?.nodeType),
  attribute: (node) => node?.nodeType === 2,
  namespace: (node) => node?.nodeType === 13,
  self: (node) => typeof node?.nodeType === "number",
};

/** Index keys of kind tests. */
const KIND_KEYS = {
  TextTest: "k3",
  CommentTest: "k8",
  PITest: "k7",
  DocumentTest: "k9",
  NamespaceNodeTest: "k13",
};

/**
 * The index key of an axis step.
 * @param {object} step
 * @param {object} sc
 * @returns {string}
 */
function stepKey(step, sc) {
  const { nodeTest, axis } = step;
  const attribute = axis === "attribute";
  if (axis === "self") return "*";
  if (axis === "namespace") return "k13";
  if (nodeTest.type === "NameTest") {
    const defaultNs = attribute ? "" : sc.defaultElementNamespace;
    const uri = namespaceOf(nodeTest.name, sc, defaultNs);
    return `${attribute ? "a" : "e"}{${uri}}${nodeTest.name.local}`;
  }
  if (nodeTest.type === "Wildcard") return attribute ? "k2" : "k1";
  if (nodeTest.type === "ElementTest") return "k1";
  if (nodeTest.type === "AttributeTest") return "k2";
  return KIND_KEYS[nodeTest.type] ?? "*";
}

/**
 * Compiles an axis step of a pattern.
 * @param {object} step
 * @param {object} env - `{cx, sc, vars}`
 * @returns {{key: string, test: (node: *, xc: object) => boolean}}
 */
function compileAxisStep(step, env) {
  // document-node() as a step without axis matches document nodes
  const documentStep =
    step.axis === "child" &&
    step.nodeTest.type === "DocumentTest" &&
    !env.text.startsWith("child::", step.start);

  const kindOk = documentStep ? AXIS_KINDS.self : AXIS_KINDS[step.axis];
  if (!kindOk) {
    throw xsltError("XTSE0340", `The ${step.axis} axis is not allowed here`);
  }
  const nodeTest = compileNodeTest(step.nodeTest, step.axis, env.sc);
  const accepts = (node) => kindOk(node) && nodeTest(node);
  const scope = { sc: env.sc, vars: env.vars };
  const predicates = step.predicates.map((p) =>
    compilePredicate(p, scope, compileNode),
  );
  const key = stepKey(step, env.sc);
  if (predicates.length === 0) return { key, test: accepts };
  const independent = step.predicates.every((p) =>
    isPositionIndependent(p, env.sc),
  );
  const attribute = step.axis === "attribute";
  return {
    key,
    test(node, xc) {
      if (!accepts(node)) return false;
      const ctx = env.cx.patternContext(node, xc, env.local);
      if (independent) {
        return predicates.every((predicate) => predicate([node], ctx).length);
      }
      const parent = parentOf(node);
      let candidates = parent
        ? (attribute ? attributesOf(parent) : childrenOf(parent)).filter(
            accepts,
          )
        : [node];
      for (const predicate of predicates) {
        candidates = predicate(candidates, ctx);
      }
      return candidates.includes(node);
    },
  };
}

/**
 * Compiles a step of a pattern.
 * @param {object} step - AxisStep, or a FunctionCall/VarRef first step
 * @param {object} env - `{cx, sc, vars}`
 * @returns {{key: string, test: (node: *, xc: object) => boolean}}
 */
export function compileStep(step, env) {
  if (step.type === "AxisStep") return compileAxisStep(step, env);
  const run = env.cx.exprs.compileAst(step, env.sc, env.vars);
  return {
    key: "*",
    test: (node, xc) =>
      typeof node?.nodeType === "number" &&
      run(env.cx.patternContext(node, xc, env.local)).includes(node),
  };
}

/** Default priorities of kind tests without a name. */
const KIND_PRIORITY = {
  AnyKindTest: -0.5,
  TextTest: -0.5,
  CommentTest: -0.5,
  NamespaceNodeTest: -0.5,
};

/**
 * The default priority of a pattern made of one step.
 * @param {object} step
 * @returns {number}
 */
export function stepPriority(step) {
  if (step.type !== "AxisStep" || step.predicates.length > 0) return 0.5;
  const test = step.nodeTest;
  switch (test.type) {
    case "NameTest":
      return 0;
    case "Wildcard":
      return test.prefix !== null || test.local !== null || test.uri !== null
        ? -0.25
        : -0.5;
    case "PITest":
      return test.target === null ? -0.5 : 0;
    case "ElementTest":
    case "AttributeTest":
      if (test.name === null && test.typeName === null) return -0.5;
      return test.name !== null && test.typeName !== null ? 0.25 : 0;
    case "DocumentTest":
      return test.elementTest === null
        ? -0.5
        : stepPriority({ ...step, nodeTest: test.elementTest });
    default:
      return KIND_PRIORITY[test.type] ?? 0;
  }
}
