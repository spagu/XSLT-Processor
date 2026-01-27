/**
 * XPath 1.0 Evaluator
 * Based on W3C XPath 1.0 Specification: http://www.w3.org/TR/1999/REC-xpath-19991116
 *
 * Evaluates XPath AST against DOM nodes.
 */

"use strict";

import { NodeType } from "./parser.js";

/**
 * XPath result types matching W3C spec
 */
export const XPathResultType = {
  ANY_TYPE: 0,
  NUMBER_TYPE: 1,
  STRING_TYPE: 2,
  BOOLEAN_TYPE: 3,
  UNORDERED_NODE_ITERATOR_TYPE: 4,
  ORDERED_NODE_ITERATOR_TYPE: 5,
  UNORDERED_NODE_SNAPSHOT_TYPE: 6,
  ORDERED_NODE_SNAPSHOT_TYPE: 7,
  ANY_UNORDERED_NODE_TYPE: 8,
  FIRST_ORDERED_NODE_TYPE: 9,
};

/**
 * Security limits to prevent DoS attacks
 */
export const XPathLimits = {
  MAX_RECURSION_DEPTH: 100,
  MAX_RESULT_SIZE: 10000,
  MAX_STRING_LENGTH: 1000000,
};

/**
 * Forbidden variable names to prevent prototype pollution
 */
const FORBIDDEN_VARIABLE_NAMES = Object.freeze([
  "__proto__",
  "constructor",
  "prototype",
  "__defineGetter__",
  "__defineSetter__",
  "__lookupGetter__",
  "__lookupSetter__",
]);

/**
 * XPath evaluation context
 */
export class XPathContext {
  constructor(node, position = 1, size = 1, variables = {}, namespaces = {}) {
    this.node = node;
    this.position = position;
    this.size = size;
    this.variables = variables;
    this.namespaces = namespaces;
  }

  clone(overrides = {}) {
    return new XPathContext(
      overrides.node ?? this.node,
      overrides.position ?? this.position,
      overrides.size ?? this.size,
      overrides.variables ?? this.variables,
      overrides.namespaces ?? this.namespaces,
    );
  }
}

/**
 * XPath Evaluator
 */
export class XPathEvaluator {
  constructor(options = {}) {
    this.functions = this.initCoreFunctions();
    this.maxRecursionDepth =
      options.maxRecursionDepth ?? XPathLimits.MAX_RECURSION_DEPTH;
    this.maxResultSize = options.maxResultSize ?? XPathLimits.MAX_RESULT_SIZE;
    this.maxStringLength =
      options.maxStringLength ?? XPathLimits.MAX_STRING_LENGTH;
    this.recursionDepth = 0;
  }

  /**
   * Evaluate XPath expression against a context
   * @throws {Error} If recursion depth exceeds limit
   * @throws {Error} If AST is invalid
   */
  evaluate(ast, context) {
    if (!ast || typeof ast !== "object") {
      throw new Error("Invalid AST: expected object");
    }

    if (!ast.type) {
      throw new Error("Invalid AST: missing type property");
    }

    this.recursionDepth++;
    if (this.recursionDepth > this.maxRecursionDepth) {
      this.recursionDepth = 0;
      throw new Error(
        `Maximum recursion depth exceeded (${this.maxRecursionDepth})`,
      );
    }

    try {
      return this.evaluateInternal(ast, context);
    } finally {
      this.recursionDepth--;
    }
  }

  /**
   * Internal evaluation (after validation)
   */
  evaluateInternal(ast, context) {
    switch (ast.type) {
      case NodeType.OR_EXPR:
        return this.evalOrExpr(ast, context);
      case NodeType.AND_EXPR:
        return this.evalAndExpr(ast, context);
      case NodeType.EQUALITY_EXPR:
        return this.evalEqualityExpr(ast, context);
      case NodeType.RELATIONAL_EXPR:
        return this.evalRelationalExpr(ast, context);
      case NodeType.ADDITIVE_EXPR:
        return this.evalAdditiveExpr(ast, context);
      case NodeType.MULTIPLICATIVE_EXPR:
        return this.evalMultiplicativeExpr(ast, context);
      case NodeType.UNARY_EXPR:
        return this.evalUnaryExpr(ast, context);
      case NodeType.UNION_EXPR:
        return this.evalUnionExpr(ast, context);
      case NodeType.PATH_EXPR:
        return this.evalPathExpr(ast, context);
      case NodeType.LOCATION_PATH:
        return this.evalLocationPath(ast, context);
      case NodeType.VARIABLE_REF:
        return this.evalVariableRef(ast, context);
      case NodeType.LITERAL:
        return this.validateString(ast.value);
      case NodeType.NUMBER:
        return ast.value;
      case NodeType.FUNCTION_CALL:
        return this.evalFunctionCall(ast, context);
      default:
        throw new Error(`Unknown AST node type: ${String(ast.type)}`);
    }
  }

  /**
   * Validate and limit string length
   */
  validateString(str) {
    if (typeof str === "string" && str.length > this.maxStringLength) {
      throw new Error(
        `String exceeds maximum length (${this.maxStringLength})`,
      );
    }
    return str;
  }

  /**
   * Validate result size
   */
  validateResultSize(nodes) {
    if (Array.isArray(nodes) && nodes.length > this.maxResultSize) {
      throw new Error(
        `Result set exceeds maximum size (${this.maxResultSize})`,
      );
    }
    return nodes;
  }

  evalOrExpr(ast, context) {
    return (
      this.toBoolean(this.evaluate(ast.left, context)) ||
      this.toBoolean(this.evaluate(ast.right, context))
    );
  }

  evalAndExpr(ast, context) {
    return (
      this.toBoolean(this.evaluate(ast.left, context)) &&
      this.toBoolean(this.evaluate(ast.right, context))
    );
  }

  evalEqualityExpr(ast, context) {
    const left = this.evaluate(ast.left, context);
    const right = this.evaluate(ast.right, context);
    const isEqual = this.compareValues(left, right, "=");
    return ast.operator === "=" ? isEqual : !isEqual;
  }

  evalRelationalExpr(ast, context) {
    const left = this.evaluate(ast.left, context);
    const right = this.evaluate(ast.right, context);
    return this.compareValues(left, right, ast.operator);
  }

  evalAdditiveExpr(ast, context) {
    const left = this.toNumber(this.evaluate(ast.left, context));
    const right = this.toNumber(this.evaluate(ast.right, context));
    return ast.operator === "+" ? left + right : left - right;
  }

  evalMultiplicativeExpr(ast, context) {
    const left = this.toNumber(this.evaluate(ast.left, context));
    const right = this.toNumber(this.evaluate(ast.right, context));

    switch (ast.operator) {
      case "*":
        return left * right;
      case "div":
        return left / right;
      case "mod":
        return left % right;
      default:
        throw new Error(`Unknown multiplicative operator: ${ast.operator}`);
    }
  }

  evalUnaryExpr(ast, context) {
    const value = this.toNumber(this.evaluate(ast.operand, context));
    return -value;
  }

  evalUnionExpr(ast, context) {
    const left = this.evaluate(ast.left, context);
    const right = this.evaluate(ast.right, context);

    const leftNodes = Array.isArray(left) ? left : [left];
    const rightNodes = Array.isArray(right) ? right : [right];

    // Union in document order, no duplicates
    const seen = new Set();
    const result = [];

    for (const node of [...leftNodes, ...rightNodes]) {
      if (!seen.has(node)) {
        seen.add(node);
        result.push(node);
      }
    }

    this.validateResultSize(result);
    return this.sortByDocumentOrder(result);
  }

  evalPathExpr(ast, context) {
    if (ast.filter) {
      let result = this.evaluate(ast.filter, context);

      if (ast.predicates) {
        for (const pred of ast.predicates) {
          result = this.filterByPredicate(result, pred, context);
        }
      }

      if (ast.steps) {
        for (const step of ast.steps) {
          result = this.evalStepOnNodes(step, result, context);
        }
      }

      return result;
    }

    return [];
  }

  evalLocationPath(ast, context) {
    let nodes;

    if (ast.absolute) {
      // Start from document root node (not document element)
      // XPath absolute paths start from the document node
      const doc = context.node.ownerDocument || context.node;
      nodes = [doc];
    } else {
      nodes = [context.node];
    }

    for (const step of ast.steps) {
      nodes = this.evalStepOnNodes(step, nodes, context);
      this.validateResultSize(nodes);
    }

    return nodes;
  }

  evalStepOnNodes(step, nodes, context) {
    const allNodes = Array.isArray(nodes) ? nodes : [nodes];
    let result = [];

    for (const node of allNodes) {
      const stepNodes = this.evalStep(step, context.clone({ node }));
      result = result.concat(stepNodes);

      // Early validation to prevent excessive memory use
      if (result.length > this.maxResultSize * 2) {
        this.validateResultSize(result);
      }
    }

    // Remove duplicates and sort by document order
    const uniqueResult = [...new Set(result)];
    this.validateResultSize(uniqueResult);
    return this.sortByDocumentOrder(uniqueResult);
  }

  evalStep(step, context) {
    // Get nodes along axis
    let nodes = this.getAxisNodes(step.axis, context.node);

    // Filter by node test
    nodes = nodes.filter((n) => this.matchNodeTest(step.nodeTest, n, context));

    // Apply predicates
    for (const predicate of step.predicates) {
      nodes = this.filterByPredicate(nodes, predicate, context);
    }

    return nodes;
  }

  getAxisNodes(axis, node) {
    switch (axis) {
      case "child":
        return Array.from(node.childNodes || []);

      case "parent":
        return node.parentNode ? [node.parentNode] : [];

      case "self":
        return [node];

      case "descendant":
        return this.getDescendants(node, false);

      case "descendant-or-self":
        return this.getDescendants(node, true);

      case "ancestor":
        return this.getAncestors(node, false);

      case "ancestor-or-self":
        return this.getAncestors(node, true);

      case "following-sibling":
        return this.getFollowingSiblings(node);

      case "preceding-sibling":
        return this.getPrecedingSiblings(node);

      case "following":
        return this.getFollowing(node);

      case "preceding":
        return this.getPreceding(node);

      case "attribute":
        if (node.attributes) {
          return Array.from(node.attributes);
        }
        return [];

      case "namespace":
        // Namespace axis - not commonly used
        return [];

      default:
        throw new Error(`Unknown axis: ${axis}`);
    }
  }

  getDescendants(node, includeSelf) {
    const result = includeSelf ? [node] : [];
    const stack = Array.from(node.childNodes || []).reverse();

    while (stack.length > 0) {
      const current = stack.pop();
      result.push(current);
      if (current.childNodes) {
        for (let i = current.childNodes.length - 1; i >= 0; i--) {
          stack.push(current.childNodes[i]);
        }
      }
    }

    return result;
  }

  getAncestors(node, includeSelf) {
    const result = includeSelf ? [node] : [];
    let current = node.parentNode;

    while (current) {
      result.push(current);
      current = current.parentNode;
    }

    return result;
  }

  getFollowingSiblings(node) {
    const result = [];
    if (!node) return result;
    let current = node.nextSibling;

    while (current) {
      result.push(current);
      current = current.nextSibling;
    }

    return result;
  }

  getPrecedingSiblings(node) {
    const result = [];
    if (!node) return result;
    let current = node.previousSibling;

    while (current) {
      result.push(current);
      current = current.previousSibling;
    }

    return result.reverse();
  }

  getFollowing(node) {
    const result = [];
    let current = node;

    // Go to next sibling, or ancestor's next sibling
    while (current) {
      if (current.nextSibling) {
        current = current.nextSibling;
        result.push(current);
        // Add all descendants
        result.push(...this.getDescendants(current, false));
      } else {
        current = current.parentNode;
      }
    }

    return result;
  }

  getPreceding(node) {
    const result = [];
    let current = node;

    while (current) {
      if (current.previousSibling) {
        current = current.previousSibling;
        // Add descendants in reverse order, then the node
        const descendants = this.getDescendants(current, false);
        result.unshift(...descendants.reverse());
        result.unshift(current);
      } else {
        current = current.parentNode;
        if (current && current.nodeType !== 9) {
          // Not document
          // Don't add ancestors
        }
      }
    }

    return result;
  }

  matchNodeTest(nodeTest, node, context) {
    switch (nodeTest.type) {
      case NodeType.NAME_TEST:
        return this.matchNameTest(nodeTest, node, context);

      case NodeType.NODE_TYPE_TEST:
        return this.matchNodeTypeTest(nodeTest.nodeType, node);

      case NodeType.PI_TEST:
        return node.nodeType === 7 && node.nodeName === nodeTest.name;

      default:
        return false;
    }
  }

  matchNameTest(nodeTest, node, context) {
    // Only element and attribute nodes have names
    if (node.nodeType !== 1 && node.nodeType !== 2) {
      return false;
    }

    const name = nodeTest.name;
    const prefix = nodeTest.prefix;

    // Wildcard
    if (name === "*" && !prefix) {
      return true;
    }

    // Get node's local name and namespace
    const nodeName = node.localName || node.nodeName;
    const nodeNs = node.namespaceURI || null;

    // Prefix:* matches all nodes in namespace
    if (name === "*" && prefix) {
      const ns = context.namespaces[prefix];
      return nodeNs === ns;
    }

    // Simple name match
    if (!prefix) {
      // For elements, match local name (case-insensitive for HTML)
      const doc = node.ownerDocument;
      if (doc && doc.contentType === "text/html" && node.nodeType === 1) {
        return nodeName.toLowerCase() === name.toLowerCase();
      }
      return nodeName === name;
    }

    // Prefixed name match
    const ns = context.namespaces[prefix];
    return nodeName === name && nodeNs === ns;
  }

  matchNodeTypeTest(nodeType, node) {
    switch (nodeType) {
      case "node":
        return true;
      case "text":
        return node.nodeType === 3;
      case "comment":
        return node.nodeType === 8;
      case "processing-instruction":
        return node.nodeType === 7;
      default:
        return false;
    }
  }

  filterByPredicate(nodes, predicate, context) {
    const result = [];
    const nodeArray = Array.isArray(nodes) ? nodes : [nodes];
    const size = nodeArray.length;

    for (let i = 0; i < nodeArray.length; i++) {
      const node = nodeArray[i];
      const predicateContext = context.clone({
        node,
        position: i + 1,
        size,
      });

      const value = this.evaluate(predicate.expr, predicateContext);

      // If predicate evaluates to a number, it's a position test
      if (typeof value === "number") {
        if (value === i + 1) {
          result.push(node);
        }
      } else if (this.toBoolean(value)) {
        result.push(node);
      }
    }

    return result;
  }

  evalVariableRef(ast, context) {
    const name = ast.prefix ? `${ast.prefix}:${ast.name}` : ast.name;

    // Security: Prevent prototype pollution
    if (
      FORBIDDEN_VARIABLE_NAMES.includes(name) ||
      FORBIDDEN_VARIABLE_NAMES.includes(ast.name)
    ) {
      throw new Error(`Forbidden variable name: $${name}`);
    }

    if (!Object.prototype.hasOwnProperty.call(context.variables, name)) {
      throw new Error(`Undefined variable: $${name}`);
    }
    return context.variables[name];
  }

  evalFunctionCall(ast, context) {
    const name = ast.prefix ? `${ast.prefix}:${ast.name}` : ast.name;
    const fn = this.functions[name];

    if (!fn) {
      throw new Error(`Unknown function: ${name}`);
    }

    return fn.call(this, ast.args, context);
  }

  // Type conversion functions
  toBoolean(value) {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0 && !isNaN(value);
    if (typeof value === "string") return value.length > 0;
    if (Array.isArray(value)) return value.length > 0;
    if (value && value.nodeType) return true;
    return Boolean(value);
  }

  toNumber(value) {
    if (typeof value === "number") return value;
    if (typeof value === "boolean") return value ? 1 : 0;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed === "") return NaN;
      const num = Number(trimmed);
      return num;
    }
    if (Array.isArray(value)) {
      return this.toNumber(this.toString(value));
    }
    if (value && value.nodeType) {
      return this.toNumber(this.getStringValue(value));
    }
    return NaN;
  }

  toString(value) {
    if (typeof value === "string") return value;
    if (typeof value === "number") {
      if (isNaN(value)) return "NaN";
      if (value === Infinity) return "Infinity";
      if (value === -Infinity) return "-Infinity";
      if (value === 0) return "0";
      return String(value);
    }
    if (typeof value === "boolean") return value ? "true" : "false";
    if (Array.isArray(value)) {
      if (value.length === 0) return "";
      return this.getStringValue(value[0]);
    }
    if (value && value.nodeType) {
      return this.getStringValue(value);
    }
    return String(value);
  }

  getStringValue(node) {
    if (!node) return "";

    switch (node.nodeType) {
      case 1: // Element
      case 9: // Document
      case 11: {
        // Document Fragment
        let text = "";
        const walker = (n) => {
          if (n.nodeType === 3) {
            text += n.nodeValue || "";
          } else if (n.childNodes) {
            for (const child of n.childNodes) {
              walker(child);
            }
          }
        };
        walker(node);
        return text;
      }

      case 2: // Attribute
      case 3: // Text
      case 4: // CDATA
      case 7: // Processing Instruction
      case 8: // Comment
        return node.nodeValue || "";

      default:
        return "";
    }
  }

  // Comparison helper
  compareValues(left, right, operator) {
    const leftIsNodeSet = Array.isArray(left);
    const rightIsNodeSet = Array.isArray(right);

    // Node-set comparisons
    if (leftIsNodeSet && rightIsNodeSet) {
      for (const l of left) {
        for (const r of right) {
          if (
            this.comparePrimitive(
              this.getStringValue(l),
              this.getStringValue(r),
              operator,
            )
          ) {
            return true;
          }
        }
      }
      return false;
    }

    if (leftIsNodeSet) {
      for (const l of left) {
        if (this.comparePrimitive(this.getStringValue(l), right, operator)) {
          return true;
        }
      }
      return false;
    }

    if (rightIsNodeSet) {
      for (const r of right) {
        if (this.comparePrimitive(left, this.getStringValue(r), operator)) {
          return true;
        }
      }
      return false;
    }

    return this.comparePrimitive(left, right, operator);
  }

  comparePrimitive(left, right, operator) {
    // If comparing for equality with different types
    if (operator === "=" || operator === "!=") {
      // If one is boolean, convert both to boolean
      if (typeof left === "boolean" || typeof right === "boolean") {
        const result = this.toBoolean(left) === this.toBoolean(right);
        return operator === "=" ? result : !result;
      }
      // If one is number, convert both to number
      if (typeof left === "number" || typeof right === "number") {
        const result = this.toNumber(left) === this.toNumber(right);
        return operator === "=" ? result : !result;
      }
      // Otherwise compare as strings
      const result = this.toString(left) === this.toString(right);
      return operator === "=" ? result : !result;
    }

    // Relational operators always compare as numbers
    const leftNum = this.toNumber(left);
    const rightNum = this.toNumber(right);

    switch (operator) {
      case "<":
        return leftNum < rightNum;
      case "<=":
        return leftNum <= rightNum;
      case ">":
        return leftNum > rightNum;
      case ">=":
        return leftNum >= rightNum;
      default:
        throw new Error(`Unknown comparison operator: ${operator}`);
    }
  }

  sortByDocumentOrder(nodes) {
    if (nodes.length <= 1) return nodes;

    return nodes.sort((a, b) => {
      if (a === b) return 0;

      const position = a.compareDocumentPosition
        ? a.compareDocumentPosition(b)
        : this.compareDocumentPositionFallback(a, b);

      if (position & 4) return -1; // a before b
      if (position & 2) return 1; // a after b
      return 0;
    });
  }

  compareDocumentPositionFallback(a, b) {
    // Simple fallback for environments without compareDocumentPosition
    const getPath = (node) => {
      const path = [];
      let current = node;
      while (current) {
        if (current.parentNode) {
          const siblings = Array.from(current.parentNode.childNodes);
          path.unshift(siblings.indexOf(current));
        }
        current = current.parentNode;
      }
      return path;
    };

    const pathA = getPath(a);
    const pathB = getPath(b);

    for (let i = 0; i < Math.min(pathA.length, pathB.length); i++) {
      if (pathA[i] < pathB[i]) return 4; // a before b
      if (pathA[i] > pathB[i]) return 2; // a after b
    }

    return pathA.length < pathB.length ? 4 : 2;
  }

  /**
   * Initialize XPath 1.0 core functions
   */
  initCoreFunctions() {
    return {
      // Node set functions
      last: (args, ctx) => ctx.size,
      position: (args, ctx) => ctx.position,
      count: (args, ctx) => {
        const nodeSet = this.evaluate(args[0], ctx);
        return Array.isArray(nodeSet) ? nodeSet.length : 1;
      },
      id: (args, ctx) => {
        const value = this.toString(this.evaluate(args[0], ctx));
        const doc = ctx.node.ownerDocument || ctx.node;
        const ids = value.split(/\s+/).filter((id) => id);
        const result = [];
        for (const id of ids) {
          const el = doc.getElementById(id);
          if (el) result.push(el);
        }
        return result;
      },
      "local-name": (args, ctx) => {
        let node;
        if (args.length === 0) {
          node = ctx.node;
        } else {
          const nodeSet = this.evaluate(args[0], ctx);
          node = Array.isArray(nodeSet) ? nodeSet[0] : nodeSet;
        }
        if (!node) return "";
        return node.localName || node.nodeName || "";
      },
      "namespace-uri": (args, ctx) => {
        let node;
        if (args.length === 0) {
          node = ctx.node;
        } else {
          const nodeSet = this.evaluate(args[0], ctx);
          node = Array.isArray(nodeSet) ? nodeSet[0] : nodeSet;
        }
        if (!node) return "";
        return node.namespaceURI || "";
      },
      name: (args, ctx) => {
        let node;
        if (args.length === 0) {
          node = ctx.node;
        } else {
          const nodeSet = this.evaluate(args[0], ctx);
          node = Array.isArray(nodeSet) ? nodeSet[0] : nodeSet;
        }
        if (!node) return "";
        return node.nodeName || "";
      },

      // String functions
      string: (args, ctx) => {
        if (args.length === 0) {
          return this.toString([ctx.node]);
        }
        return this.toString(this.evaluate(args[0], ctx));
      },
      concat: (args, ctx) => {
        return args
          .map((arg) => this.toString(this.evaluate(arg, ctx)))
          .join("");
      },
      "starts-with": (args, ctx) => {
        const str = this.toString(this.evaluate(args[0], ctx));
        const prefix = this.toString(this.evaluate(args[1], ctx));
        return str.startsWith(prefix);
      },
      contains: (args, ctx) => {
        const str = this.toString(this.evaluate(args[0], ctx));
        const substr = this.toString(this.evaluate(args[1], ctx));
        return str.includes(substr);
      },
      "substring-before": (args, ctx) => {
        const str = this.toString(this.evaluate(args[0], ctx));
        const substr = this.toString(this.evaluate(args[1], ctx));
        const idx = str.indexOf(substr);
        return idx === -1 ? "" : str.substring(0, idx);
      },
      "substring-after": (args, ctx) => {
        const str = this.toString(this.evaluate(args[0], ctx));
        const substr = this.toString(this.evaluate(args[1], ctx));
        const idx = str.indexOf(substr);
        return idx === -1 ? "" : str.substring(idx + substr.length);
      },
      substring: (args, ctx) => {
        const str = this.toString(this.evaluate(args[0], ctx));
        let start = Math.round(this.toNumber(this.evaluate(args[1], ctx)));
        let length;

        if (args.length > 2) {
          length = Math.round(this.toNumber(this.evaluate(args[2], ctx)));
        }

        // XPath uses 1-based indexing
        start = start - 1;

        if (isNaN(start)) return "";
        if (start < 0) {
          if (length !== undefined) {
            length = length + start;
          }
          start = 0;
        }

        if (length !== undefined) {
          if (isNaN(length) || length <= 0) return "";
          return str.substring(start, start + length);
        }

        return str.substring(start);
      },
      "string-length": (args, ctx) => {
        const str =
          args.length === 0
            ? this.toString([ctx.node])
            : this.toString(this.evaluate(args[0], ctx));
        return str.length;
      },
      "normalize-space": (args, ctx) => {
        const str =
          args.length === 0
            ? this.toString([ctx.node])
            : this.toString(this.evaluate(args[0], ctx));
        return str.trim().replace(/\s+/g, " ");
      },
      translate: (args, ctx) => {
        const str = this.toString(this.evaluate(args[0], ctx));
        const from = this.toString(this.evaluate(args[1], ctx));
        const to = this.toString(this.evaluate(args[2], ctx));

        let result = "";
        for (const char of str) {
          const idx = from.indexOf(char);
          if (idx === -1) {
            result += char;
          } else if (idx < to.length) {
            result += to[idx];
          }
          // If idx >= to.length, character is removed
        }
        return result;
      },

      // Boolean functions
      boolean: (args, ctx) => {
        return this.toBoolean(this.evaluate(args[0], ctx));
      },
      not: (args, ctx) => {
        return !this.toBoolean(this.evaluate(args[0], ctx));
      },
      true: () => true,
      false: () => false,
      lang: (args, ctx) => {
        const lang = this.toString(this.evaluate(args[0], ctx)).toLowerCase();
        let node = ctx.node;

        while (node && node.nodeType === 1) {
          const xmlLang =
            node.getAttribute("xml:lang") || node.getAttribute("lang");
          if (xmlLang) {
            const nodeLang = xmlLang.toLowerCase();
            return nodeLang === lang || nodeLang.startsWith(lang + "-");
          }
          node = node.parentNode;
        }
        return false;
      },

      // Number functions
      number: (args, ctx) => {
        if (args.length === 0) {
          return this.toNumber([ctx.node]);
        }
        return this.toNumber(this.evaluate(args[0], ctx));
      },
      sum: (args, ctx) => {
        const nodeSet = this.evaluate(args[0], ctx);
        if (!Array.isArray(nodeSet)) return NaN;
        return nodeSet.reduce(
          (sum, node) => sum + this.toNumber(this.getStringValue(node)),
          0,
        );
      },
      floor: (args, ctx) => {
        return Math.floor(this.toNumber(this.evaluate(args[0], ctx)));
      },
      ceiling: (args, ctx) => {
        return Math.ceil(this.toNumber(this.evaluate(args[0], ctx)));
      },
      round: (args, ctx) => {
        const num = this.toNumber(this.evaluate(args[0], ctx));
        if (isNaN(num)) return NaN;
        if (num === -0.5) return -0;
        return Math.round(num);
      },
    };
  }
}
