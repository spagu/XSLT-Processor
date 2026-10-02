/**
 * The coercion rules (XPath 3.1 section 3.1.5.2, "function conversion
 * rules"): how a value is converted to an expected sequence type when it
 * is passed to a function or returned from one. Atomization, casting of
 * xs:untypedAtomic, numeric and URI promotion, function coercion, then a
 * type check (XPTY0004); in XPath 1.0 compatibility mode the 1.0
 * conversions to string and number come first.
 *
 * @module @tradik/xslt3/xpath/eval/coercion
 */

import { XPathError } from "../../errors.js";
import { isFunctionItem } from "../../xdm/atomic.js";
import { cast } from "../../xdm/cast.js";
import { toNumber } from "../../xdm/generalCompare.js";
import { atomize, stringValue } from "../../xdm/nodes.js";
import { derivesFrom, types } from "../../xdm/types.js";
import { FunctionItem } from "../../items/function.js";
import { stringItem } from "./atomics.js";
import { matchesSequenceType } from "./sequenceType.js";

/**
 * Promotes or casts one atomic value towards the expected atomic types.
 * @param {import("../../xdm/atomic.js").AtomicValue} value
 * @param {object[]} expected - Atomic type descriptors
 * @returns {import("../../xdm/atomic.js").AtomicValue}
 */
function convertAtomic(value, expected) {
  if (expected.some((t) => derivesFrom(value.type, t))) return value;
  if (value.type === types.untypedAtomic) {
    if (
      expected.some((t) => t.primitive === types.QName || t === types.NOTATION)
    ) {
      throw new XPathError(
        "XPTY0117",
        "An untyped value cannot be converted to xs:QName or xs:NOTATION",
      );
    }
    const target = expected.length > 1 ? types.double : expected[0];
    return target.abstract ? value : cast(value, target);
  }
  const primitive = value.type.primitive.localName;
  for (const target of expected) {
    const name = target.localName;
    const numeric =
      (name === "double" &&
        (primitive === "decimal" || primitive === "float")) ||
      (name === "float" && primitive === "decimal");
    if (numeric || (name === "string" && primitive === "anyURI")) {
      return cast(value, target);
    }
  }
  return value;
}

/**
 * XPath 1.0 compatibility mode conversions of an argument: only the
 * first item is kept for a single expected item, converted with fn:string
 * for xs:string and fn:number for xs:double.
 * @param {Array} sequence
 * @param {object|null} itemType - Expected item type
 * @param {string} occurrence
 * @returns {Array}
 */
function compatible(sequence, itemType, occurrence) {
  if (occurrence === "*" || occurrence === "+") return sequence;
  const first = sequence.slice(0, 1);
  const expected = itemType?.kind === "atomic" ? itemType.types[0] : null;
  if (expected === types.string) {
    return [stringItem(first.length ? stringValue(first[0]) : "")];
  }
  if (expected === types.double) {
    const value = atomize(first)[0];
    return [value ? toNumber(value) : toNumber(stringItem("NaN"))];
  }
  return first;
}

/**
 * Function coercion: wraps a function item so that it has the signature
 * of a function test.
 * @param {*} item
 * @param {object} test - Compiled TypedFunctionTest
 * @param {string} what - Description for error messages
 * @returns {FunctionItem}
 */
function coerceFunction(item, test, what) {
  if (item.arity !== test.params.length) {
    throw new XPathError(
      "XPTY0004",
      `The ${what} must be a function of arity ${test.params.length}`,
    );
  }
  return new FunctionItem({
    name: item.name,
    arity: item.arity,
    signature: { params: test.params, returns: test.returns },
    invoke: (args) =>
      coerce(
        item.invoke(
          args.map((arg, i) =>
            coerce(arg, test.params[i], {
              what: `argument ${i + 1} of ${what}`,
            }),
          ),
        ),
        test.returns,
        { what: `result of ${what}` },
      ),
  });
}

/**
 * Converts a value to an expected sequence type.
 * @param {Array} sequence
 * @param {import("./sequenceType.js").SequenceType} type
 * @param {{what: string, compatible?: boolean}} options - `what` names
 *   the value in error messages; `compatible` applies the XPath 1.0 rules
 * @returns {Array} the converted value
 * @throws {XPathError} XPTY0004 when the value does not match the type,
 *   cast errors (FORG0001...) for untyped values
 */
export function coerce(sequence, type, options) {
  const itemType = type.itemType;
  if (itemType?.kind === "item" && type.occurrence === "*") return sequence;
  let value = sequence;
  if (options.compatible) {
    value = compatible(value, itemType, type.occurrence);
  }
  if (itemType?.kind === "atomic") {
    value = atomize(value).map((v) => convertAtomic(v, itemType.types));
  } else if (itemType?.kind === "function") {
    value = value.map((item) =>
      isFunctionItem(item) && !itemType.matches(item)
        ? coerceFunction(item, itemType, options.what)
        : item,
    );
  }
  if (!matchesSequenceType(value, type)) {
    throw new XPathError(
      "XPTY0004",
      `The ${options.what} does not match the required type`,
    );
  }
  return value;
}
