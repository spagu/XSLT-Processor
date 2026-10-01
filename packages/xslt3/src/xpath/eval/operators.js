/**
 * Compilers of the operator expressions: and/or, comparisons, `||`, `to`,
 * arithmetic and unary plus/minus (XPath 3.1 sections 3.4 to 3.8), with
 * the XPath 1.0 compatibility mode rules for arithmetic.
 *
 * @module @tradik/xslt3/xpath/eval/operators
 */

import { XPathError } from "../../errors.js";
import { arithmetic, unaryArithmetic } from "../../xdm/arithmetic.js";
import { AtomicValue, isNode } from "../../xdm/atomic.js";
import { cast } from "../../xdm/cast.js";
import { valueCompare } from "../../xdm/compare.js";
import { generalCompare, toNumber } from "../../xdm/generalCompare.js";
import { canonicalString } from "../../xdm/lexical.js";
import { atomize, effectiveBooleanValue } from "../../xdm/nodes.js";
import { derivesFrom, isNumericType, types } from "../../xdm/types.js";
import { atomizeOptional, booleanItem, stringItem } from "./atomics.js";

/** Largest sequence a range expression may build. */
export const MAX_RANGE = 2 ** 25;

const EMPTY = Object.freeze([]);
const NAN = new AtomicValue(types.double, NaN);

/**
 * Operand of an arithmetic operator in XPath 1.0 compatibility mode: the
 * first atomized item, as xs:double unless it is a duration or date/time.
 * @param {Array} sequence
 * @returns {AtomicValue}
 */
function compatibleOperand(sequence) {
  const first = atomize(sequence.slice(0, 1))[0];
  if (first === undefined) return NAN;
  const primitive = first.type.primitive.localName;
  const toDouble =
    isNumericType(first.type) ||
    ["boolean", "string", "untypedAtomic", "anyURI"].includes(primitive);
  return toDouble ? toNumber(first) : first;
}

/**
 * @param {Array} sequence
 * @returns {*} the single node of a node comparison operand, undefined
 *   when empty
 * @throws {XPathError} XPTY0004 when the operand is not one node
 */
function nodeOperand(sequence) {
  if (sequence.length === 0) return undefined;
  if (sequence.length > 1 || !isNode(sequence[0])) {
    throw new XPathError(
      "XPTY0004",
      "A node comparison operand must be a single node",
    );
  }
  return sequence[0];
}

/**
 * Operand of a value comparison, xs:untypedAtomic cast to xs:string.
 * @param {Array} sequence
 * @returns {AtomicValue|undefined}
 */
function valueOperand(sequence) {
  const value = atomizeOptional(sequence, "operand of a value comparison");
  return value?.type === types.untypedAtomic
    ? cast(value, types.string)
    : value;
}

/**
 * Operand of a range expression.
 * @param {Array} sequence
 * @returns {bigint|undefined}
 */
function rangeOperand(sequence) {
  let value = atomizeOptional(sequence, "operand of to");
  if (value === undefined) return undefined;
  if (value.type === types.untypedAtomic) value = cast(value, types.integer);
  if (!derivesFrom(value.type, types.integer)) {
    throw new XPathError("XPTY0004", "The operands of to must be integers");
  }
  return value.value;
}

/** Comparison compilers by kind. */
const comparisons = {
  general: (op, left, right, compatible) => (ctx) => {
    const options = compatible
      ? ctx.dyn.compatibleCompareOptions
      : ctx.dyn.compareOptions;
    return [booleanItem(generalCompare(left(ctx), op, right(ctx), options))];
  },
  value: (op, left, right) => (ctx) => {
    const a = valueOperand(left(ctx));
    const b = valueOperand(right(ctx));
    if (a === undefined || b === undefined) return EMPTY;
    return [booleanItem(valueCompare(a, op, b, ctx.dyn.compareOptions))];
  },
  node: (op, left, right) => (ctx) => {
    const a = nodeOperand(left(ctx));
    const b = nodeOperand(right(ctx));
    if (a === undefined || b === undefined) return EMPTY;
    if (op === "is") return [booleanItem(a === b)];
    const order = ctx.dyn.order.compare(a, b);
    return [booleanItem(op === "<<" ? order < 0 : order > 0)];
  },
};

/** Compilers by node type. */
export const operatorCompilers = {
  LogicalExpr(node, scope, compile) {
    const left = compile(node.left, scope);
    const right = compile(node.right, scope);
    const isOr = node.operator === "or";
    return (ctx) => {
      const first = effectiveBooleanValue(left(ctx));
      if (first === isOr) return [booleanItem(isOr)];
      return [booleanItem(effectiveBooleanValue(right(ctx)))];
    };
  },

  ComparisonExpr(node, scope, compile) {
    return comparisons[node.kind](
      node.operator,
      compile(node.left, scope),
      compile(node.right, scope),
      scope.sc.backwardsCompatible,
    );
  },

  StringConcatExpr(node, scope, compile) {
    const left = compile(node.left, scope);
    const right = compile(node.right, scope);
    const text = (sequence) => {
      const value = atomizeOptional(sequence, "operand of ||");
      return value === undefined ? "" : canonicalString(value);
    };
    return (ctx) => [stringItem(text(left(ctx)) + text(right(ctx)))];
  },

  RangeExpr(node, scope, compile) {
    const left = compile(node.left, scope);
    const right = compile(node.right, scope);
    return (ctx) => {
      const low = rangeOperand(left(ctx));
      const high = rangeOperand(right(ctx));
      if (low === undefined || high === undefined || low > high) return EMPTY;
      if (high - low >= BigInt(MAX_RANGE)) {
        throw new XPathError("XPDY0130", "The range is too large");
      }
      const result = [];
      for (let i = low; i <= high; i++) {
        result.push(new AtomicValue(types.integer, i));
      }
      return result;
    };
  },

  ArithmeticExpr(node, scope, compile) {
    const left = compile(node.left, scope);
    const right = compile(node.right, scope);
    const op = node.operator;
    if (scope.sc.backwardsCompatible) {
      return (ctx) => {
        const a = compatibleOperand(left(ctx));
        const b = compatibleOperand(right(ctx));
        return [arithmetic(a, op, b, ctx.dyn.compareOptions)];
      };
    }
    return (ctx) => {
      const a = atomizeOptional(left(ctx), `operand of ${op}`);
      const b = atomizeOptional(right(ctx), `operand of ${op}`);
      if (a === undefined || b === undefined) return EMPTY;
      return [arithmetic(a, op, b, ctx.dyn.compareOptions)];
    };
  },

  UnaryExpr(node, scope, compile) {
    const operand = compile(node.operand, scope);
    const op = node.operator;
    if (scope.sc.backwardsCompatible) {
      return (ctx) => [unaryArithmetic(op, compatibleOperand(operand(ctx)))];
    }
    return (ctx) => {
      const a = atomizeOptional(operand(ctx), `operand of unary ${op}`);
      return a === undefined ? EMPTY : [unaryArithmetic(op, a)];
    };
  },
};
