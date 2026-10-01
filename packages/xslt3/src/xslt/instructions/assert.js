/**
 * xsl:assert (XSLT 3.0 section 23.2): when its test is false, or fails,
 * the transformation fails as with xsl:message terminate="yes", with the
 * error code of the error-code attribute (default XTMM9001). Assertions
 * are checked unless the transform() option `assertions` is false.
 *
 * @module @tradik/xslt3/xslt/instructions/assert
 */

import { effectiveBooleanValue } from "../../xdm/nodes.js";
import { required } from "../compiler/attributes.js";
import { compileBody } from "../compiler/body.js";
import { infoOf } from "../compiler/elementInfo.js";
import { evaluate } from "../runtime/context.js";
import { avtEvaluator, bodySequence } from "../runtime/values.js";
import { attr, isXsl, resolveQName, xsltError } from "../names.js";

/** Namespace of the standard error codes. */
const ERR = "http://www.w3.org/2005/xqt-errors";

/**
 * Whether the test of an assertion holds; an error counts as false.
 * @param {object} test
 * @param {object} xc
 * @returns {boolean}
 */
function holds(test, xc) {
  try {
    return effectiveBooleanValue(evaluate(test, xc));
  } catch (error) {
    if (typeof error?.code !== "string") throw error;
    return false;
  }
}

/**
 * xsl:assert.
 * @param {Element} element
 * @param {object} cx
 * @param {object} scope
 * @returns {Function}
 */
export function compileAssert(element, cx, scope) {
  const test = cx.exprs.xpath(required(element, "test"), element, scope.vars);
  const selectText = attr(element, "select");
  const select =
    selectText === undefined
      ? null
      : cx.exprs.xpath(selectText, element, scope.vars);
  const children = cx.children(element).filter((c) => !isXsl(c, "fallback"));
  if (select && children.length > 0) {
    throw xsltError("XTSE3185", "xsl:assert cannot have select and content");
  }
  const body = compileBody(element, cx, scope, children);
  const codeText = attr(element, "error-code");
  const errorCode = codeText
    ? avtEvaluator(cx.exprs.avt(codeText, element, scope.vars))
    : () => `Q{${ERR}}XTMM9001`;
  const namespaces = infoOf(element).namespaces;
  return (xc, out, machine) => {
    if (!xc.tx.assertions || holds(test, xc)) return;
    const value = select
      ? evaluate(select, xc)
      : bodySequence(body, xc, machine);
    xc.tx.messages.push(value);
    const name = resolveQName(errorCode(xc), namespaces, { code: "XTDE0030" });
    const code = name.uri === ERR ? name.local : `Q{${name.uri}}${name.local}`;
    const error = xsltError(code, "Assertion failed");
    error.value = value;
    throw error;
  };
}
