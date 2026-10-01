/**
 * fn:random-number-generator (F&O 3.1 section 17.3.1): a map with a
 * pseudo-random `number` in [0, 1), a `next` generator and a `permute`
 * function. The sequence is deterministic for a seed (the canonical string
 * of the seed value, hashed with FNV-1a) and uses the Mulberry32
 * generator; without a seed, the current date and time of the evaluation
 * is the seed, so calls in one evaluation agree.
 *
 * @module @tradik/xslt3/functions/random
 */

import { FunctionItem } from "../items/function.js";
import { XdmMap } from "../items/map.js";
import { formatDateTime } from "../xdm/datetime.js";
import { canonicalString } from "../xdm/lexical.js";
import { sequenceTypeOf } from "../xpath/eval/functionItems.js";
import { define, doubleItem, stringItem } from "./support.js";

/**
 * FNV-1a hash of a string.
 * @param {string} text
 * @returns {number} an unsigned 32-bit integer
 */
export function hashSeed(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
  }
  return hash >>> 0;
}

/**
 * One step of Mulberry32.
 * @param {number} state - Unsigned 32-bit state
 * @returns {[number, number]} a number in [0, 1) and the next state
 */
export function step(state) {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next];
}

/**
 * A random permutation (Fisher-Yates) of a sequence.
 * @param {Array} items
 * @param {number} state
 * @returns {Array}
 */
function permute(items, state) {
  const result = [...items];
  let s = state;
  for (let i = result.length - 1; i > 0; i--) {
    const [r, next] = step(s);
    s = next;
    const j = Math.floor(r * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

const NEXT = {
  params: [],
  returns: sequenceTypeOf("map(xs:string, item())"),
};
const PERMUTE = {
  params: [sequenceTypeOf("item()*")],
  returns: sequenceTypeOf("item()*"),
};

/**
 * The generator map of a state.
 * @param {number} state
 * @returns {XdmMap}
 */
export function generator(state) {
  const [number, next] = step(state);
  return XdmMap.from([
    [stringItem("number"), [doubleItem(number)]],
    [
      stringItem("next"),
      [
        new FunctionItem({
          arity: 0,
          signature: NEXT,
          invoke: () => [generator(next)],
        }),
      ],
    ],
    [
      stringItem("permute"),
      [
        new FunctionItem({
          arity: 1,
          signature: PERMUTE,
          invoke: ([items]) => permute(items, hashSeed(`p${next}`)),
        }),
      ],
    ],
  ]);
}

/**
 * The seed of an optional atomic value.
 * @param {Array} seed
 * @param {object} context - Gives the current date and time
 * @returns {number}
 */
const seedOf = (seed, context) =>
  hashSeed(
    seed.length
      ? `${seed[0].type.primitive.localName}:${canonicalString(seed[0])}`
      : formatDateTime("dateTime", context.currentDateTime),
  );

/** Function definitions. */
export const randomFunctions = [
  define("random-number-generator", [], "map(xs:string, item())", (_, c) => [
    generator(seedOf([], c)),
  ]),
  define(
    "random-number-generator",
    ["xs:anyAtomicType?"],
    "map(xs:string, item())",
    ([seed], c) => [generator(seedOf(seed, c))],
  ),
];
