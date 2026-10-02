/**
 * Where an error of a stylesheet comes from: the module URI and, when the
 * DOM records them (@xmldom/xmldom does, jsdom does not), the line and
 * column of the stylesheet element. Compiled steps are mapped to their
 * element at compile time; the location is worked out only when an error
 * is raised, so running instructions costs nothing more.
 *
 * @module @tradik/xslt3/xslt/runtime/locations
 */

import { XPathError } from "../../errors.js";
import { moduleUriOf } from "../compiler/elementInfo.js";

/**
 * Location of an error.
 * @typedef {object} ErrorLocation
 * @property {string} [module] - URI of the stylesheet module
 * @property {number} [line] - 1-based line of the element
 * @property {number} [column] - 1-based column of the element
 */

/** @type {WeakMap<object, Node>} compiled steps to stylesheet nodes */
const stepNodes = new WeakMap();

/**
 * Records the stylesheet node a compiled step comes from.
 * @param {Function|object|null} step
 * @param {Node} node
 */
export function recordStep(step, node) {
  if (step) stepNodes.set(step, node);
}

/**
 * The location of a stylesheet node.
 * @param {Node} node - Element, or a text node (its parent is used)
 * @returns {ErrorLocation}
 */
export function locationOf(node) {
  const element = node.nodeType === 1 ? node : node.parentNode;
  const location = {};
  const module = element ? moduleUriOf(element) : undefined;
  if (module !== undefined) location.module = module;
  if (Number.isInteger(node.lineNumber)) location.line = node.lineNumber;
  if (Number.isInteger(node.columnNumber)) location.column = node.columnNumber;
  return location;
}

/**
 * Adds the location of a stylesheet node to an error that has none: the
 * `location` property, and "(line N of URI)" in the message when the
 * line is known.
 * @param {*} error
 * @param {Node|undefined} node
 * @returns {*} the error
 */
export function locate(error, node) {
  if (!(error instanceof XPathError) || error.location || !node) return error;
  const location = locationOf(node);
  error.location = location;
  if (location.line !== undefined) {
    const where = location.module ? ` of ${location.module}` : "";
    // the message without location, for err:description in xsl:catch
    error.plainMessage = error.message;
    error.message += ` (line ${location.line}${where})`;
  }
  return error;
}

/**
 * Adds to an error the location of the step that was running: the last
 * step started by the innermost body frame.
 * @param {*} error
 * @param {object[]} frames - The work stack (see machine.js)
 * @param {number} base - Frames below it belong to an outer driver
 * @returns {*} the error
 */
export function locateInFrames(error, frames, base) {
  if (!(error instanceof XPathError) || error.location) return error;
  for (let i = frames.length - 1; i >= base; i--) {
    const { body, index } = frames[i];
    const node = body && index > 0 ? stepNodes.get(body[index - 1]) : null;
    if (node) return locate(error, node);
  }
  return error;
}
