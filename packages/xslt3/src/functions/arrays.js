/**
 * Functions on arrays (F&O 3.1 section 17.3), in the namespace
 * http://www.w3.org/2005/xpath-functions/array.
 *
 * @module @tradik/xslt3/functions/arrays
 */

import { XPathError } from "../errors.js";
import { XdmArray } from "../items/array.js";
import { isArray } from "../xdm/atomic.js";
import { integerItem } from "../xpath/eval/atomics.js";
import { arraySortFunctions } from "./arraySort.js";
import { NS } from "./signatures.js";

/**
 * @param {string} local
 * @param {string[]} params
 * @param {string} returns
 * @param {Function} impl
 * @returns {object} a definition in the array namespace
 */
const arrayFunction = (local, params, returns, impl) => ({
  namespace: NS.array,
  local,
  params,
  returns,
  impl,
});

/**
 * Checks a position for insertion (1 to size + 1).
 * @param {XdmArray} array
 * @param {*} position - xs:integer
 * @returns {number} 0-based index
 */
function insertionIndex(array, position) {
  const index = Number(position.value) - 1;
  if (!(index >= 0 && index <= array.size)) {
    throw new XPathError(
      "FOAY0001",
      `Position ${position.value} is out of bounds`,
    );
  }
  return index;
}

/**
 * Flattens arrays in a sequence, recursively.
 * @param {Array} sequence
 * @returns {Array}
 */
const flatten = (sequence) =>
  sequence.flatMap((item) =>
    isArray(item) ? flatten(item.members.flat()) : [item],
  );

/**
 * array:subsequence.
 * @returns {Array}
 */
function subarray([[array], [start], length]) {
  const from = Number(start.value) - 1;
  if (from < 0 || from > array.size) {
    throw new XPathError("FOAY0001", "Subarray start out of bounds");
  }
  const count = length ? Number(length[0].value) : array.size - from;
  if (count < 0) throw new XPathError("FOAY0002", "Negative length");
  if (from + count > array.size) {
    throw new XPathError("FOAY0001", "Subarray out of bounds");
  }
  return [new XdmArray(array.members.slice(from, from + count))];
}

/** Function definitions. */
export const arrayFunctions = [
  arrayFunction("size", ["array(*)"], "xs:integer", ([[a]]) => [
    integerItem(a.size),
  ]),
  arrayFunction("get", ["array(*)", "xs:integer"], "item()*", ([[a], [i]]) =>
    a.get(i.value),
  ),
  arrayFunction(
    "put",
    ["array(*)", "xs:integer", "item()*"],
    "array(*)",
    ([[a], [i], v]) => {
      a.get(i.value);
      const members = a.members.slice();
      members[Number(i.value) - 1] = v;
      return [new XdmArray(members)];
    },
  ),
  arrayFunction("append", ["array(*)", "item()*"], "array(*)", ([[a], v]) => [
    new XdmArray([...a.members, v]),
  ]),
  ...[2, 3].map((arity) =>
    arrayFunction(
      "subarray",
      ["array(*)", "xs:integer", "xs:integer"].slice(0, arity),
      "array(*)",
      subarray,
    ),
  ),
  arrayFunction(
    "remove",
    ["array(*)", "xs:integer*"],
    "array(*)",
    ([[a], positions]) => {
      const removed = new Set(
        positions.map((p) => (a.get(p.value), Number(p.value) - 1)),
      );
      return [new XdmArray(a.members.filter((_, i) => !removed.has(i)))];
    },
  ),
  arrayFunction(
    "insert-before",
    ["array(*)", "xs:integer", "item()*"],
    "array(*)",
    ([[a], [p], v]) => {
      const members = a.members.slice();
      members.splice(insertionIndex(a, p), 0, v);
      return [new XdmArray(members)];
    },
  ),
  arrayFunction("head", ["array(*)"], "item()*", ([[a]]) => a.get(1)),
  arrayFunction("tail", ["array(*)"], "array(*)", ([[a]]) => {
    a.get(1);
    return [new XdmArray(a.members.slice(1))];
  }),
  arrayFunction("reverse", ["array(*)"], "array(*)", ([[a]]) => [
    new XdmArray(a.members.slice().reverse()),
  ]),
  arrayFunction("join", ["array(*)*"], "array(*)", ([arrays]) => [
    new XdmArray(arrays.flatMap((a) => a.members)),
  ]),
  arrayFunction("flatten", ["item()*"], "item()*", ([sequence]) =>
    flatten(sequence),
  ),
  arrayFunction(
    "for-each",
    ["array(*)", "function(item()*) as item()*"],
    "array(*)",
    ([[a], [f]]) => [new XdmArray(a.members.map((m) => f.invoke([m])))],
  ),
  arrayFunction(
    "filter",
    ["array(*)", "function(item()*) as xs:boolean"],
    "array(*)",
    ([[a], [f]]) => [
      new XdmArray(a.members.filter((m) => f.invoke([m])[0].value)),
    ],
  ),
  arrayFunction(
    "fold-left",
    ["array(*)", "item()*", "function(item()*, item()*) as item()*"],
    "item()*",
    ([[a], zero, [f]]) =>
      a.members.reduce((acc, m) => f.invoke([acc, m]), zero),
  ),
  arrayFunction(
    "fold-right",
    ["array(*)", "item()*", "function(item()*, item()*) as item()*"],
    "item()*",
    ([[a], zero, [f]]) =>
      a.members.reduceRight((acc, m) => f.invoke([m, acc]), zero),
  ),
  arrayFunction(
    "for-each-pair",
    ["array(*)", "array(*)", "function(item()*, item()*) as item()*"],
    "array(*)",
    ([[a], [b], [f]]) => {
      const length = Math.min(a.size, b.size);
      const members = [];
      for (let i = 0; i < length; i++) {
        members.push(f.invoke([a.members[i], b.members[i]]));
      }
      return [new XdmArray(members)];
    },
  ),
  ...arraySortFunctions,
];
