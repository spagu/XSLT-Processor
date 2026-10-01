/**
 * A basic XML serialization of engine results for the assertions that
 * compare serialized output (assert-xml, assert-serialization): sequence
 * normalization (arrays flattened, adjacent atomic values separated by a
 * space, document nodes replaced by their children), then nodes through
 * the XMLSerializer of @xmldom/xmldom.
 *
 * @module test-suites/lib/serialize
 */

import { XMLSerializer } from "@xmldom/xmldom";
import {
  canonicalString,
  isArray,
  isAtomic,
  isNode,
} from "../../src/xdm/index.js";

/**
 * Error of a value that cannot be serialized.
 *
 * @param {string} message - Description
 * @returns {Error} An error with the code SENR0001
 */
function senr0001(message) {
  return Object.assign(new Error(message), { code: "SENR0001" });
}

/**
 * Flatten arrays of a sequence.
 *
 * @param {Array} items - Items
 * @returns {Array} Items without arrays
 */
const flatten = (items) =>
  items.flatMap((item) =>
    isArray(item) ? flatten(item.members.flat()) : [item],
  );

/**
 * Serialize a sequence as XML.
 *
 * @param {*} value - Engine sequence (array) or single item
 * @returns {string} The serialization
 * @throws {Error} SENR0001 for attributes, namespace nodes, maps and
 *   function items
 */
export function serializeXml(value) {
  const serializer = new XMLSerializer();
  let output = "";
  let previousAtomic = false;
  for (const item of flatten(Array.isArray(value) ? value : [value])) {
    if (isAtomic(item)) {
      output += (previousAtomic ? " " : "") + canonicalString(item);
      previousAtomic = true;
      continue;
    }
    previousAtomic = false;
    if (!isNode(item) || item.nodeType === 2 || item.nodeType === 13) {
      throw senr0001("Only atomic values and nodes can be serialized");
    }
    const nodes = item.nodeType === 9 ? [...item.childNodes] : [item];
    for (const node of nodes) {
      if (node.nodeType !== 10) output += serializer.serializeToString(node);
    }
  }
  return output;
}
