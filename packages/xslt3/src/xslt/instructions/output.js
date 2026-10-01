/**
 * xsl:message (XSLT 3.0 section 22.1): messages collected as documents,
 * optionally terminating the transformation.
 *
 * @module @tradik/xslt3/xslt/instructions/output
 */

import { compileBody } from "../compiler/body.js";
import { evaluate } from "../runtime/context.js";
import { TreeReceiver } from "../runtime/treeReceiver.js";
import { avtEvaluator, bodySequence } from "../runtime/values.js";
import { attr, isNCName, isXsl, xsltError } from "../names.js";

/** Values of yes/no attributes: the "yes" ones first. */
const YES_NO = ["yes", "true", "1", "no", "false", "0"];

/**
 * Builds a document node holding items.
 * @param {Array} items
 * @param {object} xc
 * @returns {Node} a document fragment
 */
function buildDocument(items, xc) {
  const fragment = xc.tx.scratch().createDocumentFragment();
  const out = new TreeReceiver(fragment, new Map());
  for (const item of items) out.item(item);
  return fragment;
}

/**
 * xsl:message.
 * @param {Element} element
 * @param {object} cx
 * @param {object} scope
 * @returns {Function}
 */
export function compileMessage(element, cx, scope) {
  const selectText = attr(element, "select");
  const select =
    selectText === undefined
      ? null
      : cx.exprs.xpath(selectText, element, scope.vars);
  const body = compileBody(
    element,
    cx,
    scope,
    cx.children(element).filter((child) => !isXsl(child, "fallback")),
  );
  const terminateText = attr(element, "terminate");
  if (
    terminateText !== undefined &&
    !terminateText.includes("{") &&
    !YES_NO.includes(terminateText.trim())
  ) {
    throw xsltError("XTSE0020", `Invalid terminate value ${terminateText}`);
  }
  const terminate = terminateText
    ? avtEvaluator(cx.exprs.avt(terminateText, element, scope.vars))
    : () => "no";
  const codeText = attr(element, "error-code");
  const errorCode = codeText
    ? avtEvaluator(cx.exprs.avt(codeText, element, scope.vars))
    : () => "XTMM9000";
  return (xc, out, machine) => {
    const items = [
      ...(select ? evaluate(select, xc) : []),
      ...bodySequence(body, xc, machine),
    ];
    let message;
    try {
      message = buildDocument(items, xc);
    } catch {
      // XSLT 3.0: a message that cannot be a document does not fail
      message = items;
    }
    xc.tx.messages.push(message);
    xc.tx.onMessage?.(message);
    const value = terminate(xc).trim();
    if (!YES_NO.includes(value)) {
      throw xsltError("XTDE0030", `Invalid terminate value ${value}`);
    }
    if (YES_NO.indexOf(value) < 3) {
      const code = errorCode(xc).trim();
      const local = code.replace(/^Q\{[^}]*\}/, "").replace(/^[^:]*:/, "");
      const error = xsltError(
        isNCName(local) ? local : "XTMM9000",
        "Terminated by xsl:message",
      );
      error.value = message;
      throw error;
    }
  };
}
