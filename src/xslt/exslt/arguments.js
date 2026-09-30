/**
 * Argument helpers shared by the EXSLT modules.
 *
 * EXSLT functions follow libexslt (the implementation bundled with libxslt,
 * which Chrome uses): a wrong number of arguments or a non node-set where a
 * node-set is required is an XPath error, so both throw here.
 */

"use strict";

// A namespace name is an identifier, not a URL that is fetched; EXSLT defines them with http.
/** Namespace of the EXSLT common module. */
export const EXSLT_COMMON = "http://exslt.org/common"; // NOSONAR
/** Namespace of the EXSLT math module. */
export const EXSLT_MATH = "http://exslt.org/math"; // NOSONAR
/** Namespace of the EXSLT sets module. */
export const EXSLT_SETS = "http://exslt.org/sets"; // NOSONAR
/** Namespace of the EXSLT strings module. */
export const EXSLT_STRINGS = "http://exslt.org/strings"; // NOSONAR
/** Namespace of the EXSLT dates-and-times module. */
export const EXSLT_DATES = "http://exslt.org/dates-and-times"; // NOSONAR
/** Namespace of the EXSLT dynamic module. */
export const EXSLT_DYNAMIC = "http://exslt.org/dynamic"; // NOSONAR

/**
 * Throw unless a call has an allowed number of arguments.
 *
 * @param {string} name - Function name, for the error message
 * @param {Array} args - Argument expressions
 * @param {number} min - Minimum number of arguments
 * @param {number} [max] - Maximum number of arguments, `min` by default
 * @throws {Error} When the number of arguments is outside `min..max`
 */
export function checkArity(name, args, min, max = min) {
  if (args.length < min || args.length > max) {
    const expected = min === max ? `${min}` : `${min} to ${max}`;
    throw new Error(
      `${name}() expects ${expected} argument(s), got ${args.length}`,
    );
  }
}

/**
 * Whether an evaluated value is a node-set: an array of nodes, or a single
 * node such as a result tree fragment (libxslt accepts both).
 *
 * @param {*} value - An evaluated XPath value
 * @returns {boolean} True for a node-set or a node
 */
export function isNodeSetValue(value) {
  return Array.isArray(value) || Boolean(value?.nodeType);
}

/**
 * Convert an evaluated argument that must be a node-set to an array.
 *
 * @param {string} name - Function name, for the error message
 * @param {*} value - An evaluated XPath value
 * @returns {Node[]} The nodes
 * @throws {TypeError} When the value is not a node-set
 */
export function toNodeSet(name, value) {
  if (Array.isArray(value)) return value;
  if (value?.nodeType) return [value];
  throw new TypeError(`${name}() expects a node-set`);
}

/**
 * Nodes without duplicates, in document order.
 *
 * @param {import('../../xpath/evaluator.js').XPathEvaluator} evaluator - Sorts the nodes
 * @param {Node[]} nodes - Any nodes
 * @returns {Node[]} A new, sorted array
 */
export function inDocumentOrder(evaluator, nodes) {
  return evaluator.sortByDocumentOrder([...new Set(nodes)]);
}

/**
 * Create the container of the nodes an extension function returns, the
 * counterpart of the result tree fragment libexslt creates for them.
 *
 * @param {import('../../xpath/evaluator.js').XPathContext} ctx - Evaluation context
 * @returns {DocumentFragment} An empty fragment
 */
export function createContainer(ctx) {
  const doc = ctx.node.ownerDocument || ctx.node;
  return doc.createDocumentFragment();
}

/**
 * Split a string into its characters (Unicode code points).
 *
 * @param {string} str - Any string
 * @returns {string[]} The characters
 */
export function characters(str) {
  return Array.from(str);
}
