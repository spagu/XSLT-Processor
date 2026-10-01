/**
 * Copying and new documents: xsl:copy, xsl:copy-of, xsl:document and
 * xsl:perform-sort (XSLT 3.0 sections 11.8, 11.9.1 and 13.2).
 *
 * @module @tradik/xslt3/xslt/instructions/copy
 */

import { isAtomic, isNode } from "../../xdm/atomic.js";
import { compileBody } from "../compiler/body.js";
import { required, yesNo } from "../compiler/attributes.js";
import { evaluate, withFocus } from "../runtime/context.js";
import { setOrigin } from "../runtime/accumulators.js";
import { copyLeaf, copyNamespaceNodes } from "../runtime/copy.js";
import { BodyFrame } from "../runtime/machine.js";
import { bodySequence } from "../runtime/values.js";
import { attr, isXsl, xsltError } from "../names.js";
import { applyAttributeSets, attributeSetNames } from "./attributeSets.js";
import { compileSorts, splitSorts } from "./sort.js";

/**
 * xsl:copy.
 * @param {Element} element
 * @param {object} cx
 * @param {object} scope
 * @returns {Function}
 */
export function compileCopy(element, cx, scope) {
  const selectText = attr(element, "select");
  const select =
    selectText === undefined
      ? null
      : cx.exprs.xpath(selectText, element, scope.vars);
  const copyNamespaces = yesNo(element, "copy-namespaces", true);
  const sets = attributeSetNames(
    attr(element, "use-attribute-sets"),
    element,
    cx,
  );
  const body = compileBody(element, cx, scope);
  return (xc, out, machine) => {
    let context = xc;
    if (select) {
      const items = evaluate(select, xc);
      if (items.length === 0) return;
      if (items.length > 1) {
        throw xsltError("XTTE3180", "xsl:copy select gives several items");
      }
      context = withFocus(xc, items[0], 1, 1);
    }
    const item = context.item;
    if (item === undefined) {
      throw xsltError("XTTE0945", "xsl:copy needs a context item");
    }
    let content;
    if (isAtomic(item) || !isNode(item)) {
      out.item(item);
      return;
    }
    if (item.nodeType === 1) {
      content = out.element(item.namespaceURI ?? "", item.nodeName);
      if (copyNamespaces) copyNamespaceNodes(item, content);
    } else if (item.nodeType === 9 || item.nodeType === 11) {
      content = out.document();
    } else {
      copyLeaf(item, out);
      return;
    }
    if (sets.length > 0) {
      applyAttributeSets(sets, context, content, machine, cx);
    }
    if (body.length > 0) machine.push(new BodyFrame(body, context, content));
  };
}

/**
 * xsl:copy-of.
 * @param {Element} element
 * @param {object} cx
 * @param {object} scope
 * @returns {Function}
 */
export function compileCopyOf(element, cx, scope) {
  const select = cx.exprs.xpath(
    required(element, "select"),
    element,
    scope.vars,
  );
  const copyNamespaces = yesNo(element, "copy-namespaces", true);
  const copyAccumulators = yesNo(element, "copy-accumulators", false);
  return (xc, out) => {
    for (const item of evaluate(select, xc)) {
      if (isNode(item)) {
        out.copy(item, copyNamespaces);
        // a parentless copy keeps the accumulator values of the original
        if (copyAccumulators && out.items) {
          setOrigin(xc.tx, out.items.at(-1), item);
        }
      } else out.item(item);
    }
  };
}

/**
 * xsl:document.
 * @param {Element} element
 * @param {object} cx
 * @param {object} scope
 * @returns {Function}
 */
export function compileDocument(element, cx, scope) {
  const body = compileBody(element, cx, scope);
  return (xc, out, machine) => {
    const content = out.document();
    if (body.length > 0) machine.push(new BodyFrame(body, xc, content));
  };
}

/**
 * xsl:perform-sort.
 * @param {Element} element
 * @param {object} cx
 * @param {object} scope
 * @returns {Function}
 */
export function compilePerformSort(element, cx, scope) {
  const { sorts, rest } = splitSorts(cx.children(element));
  const content = rest.filter((child) => !isXsl(child, "fallback"));
  const selectText = attr(element, "select");
  if (selectText !== undefined && content.length > 0) {
    throw xsltError("XTSE1040", "xsl:perform-sort has select and content");
  }
  const sort = compileSorts(sorts, cx, scope);
  const select =
    selectText === undefined
      ? null
      : cx.exprs.xpath(selectText, element, scope.vars);
  const body = compileBody(element, cx, scope, content);
  return (xc, out, machine) => {
    const items = select
      ? evaluate(select, xc)
      : bodySequence(body, xc, machine);
    for (const item of sort(items, xc, machine)) out.item(item);
  };
}
