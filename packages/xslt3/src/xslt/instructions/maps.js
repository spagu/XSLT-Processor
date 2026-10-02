/**
 * xsl:map and xsl:map-entry (XSLT 3.0 section 21.4): maps built from
 * instructions.
 *
 * @module @tradik/xslt3/xslt/instructions/maps
 */

import { XdmMap } from "../../items/map.js";
import { isMap } from "../../xdm/atomic.js";
import { atomize } from "../../xdm/nodes.js";
import { compileBody } from "../compiler/body.js";
import { required } from "../compiler/attributes.js";
import { evaluate } from "../runtime/context.js";
import { bodySequence } from "../runtime/values.js";
import { attr, xsltError } from "../names.js";

/**
 * xsl:map.
 * @param {Element} element
 * @param {object} cx
 * @param {object} scope
 * @returns {Function}
 */
export function compileMap(element, cx, scope) {
  const body = compileBody(element, cx, scope);
  return (xc, out, machine) => {
    const pairs = [];
    for (const item of bodySequence(body, xc, machine)) {
      if (!isMap(item)) {
        throw xsltError("XTTE3375", "xsl:map content must be maps");
      }
      for (const { key, value } of item.entries.values()) {
        pairs.push([key, value]);
      }
    }
    out.item(
      XdmMap.from(pairs, () => {
        throw xsltError("XTDE3365", "Duplicate key in xsl:map");
      }),
    );
  };
}

/**
 * xsl:map-entry.
 * @param {Element} element
 * @param {object} cx
 * @param {object} scope
 * @returns {Function}
 */
export function compileMapEntry(element, cx, scope) {
  const key = cx.exprs.xpath(required(element, "key"), element, scope.vars);
  const select = attr(element, "select");
  const body = compileBody(element, cx, scope);
  if (select !== undefined && body.length > 0) {
    throw xsltError("XTSE3280", "xsl:map-entry has select and content");
  }
  const value =
    select === undefined
      ? (xc, machine) => bodySequence(body, xc, machine)
      : (
          (expr) => (xc) =>
            evaluate(expr, xc)
        )(cx.exprs.xpath(select, element, scope.vars));
  return (xc, out, machine) => {
    const keys = atomize(evaluate(key, xc));
    if (keys.length !== 1) {
      throw xsltError("XPTY0004", "A map key must be a single atomic value");
    }
    out.item(XdmMap.from([[keys[0], value(xc, machine)]]));
  };
}
