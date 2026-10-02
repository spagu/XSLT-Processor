/**
 * Forwards-compatible processing and xsl:fallback (XSLT 1.0 sections 2.5
 * and 15).
 *
 * An element is processed in forwards-compatible mode when the nearest
 * enclosing `version` declaration (the `version` attribute of
 * `xsl:stylesheet`/`xsl:transform`, or the `xsl:version` attribute of a
 * literal result element) is not "1.0". In that mode unknown top-level XSLT
 * elements are ignored. An unknown XSLT instruction is replaced by its
 * `xsl:fallback` children when it has some (in any mode); otherwise it is an
 * error only if it is actually instantiated.
 *
 * @module xslt/forwardsCompatible
 */

"use strict";

import { XSLT_NAMESPACE } from "./elements.js";
import { xsltLocalName } from "./stylesheetChecks.js";

const modes = new WeakMap();

/**
 * The version declared on one stylesheet element, if any.
 *
 * @param {Element} element - A stylesheet element
 * @returns {string|null} The declared version, null when none
 */
export function declaredVersion(element) {
  const localName = xsltLocalName(element);
  if (localName === "stylesheet" || localName === "transform") {
    return element.getAttribute("version");
  }
  if (localName !== null) return null;
  return element.getAttributeNS?.(XSLT_NAMESPACE, "version") ?? null;
}

/**
 * Whether a stylesheet element is processed in forwards-compatible mode.
 * Cached per element.
 *
 * @param {Node|null} node - A stylesheet node
 * @returns {boolean} True when the version in effect is not "1.0"
 *
 * @example
 * isForwardsCompatible(instruction); // true under version="2.0"
 */
export function isForwardsCompatible(node) {
  if (node?.nodeType !== 1) return false;

  let forwards = modes.get(node);
  if (forwards === undefined) {
    const version = declaredVersion(node);
    forwards =
      version === null || version === ""
        ? isForwardsCompatible(node.parentNode)
        : version.trim() !== "1.0";
    modes.set(node, forwards);
  }
  return forwards;
}

/**
 * The `xsl:fallback` children of an instruction, in document order.
 *
 * @param {Element} instruction - An XSLT instruction
 * @returns {Element[]} The fallback elements
 */
export function fallbackChildren(instruction) {
  const fallbacks = [];
  for (let child = instruction.firstChild; child; child = child.nextSibling) {
    if (xsltLocalName(child) === "fallback") fallbacks.push(child);
  }
  return fallbacks;
}
