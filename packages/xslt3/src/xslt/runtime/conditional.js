/**
 * Conditional content construction at run time (XSLT 3.0 section 8.4):
 * vacuous and deemed-empty items, the sequence constructors that contain
 * xsl:on-empty or xsl:on-non-empty, and the filter of
 * xsl:where-populated.
 *
 * @module @tradik/xslt3/xslt/runtime/conditional
 */

import { isArray, isAtomic, isMap } from "../../xdm/atomic.js";
import { canonicalString } from "../../xdm/lexical.js";
import { SequenceReceiver } from "./sequenceReceiver.js";

/**
 * The members of an array, flattened.
 * @param {object} array
 * @returns {Array}
 */
const flatten = (array) =>
  array.members
    .flat()
    .flatMap((item) => (isArray(item) ? flatten(item) : [item]));

/**
 * Whether an item is vacuous: a zero-length text node, a document node
 * without children, an atomic value whose string is empty, an array of
 * vacuous items.
 * @param {*} item
 * @returns {boolean}
 */
export function isVacuous(item) {
  if (isAtomic(item)) return canonicalString(item) === "";
  if (isArray(item)) return flatten(item).every(isVacuous);
  const type = item?.nodeType;
  if (type === 3 || type === 4) return item.nodeValue === "";
  return (type === 9 || type === 11) && !item.firstChild;
}

/**
 * Whether xsl:where-populated drops an item: a document or element node
 * without children, another node whose string value is empty, an atomic
 * value whose string is empty, an empty map, an array of such items.
 * @param {*} item
 * @returns {boolean}
 */
export function isDeemedEmpty(item) {
  if (isAtomic(item)) return canonicalString(item) === "";
  if (isMap(item)) return item.size === 0;
  if (isArray(item)) return flatten(item).every(isDeemedEmpty);
  const type = item?.nodeType;
  if (type === 1 || type === 9 || type === 11) return !item.firstChild;
  if (type === undefined) return false;
  const value = type === 2 ? item.value : item.nodeValue;
  return (value ?? "") === "";
}

/**
 * Runs a step and collects the items it produces.
 * @param {Function} step
 * @param {object} xc
 * @param {import("./machine.js").Machine} machine
 * @returns {Array}
 */
export function stepItems(step, xc, machine) {
  const out = new SequenceReceiver(xc.tx.scratch);
  machine.runBody([step], xc, out);
  return out.items;
}

/**
 * Wraps a body that contains xsl:on-empty or xsl:on-non-empty (steps
 * whose `conditional` is "empty" or "non-empty"): the other steps run
 * first, collected; the xsl:on-non-empty steps run when one of them
 * gave a non-vacuous item, the xsl:on-empty step when none did.
 * @param {import("./machine.js").Body} body
 * @returns {Function} a step running the whole body
 */
export function conditionalBody(body) {
  return (xc, out, machine) => {
    const results = [];
    let context = xc;
    let populated = false;
    let onEmpty = null;
    for (const step of body) {
      if (step.binding) {
        context = step.binding(context, machine);
      } else if (step.conditional === "empty") {
        onEmpty = { step, xc: context };
      } else if (step.conditional === "non-empty") {
        results.push({ step, xc: context });
      } else {
        const items = stepItems(step, context, machine);
        populated ||= !items.every(isVacuous);
        results.push(items);
      }
    }
    const items = [];
    if (!populated && onEmpty) {
      items.push(...stepItems(onEmpty.step, onEmpty.xc, machine));
    } else {
      for (const result of results) {
        if (Array.isArray(result)) items.push(...result);
        else if (populated) {
          items.push(...stepItems(result.step, result.xc, machine));
        }
      }
    }
    for (const item of items) out.item(item);
  };
}
