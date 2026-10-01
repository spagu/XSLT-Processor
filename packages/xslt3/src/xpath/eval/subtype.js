/**
 * Subtype relationships of sequence types and item types (XPath 3.1
 * section 2.5.6), used to match function items against function tests:
 * parameters are contravariant, results covariant.
 *
 * Item types are compiled ones (see sequenceType.js).
 *
 * @module @tradik/xslt3/xpath/eval/subtype
 */

import { derivesFrom, types } from "../../xdm/types.js";

/** Occurrences as the set of cardinalities they allow (0, 1, many). */
const CARDINALITIES = { "": "1", "?": "01", "*": "01m", "+": "1m" };

/**
 * @param {string} a - Occurrence indicator
 * @param {string} b - Occurrence indicator
 * @returns {boolean} whether every cardinality of a is allowed by b
 */
function occurrenceSubsumed(a, b) {
  return [...CARDINALITIES[a]].every((c) => CARDINALITIES[b].includes(c));
}

/**
 * @param {{params: object[], returns: object}} a
 * @param {{params: object[], returns: object}} b
 * @returns {boolean} whether signature a is a subtype of signature b
 */
function signatureSubtype(a, b) {
  return (
    a.params.length === b.params.length &&
    b.params.every((param, i) => isSubtype(param, a.params[i])) &&
    isSubtype(a.returns, b.returns)
  );
}

/**
 * The function signature that a map or array type stands for (XPath 3.1
 * 2.5.6.2: map(K, V) is a function(xs:anyAtomicType) as V?, array(T) a
 * function(xs:integer) as T).
 * @param {object} a - Map or array item type
 * @returns {{params: object[], returns: object}}
 */
function functionView(a) {
  const isMapType = a.kind === "anyMap" || a.kind === "map";
  const param = {
    itemType: {
      kind: "atomic",
      types: [isMapType ? types.anyAtomicType : types.integer],
    },
    occurrence: "",
  };
  let returns = ANY;
  if (a.kind === "map") {
    const { itemType, occurrence } = a.valueType;
    returns = {
      itemType,
      occurrence:
        occurrence === "" ? "?" : occurrence === "+" ? "*" : occurrence,
    };
  } else if (a.kind === "array") {
    returns = a.memberType;
  }
  return { params: [param], returns };
}

const ANY = { itemType: { kind: "item" }, occurrence: "*" };

/**
 * Whether item type a is a subtype of item type b.
 * @param {object} a
 * @param {object} b
 * @returns {boolean}
 */
export function itemSubtype(a, b) {
  if (b.kind === "item") return true;
  switch (a.kind) {
    case "atomic":
      return (
        b.kind === "atomic" &&
        a.types.every((t) => b.types.some((u) => derivesFrom(t, u)))
      );
    case "node":
      return b.kind === "node" && nodeSubtype(a.test, b.test);
    case "item":
      return false;
    default:
      return functionSubtype(a, b);
  }
}

/**
 * Subtyping of kind tests: same kind and, where b names a node, the same
 * name.
 * @param {object} a - Compiled kind test
 * @param {object} b - Compiled kind test
 * @returns {boolean}
 */
function nodeSubtype(a, b) {
  if (b.kind === null) return true;
  if (a.kind !== b.kind) return false;
  if (b.name !== null && a.name !== b.name) return false;
  if (b.element) return Boolean(a.element) && nodeSubtype(a.element, b.element);
  return true;
}

/**
 * Subtyping among function, map and array types.
 * @param {object} a
 * @param {object} b
 * @returns {boolean}
 */
function functionSubtype(a, b) {
  switch (b.kind) {
    case "anyFunction":
      return true;
    case "anyMap":
      return a.kind === "anyMap" || a.kind === "map";
    case "map":
      return (
        a.kind === "map" &&
        itemSubtype(a.keyType, b.keyType) &&
        isSubtype(a.valueType, b.valueType)
      );
    case "anyArray":
      return a.kind === "anyArray" || a.kind === "array";
    case "array":
      return a.kind === "array" && isSubtype(a.memberType, b.memberType);
    case "function":
      return a.kind === "function"
        ? signatureSubtype(a, b)
        : a.kind !== "anyFunction" && signatureSubtype(functionView(a), b);
    default:
      return false;
  }
}

/**
 * Whether sequence type a is a subtype of sequence type b.
 * @param {{itemType: object|null, occurrence: string}} a
 * @param {{itemType: object|null, occurrence: string}} b
 * @returns {boolean}
 */
export function isSubtype(a, b) {
  if (a.itemType === null) {
    return b.itemType === null || CARDINALITIES[b.occurrence].includes("0");
  }
  if (b.itemType === null) return false;
  return (
    occurrenceSubsumed(a.occurrence, b.occurrence) &&
    itemSubtype(a.itemType, b.itemType)
  );
}
