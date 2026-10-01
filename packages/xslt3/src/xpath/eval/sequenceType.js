/**
 * Sequence types (XPath 3.1 section 2.5) compiled from the AST, and
 * sequence type matching (section 2.5.5): `instance of`, `treat as`,
 * typed variables and function signatures.
 *
 * A compiled sequence type is `{itemType, occurrence}` with `itemType`
 * null for empty-sequence(). A compiled item type has a `kind` ("item",
 * "atomic", "node", "anyFunction", "function", "anyMap", "map",
 * "anyArray", "array"), the fields of that kind and `matches(item)`.
 *
 * @module @tradik/xslt3/xpath/eval/sequenceType
 */

import {
  isArray,
  isAtomic,
  isFunctionItem,
  isMap,
  isNode,
} from "../../xdm/atomic.js";
import { derivesFrom, types } from "../../xdm/types.js";
import { compileKindTest } from "./nodeTests.js";
import { isSubtype } from "./subtype.js";
import { resolveAtomicType } from "./typeNames.js";

/** @typedef {{itemType: object|null, occurrence: string}} SequenceType */

/** item()* */
export const ANY_SEQUENCE = Object.freeze({
  itemType: Object.freeze({ kind: "item", matches: () => true }),
  occurrence: "*",
});

/**
 * Atomic item type of a list of member types.
 * @param {object[]} members - Atomic type descriptors
 * @returns {object} the item type
 */
export function atomicItemType(members) {
  const matches =
    members.length === 1
      ? (item) => isAtomic(item) && derivesFrom(item.type, members[0])
      : (item) =>
          isAtomic(item) && members.some((t) => derivesFrom(item.type, t));
  return { kind: "atomic", types: members, matches };
}

/** Signature of every map as a function: function(xs:anyAtomicType) as item()* */
export const MAP_SIGNATURE = Object.freeze({
  params: [{ itemType: atomicItemType([types.anyAtomicType]), occurrence: "" }],
  returns: ANY_SEQUENCE,
});

/** Signature of every array as a function: function(xs:integer) as item()* */
export const ARRAY_SIGNATURE = Object.freeze({
  params: [{ itemType: atomicItemType([types.integer]), occurrence: "" }],
  returns: ANY_SEQUENCE,
});

/**
 * @param {number} length - Number of items
 * @param {string} occurrence - "", "?", "*" or "+"
 * @returns {boolean} whether the number of items is allowed
 */
export function occurrenceAllows(length, occurrence) {
  if (length === 1) return true;
  if (length === 0) return occurrence === "?" || occurrence === "*";
  return occurrence === "*" || occurrence === "+";
}

/**
 * @param {Array} sequence
 * @param {SequenceType} type
 * @returns {boolean} whether the sequence matches the type
 */
export function matchesSequenceType(sequence, type) {
  if (type.itemType === null) return sequence.length === 0;
  if (!occurrenceAllows(sequence.length, type.occurrence)) return false;
  const { matches } = type.itemType;
  for (const item of sequence) if (!matches(item)) return false;
  return true;
}

/**
 * @param {*} item - A function item, map or array
 * @returns {{params: SequenceType[], returns: SequenceType}} its signature
 */
export function signatureOf(item) {
  if (isMap(item)) return MAP_SIGNATURE;
  if (isArray(item)) return ARRAY_SIGNATURE;
  return item.signature;
}

/**
 * Whether a map or an array matches a typed function test (XPath 3.1
 * 2.5.5.7): by its actual entries, as a function of one key or position.
 * @param {*} item - Map or array
 * @param {object} test - Compiled TypedFunctionTest
 * @returns {boolean}
 */
function lookupMatches(item, test) {
  if (test.params.length !== 1) return false;
  const [param] = test.params;
  const { returns } = test;
  if (isMap(item)) {
    return (
      isSubtype(param, MAP_SIGNATURE.params[0]) &&
      matchesSequenceType([], returns) &&
      [...item.entries.values()].every(({ value }) =>
        matchesSequenceType(value, returns),
      )
    );
  }
  return (
    isSubtype(param, ARRAY_SIGNATURE.params[0]) &&
    item.members.every((member) => matchesSequenceType(member, returns))
  );
}

/** Item type compilers by AST node type. */
const itemTypes = {
  AnyItemTest: () => ANY_SEQUENCE.itemType,
  AtomicType: (node, sc) => atomicItemType(resolveAtomicType(node.name, sc)),
  AnyFunctionTest: () => ({ kind: "anyFunction", matches: isFunctionItem }),
  AnyMapTest: () => ({ kind: "anyMap", matches: isMap }),
  AnyArrayTest: () => ({ kind: "anyArray", matches: isArray }),
  TypedFunctionTest(node, sc) {
    const type = {
      kind: "function",
      params: node.paramTypes.map((p) => compileSequenceType(p, sc)),
      returns: compileSequenceType(node.returnType, sc),
    };
    type.matches = (item) => {
      if (!isFunctionItem(item)) return false;
      if (isMap(item) || isArray(item)) return lookupMatches(item, type);
      const signature = signatureOf(item);
      if (signature.params.length !== type.params.length) return false;
      return isSubtype(
        { itemType: { kind: "function", ...signature }, occurrence: "" },
        { itemType: type, occurrence: "" },
      );
    };
    return type;
  },
  TypedMapTest(node, sc) {
    const keyType = compileItemType(node.keyType, sc);
    const valueType = compileSequenceType(node.valueType, sc);
    const matches = (item) =>
      isMap(item) &&
      [...item.entries.values()].every(
        ({ key, value }) =>
          keyType.matches(key) && matchesSequenceType(value, valueType),
      );
    return { kind: "map", keyType, valueType, matches };
  },
  TypedArrayTest(node, sc) {
    const memberType = compileSequenceType(node.memberType, sc);
    const matches = (item) =>
      isArray(item) &&
      item.members.every((member) => matchesSequenceType(member, memberType));
    return { kind: "array", memberType, matches };
  },
};

/**
 * @param {import("../syntax/typeAst.js").ItemType} node
 * @param {import("./staticContext.js").StaticContext} sc
 * @returns {object} the compiled item type
 * @throws {XPathError} XPST0051 (unknown atomic type), XPST0008, XPST0081
 */
export function compileItemType(node, sc) {
  const compiler = itemTypes[node.type];
  if (compiler) return compiler(node, sc);
  const test = compileKindTest(node, sc);
  return {
    kind: "node",
    test,
    matches: (item) => isNode(item) && test.matches(item),
  };
}

/**
 * @param {import("../syntax/typeAst.js").SequenceType} node
 * @param {import("./staticContext.js").StaticContext} sc
 * @returns {SequenceType}
 */
export function compileSequenceType(node, sc) {
  return {
    itemType:
      node.itemType === null ? null : compileItemType(node.itemType, sc),
    occurrence: node.occurrence,
  };
}
