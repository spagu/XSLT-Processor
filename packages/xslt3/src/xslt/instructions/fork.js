/**
 * xsl:fork (XSLT 3.0 section 16.1): its xsl:sequence or
 * xsl:for-each-group children run one after the other (this processor
 * does not stream, so there is nothing to fork) and their results are
 * concatenated.
 *
 * @module @tradik/xslt3/xslt/instructions/fork
 */

import { compileBody } from "../compiler/body.js";
import { isXsl, xsltError } from "../names.js";

/**
 * xsl:fork.
 * @param {Element} element
 * @param {object} cx
 * @param {object} scope
 * @returns {Function}
 */
export function compileFork(element, cx, scope) {
  const children = cx.children(element);
  const branches = children.filter((c) => !isXsl(c, "fallback"));
  const groups = branches.filter((c) => isXsl(c, "for-each-group")).length;
  const valid =
    branches.every((c) => isXsl(c, "sequence") || isXsl(c, "for-each-group")) &&
    (groups === 0 || branches.length === 1);
  if (!valid) {
    throw xsltError(
      "XTSE0010",
      "xsl:fork contains xsl:sequence elements or one xsl:for-each-group",
    );
  }
  const body = compileBody(element, cx, scope, branches);
  return (xc, out, machine) => machine.runBody(body, xc, out);
}
