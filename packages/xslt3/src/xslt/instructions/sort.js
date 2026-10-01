/**
 * Sorting (XSLT 3.0 section 13): xsl:sort keys of xsl:for-each,
 * xsl:apply-templates, xsl:for-each-group and xsl:perform-sort.
 *
 * @module @tradik/xslt3/xslt/instructions/sort
 */

import { compileBody } from "../compiler/body.js";
import { checkAttributes } from "../compiler/attributes.js";
import { splitLeading } from "../compiler/children.js";
import { infoOf } from "../compiler/elementInfo.js";
import { withFocus } from "../runtime/context.js";
import { compareValues, keyValue, settingsOf } from "../runtime/sortKeys.js";
import { avtEvaluator } from "../runtime/values.js";
import { attr, isXsl, xsltError } from "../names.js";

/**
 * Separates the leading xsl:sort children from the rest.
 * @param {Node[]} children
 * @returns {{sorts: Element[], rest: Node[]}}
 */
export function splitSorts(children) {
  const { leading, rest } = splitLeading(children, "sort");
  if (rest.some((child) => isXsl(child, "sort"))) {
    throw xsltError("XTSE0010", "xsl:sort must come first");
  }
  return { sorts: leading, rest };
}

/**
 * @param {Element} element
 * @param {string} name
 * @param {object} cx
 * @param {object} scope
 * @returns {((xc: object) => string)|null}
 */
function optionalAvt(element, name, cx, scope) {
  const text = attr(element, name);
  return text === undefined
    ? null
    : avtEvaluator(cx.exprs.avt(text, element, scope.vars));
}

/**
 * Compiles one xsl:sort.
 * @param {Element} element
 * @param {object} cx
 * @param {object} scope
 * @returns {object} the compiled key
 */
export function compileSortKey(element, cx, scope) {
  checkAttributes(element);
  const select = attr(element, "select");
  const children = cx.children(element);
  if (select !== undefined && children.length > 0) {
    throw xsltError("XTSE1015", "xsl:sort cannot have select and content");
  }
  const expr =
    children.length > 0
      ? null
      : cx.exprs.xpath(select ?? ".", element, scope.vars);
  return {
    expr,
    body: children.length > 0 ? compileBody(element, cx, scope) : null,
    order: optionalAvt(element, "order", cx, scope),
    dataType: optionalAvt(element, "data-type", cx, scope),
    caseOrder: optionalAvt(element, "case-order", cx, scope),
    lang: optionalAvt(element, "lang", cx, scope),
    collation: optionalAvt(element, "collation", cx, scope),
    compatible: infoOf(element).version < 2,
  };
}

/**
 * Compiles the xsl:sort elements of an instruction.
 * @param {Element[]} elements
 * @param {object} cx
 * @param {object} scope
 * @returns {((items: Array, xc: object, machine: object) => Array) &
 *   {order: Function}} sorts a sequence (the identity without sort keys);
 *   `order(items, xc, machine, prepare)` gives the sorted indices, where
 *   `prepare(focusContext, index)` adjusts the context of each key
 */
export function compileSorts(elements, cx, scope) {
  const keys = elements.map((element) => compileSortKey(element, cx, scope));
  const order = (items, xc, machine, prepare) => {
    const indices = items.map((_, i) => i);
    if (keys.length === 0) return indices;
    const settings = keys.map((key) => settingsOf(key, xc));
    const size = items.length;
    const rows = items.map((item, i) => {
      let focus = withFocus(xc, item, i + 1, size);
      if (prepare) focus = prepare(focus, i);
      return keys.map((key, k) => keyValue(key, settings[k], focus, machine));
    });
    indices.sort((x, y) => {
      for (let k = 0; k < keys.length; k++) {
        const result = compareValues(rows[x][k], rows[y][k], settings[k], xc);
        if (result !== 0) return settings[k].descending ? -result : result;
      }
      return 0;
    });
    return indices;
  };
  const sort = (items, xc, machine) =>
    keys.length === 0 ? items : order(items, xc, machine).map((i) => items[i]);
  sort.order = order;
  return sort;
}
