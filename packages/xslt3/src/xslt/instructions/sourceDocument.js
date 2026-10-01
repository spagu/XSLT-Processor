/**
 * xsl:source-document (XSLT 3.0 section 18.1): reads a document as
 * doc() does and runs its content with the document node as the
 * context item. This processor does not stream: streamable="yes" reads
 * the whole document. The accumulators named by use-accumulators (none
 * by default) apply to it.
 *
 * @module @tradik/xslt3/xslt/instructions/sourceDocument
 */

import { resolveUri } from "../../xpath/eval/uris.js";
import { useAccumulators } from "../compiler/useAccumulators.js";
import { required, yesNo } from "../compiler/attributes.js";
import { compileBody } from "../compiler/body.js";
import { setApplicable } from "../runtime/accumulators.js";
import { derive, dynamicContextOf } from "../runtime/context.js";
import { BodyFrame } from "../runtime/machine.js";
import { avtEvaluator } from "../runtime/values.js";
import { attr, xsltError } from "../names.js";

/**
 * Checks the validation and type attributes of an instruction of a
 * processor that is not schema aware.
 * @param {Element} element
 * @throws {import("../../errors.js").XPathError} XTSE1660 for strict or
 *   lax validation or a type, XTSE0020 for an invalid validation
 */
export function checkNoValidation(element) {
  const validation = attr(element, "validation")?.trim();
  if (
    validation !== undefined &&
    !["strict", "lax", "preserve", "strip"].includes(validation)
  ) {
    throw xsltError("XTSE0020", `Invalid validation "${validation}"`);
  }
  if (
    validation === "strict" ||
    validation === "lax" ||
    attr(element, "type") !== undefined
  ) {
    throw xsltError("XTSE1660", "Schema validation needs schema awareness");
  }
}

/**
 * xsl:source-document.
 * @param {Element} element
 * @param {object} cx
 * @param {object} scope
 * @returns {Function}
 */
export function compileSourceDocument(element, cx, scope) {
  yesNo(element, "streamable", false);
  checkNoValidation(element);
  const href = avtEvaluator(
    cx.exprs.avt(required(element, "href"), element, scope.vars),
  );
  const accumulators = useAccumulators(
    attr(element, "use-accumulators") ?? "",
    element,
    cx,
  );
  const base = cx.baseUriOf(element);
  const body = compileBody(element, cx, scope);
  return (xc, out, machine) => {
    const uri = resolveUri(href(xc), base);
    const document = dynamicContextOf(xc).loadDocument(uri);
    setApplicable(xc.tx, document, accumulators);
    if (body.length === 0) return;
    const context = derive(xc, { item: document, position: 1, size: 1 });
    machine.push(new BodyFrame(body, context, out));
  };
}
