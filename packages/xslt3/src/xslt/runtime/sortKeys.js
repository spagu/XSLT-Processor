/**
 * Sort keys at run time (XSLT 3.0 sections 13.1.2 and 13.1.3): the
 * settings of a key from its attribute value templates, the key value of
 * an item, and the comparison of key values (empty first, then NaN).
 *
 * @module @tradik/xslt3/xslt/runtime/sortKeys
 */

import { getCollation } from "../../functions/collations.js";
import { stringItem } from "../../xpath/eval/atomics.js";
import { compareAtomic } from "../../xdm/compare.js";
import { toNumber } from "../../xdm/generalCompare.js";
import { atomize, stringValue } from "../../xdm/nodes.js";
import { types } from "../../xdm/types.js";
import { cast } from "../../xdm/cast.js";
import { xsltError } from "../names.js";
import { evaluate } from "./context.js";
import { bodySequence } from "./values.js";

/**
 * The comparison function of a lang or case-order setting.
 * @param {string|undefined} lang
 * @param {string|undefined} caseOrder
 * @returns {(a: string, b: string) => number}
 */
function languageCollation(lang, caseOrder) {
  let collator;
  try {
    collator = new Intl.Collator(lang || "en", {
      caseFirst: caseOrder === "lower-first" ? "lower" : "upper",
    });
  } catch {
    throw xsltError("XTDE0030", `Invalid lang ${lang}`);
  }
  return (a, b) => collator.compare(a, b);
}

/**
 * The comparison settings of a key, from its attribute value templates.
 * @param {object} key - Compiled xsl:sort
 * @param {object} xc
 * @returns {{descending: boolean, dataType: string, compare: Function}}
 */
export function settingsOf(key, xc) {
  const order = key.order?.(xc).trim() ?? "ascending";
  if (order !== "ascending" && order !== "descending") {
    throw xsltError("XTDE0030", `Invalid sort order ${order}`);
  }
  const dataType = key.dataType?.(xc).trim() ?? "";
  if (!["", "text", "number"].includes(dataType) && !dataType.includes(":")) {
    throw xsltError("XTDE0030", `Invalid data-type ${dataType}`);
  }
  const caseOrder = key.caseOrder?.(xc).trim();
  if (caseOrder && caseOrder !== "upper-first" && caseOrder !== "lower-first") {
    throw xsltError("XTDE0030", `Invalid case-order ${caseOrder}`);
  }
  const lang = key.lang?.(xc).trim();
  let compare;
  if (key.collation) {
    const uri = key.collation(xc).trim();
    try {
      compare = getCollation(uri, xc.tx.dyn).compare;
    } catch {
      throw xsltError("XTDE1035", `Unknown collation ${uri}`);
    }
  } else if (lang || caseOrder) compare = languageCollation(lang, caseOrder);
  return { descending: order === "descending", dataType, compare };
}

/**
 * The sort key value of one item.
 * @param {object} key - Compiled xsl:sort
 * @param {object} settings
 * @param {object} xc - Context with the item as focus
 * @param {object} machine
 * @returns {*} an atomic value, or null for the empty sequence
 */
export function keyValue(key, settings, xc, machine) {
  let values = key.expr
    ? evaluate(key.expr, xc)
    : bodySequence(key.body, xc, machine);
  if (key.compatible) values = values.slice(0, 1);
  if (settings.dataType === "text") {
    return values.length ? stringItem(values.map(stringValue).join(" ")) : null;
  }
  const atoms = atomize(values);
  if (atoms.length > 1) {
    throw xsltError("XTTE1020", "A sort key must be a single value");
  }
  if (atoms.length === 0) return null;
  if (settings.dataType === "number") return toNumber(atoms[0]);
  const [value] = atoms;
  return value.type === types.untypedAtomic ? cast(value, types.string) : value;
}

const isNaNValue = (v) => typeof v.value === "number" && Number.isNaN(v.value);

/**
 * Compares two key values: the empty sequence first, then NaN.
 * @param {*} a
 * @param {*} b
 * @param {object} settings
 * @param {object} xc
 * @returns {number}
 */
export function compareValues(a, b, settings, xc) {
  if (a === null || b === null) {
    return (a === null ? 0 : 1) - (b === null ? 0 : 1);
  }
  if (isNaNValue(a) || isNaNValue(b)) {
    return Number(!isNaNValue(a)) - Number(!isNaNValue(b));
  }
  const options = { ...xc.tx.dyn.compareOptions, collation: settings.compare };
  try {
    return compareAtomic(a, b, options).order || 0;
  } catch {
    throw xsltError("XTDE1030", "Sort key values are not comparable");
  }
}
