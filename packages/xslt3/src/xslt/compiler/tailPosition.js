/**
 * Tail positions (XSLT 3.0 section 7.2): xsl:break and
 * xsl:next-iteration must be the last instruction of the body of the
 * innermost xsl:iterate, or of an xsl:if, xsl:when, xsl:otherwise,
 * xsl:try or xsl:catch that is itself in a tail position (XTSE3120).
 *
 * @module @tradik/xslt3/xslt/compiler/tailPosition
 */

import { isXsl, xsltError } from "../names.js";

/** Containers through which a tail position extends, to the element in tail position. */
const CONTAINERS = {
  if: (parent) => parent,
  when: (parent) => parent.parentNode,
  otherwise: (parent) => parent.parentNode,
  try: (parent) => parent,
  catch: (parent) => parent.parentNode,
};

/**
 * Whether a child is the last instruction of its parent, ignoring
 * xsl:fallback (and the xsl:catch children of xsl:try).
 * @param {object} child
 * @param {Element} parent
 * @param {object} cx - Stylesheet compiler (`children`)
 * @returns {boolean}
 */
function isLast(child, parent, cx) {
  const children = cx.children(parent);
  const index = children.indexOf(child);
  return children
    .slice(index + 1)
    .every(
      (next) =>
        isXsl(next, "fallback") ||
        (isXsl(parent, "try") && isXsl(next, "catch")),
    );
}

/**
 * Checks that an xsl:break or xsl:next-iteration is in a tail position
 * of an xsl:iterate body.
 * @param {Element} element
 * @param {object} cx
 * @throws {import("../../errors.js").XPathError} XTSE0010 outside
 *   xsl:iterate, XTSE3120 elsewhere than in a tail position
 */
export function checkTailPosition(element, cx) {
  let ancestor = element.parentNode;
  while (ancestor?.nodeType === 1 && !isXsl(ancestor, "iterate")) {
    ancestor = ancestor.parentNode;
  }
  if (ancestor?.nodeType !== 1) {
    throw xsltError(
      "XTSE0010",
      `xsl:${element.localName} is only allowed within xsl:iterate`,
    );
  }
  let node = element;
  for (;;) {
    const parent = node.parentNode;
    const container = parent?.nodeType === 1 && isXsl(parent) && parent;
    if (!container || !isLast(node, parent, cx)) break;
    if (isXsl(parent, "iterate")) return;
    const up = CONTAINERS[parent.localName];
    if (!up) break;
    node = up(parent);
  }
  throw xsltError(
    "XTSE3120",
    `xsl:${element.localName} must be in a tail position of xsl:iterate`,
  );
}
