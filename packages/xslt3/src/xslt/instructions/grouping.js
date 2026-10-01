/**
 * xsl:for-each-group (XSLT 3.0 section 14): group-by, group-adjacent,
 * group-starting-with and group-ending-with, then the groups processed
 * in order (or sorted), each with its current group and grouping key.
 *
 * @module @tradik/xslt3/xslt/instructions/grouping
 */

import { getCollation } from "../../functions/collations.js";
import { isNode } from "../../xdm/atomic.js";
import { atomize } from "../../xdm/nodes.js";
import { compileBody } from "../compiler/body.js";
import { required } from "../compiler/attributes.js";
import { comparisonKey } from "../runtime/atomicKeys.js";
import { derive, evaluate, withFocus } from "../runtime/context.js";
import { avtEvaluator } from "../runtime/values.js";
import { attr, xsltError } from "../names.js";
import { compilePattern, patternMatches } from "../patterns/compile.js";
import { BodyFrame, LoopFrame } from "../runtime/machine.js";
import { compileSorts, splitSorts } from "./sort.js";

const METHODS = [
  "group-by",
  "group-adjacent",
  "group-starting-with",
  "group-ending-with",
];

/**
 * Groups by keys (group-by, group-adjacent).
 * @param {Array} items
 * @param {(xc: object) => Array} keysOf - Evaluates the key expression
 * @param {object} xc
 * @param {boolean} adjacent
 * @param {object} collation
 * @returns {Array<{items: Array, key: Array}>}
 */
function groupByKeys(items, keysOf, xc, adjacent, collation) {
  const groups = [];
  const byKey = new Map();
  items.forEach((item, i) => {
    const keys = atomize(keysOf(withFocus(xc, item, i + 1, items.length)));
    if (adjacent) {
      if (keys.length !== 1) {
        throw xsltError("XTTE1100", "A grouping key must be a single value");
      }
      const key = comparisonKey(keys[0], collation);
      const last = groups.at(-1);
      if (last && last.keyString === key) last.items.push(item);
      else groups.push({ items: [item], key: [keys[0]], keyString: key });
      return;
    }
    const seen = new Set();
    for (const value of keys) {
      const key = comparisonKey(value, collation);
      if (seen.has(key)) continue;
      seen.add(key);
      let group = byKey.get(key);
      if (!group) {
        group = { items: [], key: [value] };
        byKey.set(key, group);
        groups.push(group);
      }
      group.items.push(item);
    }
  });
  return groups;
}

/**
 * Groups by patterns (group-starting-with, group-ending-with).
 * @returns {Array<{items: Array, key: undefined}>}
 */
function groupByPattern(items, pattern, xc, starting, strict) {
  const groups = [];
  let current = null;
  items.forEach((item, i) => {
    // XSLT 2.0 groups nodes only; 3.0 any items
    if (strict && !isNode(item)) {
      throw xsltError("XTTE1120", "Pattern grouping applies to nodes only");
    }
    const matches = patternMatches(
      pattern,
      item,
      withFocus(xc, item, i + 1, items.length),
    );
    if (!current || (starting && matches && current.items.length > 0)) {
      current = { items: [], key: undefined };
      groups.push(current);
    }
    current.items.push(item);
    if (!starting && matches) current = null;
  });
  return groups;
}

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
  const strict = cx.versionOf(element) < 3;
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
      ? groupByPattern(
          items,
          pattern,
          xc,
          method === "group-starting-with",
          strict,
        )
      : groupByKeys(
          items,
          (focus) => evaluate(keys, focus),
          xc,
          method === "group-adjacent",
          collationObject,
        );
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
