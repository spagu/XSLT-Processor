/**
 * Arithmetic operators of XPath 3.1 (section 3.5, appendix B.2) on atomic
 * values: numeric operators with type promotion here, date/time and
 * duration operators in {@link module:@tradik/xslt3/xdm/temporalArithmetic}.
 *
 * xs:integer arithmetic is exact (BigInt), xs:decimal arithmetic is exact
 * except division, which keeps {@link DIVISION_SCALE} fraction digits;
 * xs:float results are rounded with Math.fround; xs:double follows IEEE 754.
 *
 * @module @tradik/xslt3/xdm/arithmetic
 */

import { XPathError } from "../errors.js";
import { AtomicValue } from "./atomic.js";
import { cast } from "./cast.js";
import { Decimal } from "./decimal.js";
import { temporalArithmetic } from "./temporalArithmetic.js";
import { isNumericType, types } from "./types.js";

/**
 * xs:untypedAtomic operands are cast to xs:double (XPath 3.1 3.5).
 * @param {AtomicValue} item
 * @returns {AtomicValue}
 */
function prepare(item) {
  return item.type === types.untypedAtomic ? cast(item, types.double) : item;
}

/** @param {string} what @returns {never} */
function divisionByZero(what) {
  throw new XPathError("FOAR0001", `Division by zero in ${what}`);
}

/** Exact operators on BigInt (xs:integer) operands. */
const integerOps = {
  "+": (a, b) => a + b,
  "-": (a, b) => a - b,
  "*": (a, b) => a * b,
  div: (a, b) => decimalOps.div(Decimal.of(a), Decimal.of(b)),
  idiv: (a, b) => (b === 0n ? divisionByZero("idiv") : a / b),
  mod: (a, b) => (b === 0n ? divisionByZero("mod") : a % b),
};

/** Operators on {@link Decimal} operands. */
const decimalOps = {
  "+": (a, b) => a.add(b),
  "-": (a, b) => a.sub(b),
  "*": (a, b) => a.mul(b),
  div: (a, b) => (b.sign() === 0 ? divisionByZero("div") : a.div(b)),
  idiv: (a, b) => (b.sign() === 0 ? divisionByZero("idiv") : a.idiv(b)),
  mod: (a, b) => (b.sign() === 0 ? divisionByZero("mod") : a.mod(b)),
};

/** IEEE operators on JS numbers; `round` is Math.fround for xs:float. */
function floatingOp(op, a, b, round) {
  switch (op) {
    case "+":
      return round(a + b);
    case "-":
      return round(a - b);
    case "*":
      return round(a * b);
    case "div":
      return round(a / b);
    case "mod":
      return round(a % b);
    default: {
      if (b === 0) divisionByZero("idiv");
      const quotient = round(a / b);
      if (!Number.isFinite(quotient)) {
        throw new XPathError("FOAR0002", "idiv of NaN or infinite values");
      }
      return BigInt(Math.trunc(quotient));
    }
  }
}

/**
 * Numeric operation with promotion integer → decimal → float → double.
 * @param {AtomicValue} a
 * @param {string} op
 * @param {AtomicValue} b
 * @returns {AtomicValue}
 */
function numericArithmetic(a, op, b) {
  const pa = a.type.primitive.localName;
  const pb = b.type.primitive.localName;
  if (pa === "decimal" && pb === "decimal") {
    const integers = typeof a.value === "bigint" && typeof b.value === "bigint";
    const toDecimal = (v) => (typeof v === "bigint" ? Decimal.of(v) : v);
    const value = integers
      ? integerOps[op](a.value, b.value)
      : decimalOps[op](toDecimal(a.value), toDecimal(b.value));
    return new AtomicValue(
      typeof value === "bigint" ? types.integer : types.decimal,
      value,
    );
  }
  const isDouble = pa === "double" || pb === "double";
  const asNumber = (item) =>
    cast(item, isDouble ? types.double : types.float).value;
  const value = floatingOp(
    op,
    asNumber(a),
    asNumber(b),
    isDouble ? Number : Math.fround,
  );
  if (typeof value === "bigint") return new AtomicValue(types.integer, value);
  return new AtomicValue(isDouble ? types.double : types.float, value);
}

/**
 * Binary arithmetic `a op b` on two atomic values: numbers, durations,
 * dates and times (empty operands are the evaluator's concern).
 * @param {AtomicValue} a
 * @param {"+"|"-"|"*"|"div"|"idiv"|"mod"} op
 * @param {AtomicValue} b
 * @param {{implicitTimezone?: number}} [options] - Implicit timezone in
 *   minutes, for subtracting dates and times
 * @returns {AtomicValue}
 * @throws {XPathError} XPTY0004 for unsupported operand types, FOAR0001
 *   for division by zero, FOAR0002 for idiv of NaN/INF, FORG0001 for
 *   untyped operands that are not numbers, FODT0001/FODT0002/FOCA0005 for
 *   date and duration arithmetic
 */
export function arithmetic(a, op, b, options = {}) {
  const x = prepare(a);
  const y = prepare(b);
  if (isNumericType(x.type) && isNumericType(y.type)) {
    return numericArithmetic(x, op, y);
  }
  return temporalArithmetic(x, op, y, options);
}

/**
 * Unary minus or plus on a numeric value (xs:untypedAtomic is cast to
 * xs:double). The result has the operand's primitive numeric type.
 * @param {"-"|"+"} op
 * @param {AtomicValue} a
 * @returns {AtomicValue}
 * @throws {XPathError} XPTY0004 for non-numeric operands
 */
export function unaryArithmetic(op, a) {
  const x = prepare(a);
  if (!isNumericType(x.type)) {
    throw new XPathError(
      "XPTY0004",
      `Unary ${op} is not defined for ${x.type.prefixedName}`,
    );
  }
  const { value } = x;
  const type = typeof value === "bigint" ? types.integer : x.type.primitive;
  if (op === "+") return new AtomicValue(type, value);
  return new AtomicValue(type, value instanceof Decimal ? value.neg() : -value);
}
