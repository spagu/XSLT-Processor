/**
 * xsl:for-each-group (XSLT 3.0 section 14): group-by, group-adjacent,
 * group-starting-with and group-ending-with, then the groups processed
 * in order (or sorted), each with its current group and grouping key.
 *
 * @module @tradik/xslt3/xslt/instructions/grouping
 */

import { getCollation } from "../../functions/collations.js";
import { compileBody } from "../compiler/body.js";
import { required, yesNo } from "../compiler/attributes.js";
import { derive, evaluate } from "../runtime/context.js";
import { groupByKeys, groupByPattern } from "../runtime/groups.js";
import { avtEvaluator } from "../runtime/values.js";
import { attr, xsltError } from "../names.js";
import { compilePattern } from "../patterns/compile.js";
import { BodyFrame, LoopFrame } from "../runtime/machine.js";
import { compileSorts, splitSorts } from "./sort.js";

const METHODS = [
  "group-by",
  "group-adjacent",
  "group-starting-with",
  "group-ending-with",
];

/**
 * xsl:for-each-group.
 * @param {Element} element
 * @param {object} cx
 * @param {object} scope
 * @returns {Function}
 */
export function compileForEachGroup(element, cx, scope) {
  const select = cx.exprs.xpath(
    required(element, "select"),
    element,
    scope.vars,
  );
  const present = METHODS.filter((name) => attr(element, name) !== undefined);
  if (present.length !== 1) {
    throw xsltError("XTSE1080", "xsl:for-each-group needs one grouping method");
  }
  const method = present[0];
  const text = attr(element, method);
  const byPattern = method.endsWith("with");
  const keys = byPattern ? null : cx.exprs.xpath(text, element, scope.vars);
  const pattern = byPattern
    ? compilePattern(text, element, cx, scope.vars)
    : null;
  const collationText = attr(element, "collation");
  if (collationText !== undefined && byPattern) {
    throw xsltError("XTSE1090", "collation needs group-by or group-adjacent");
  }
  const collation =
    collationText === undefined
      ? null
      : avtEvaluator(cx.exprs.avt(collationText, element, scope.vars));
  const { sorts, rest } = splitSorts(cx.children(element));
  const sort = compileSorts(sorts, cx, scope);
  const body = compileBody(element, cx, scope, rest);
  const composite = yesNo(element, "composite", false);
  return (xc, out, machine) => {
    const items = evaluate(select, xc);
    let collationObject = getCollation(undefined, xc.tx.dyn);
    if (collation) {
      const uri = collation(xc);
      try {
        collationObject = getCollation(uri, xc.tx.dyn);
      } catch {
        throw xsltError("XTDE1110", `Unknown collation ${uri}`);
      }
    }
    const groups = byPattern
      ? groupByPattern(items, pattern, xc, method === "group-starting-with")
      : groupByKeys(items, (focus) => evaluate(keys, focus), xc, {
          adjacent: method === "group-adjacent",
          collation: collationObject,
          composite,
        });
    const order = sort.order(
      groups.map((group) => group.items[0]),
      xc,
      machine,
      (focus, i) =>
        derive(focus, { group: groups[i].items, groupKey: groups[i].key }),
    );
    const ordered = order.map((i) => groups[i]);
    const size = ordered.length;
    if (size === 0 || body.length === 0) return;
    const base = derive(xc, { rule: null });
    machine.push(
      new LoopFrame(size, (i) => {
        const group = ordered[i];
        const context = derive(base, {
          item: group.items[0],
          position: i + 1,
          size,
          group: group.items,
          groupKey: group.key,
        });
        machine.push(new BodyFrame(body, context, out));
      }),
    );
  };
}
