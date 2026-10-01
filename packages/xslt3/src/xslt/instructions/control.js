/**
 * Conditional and repetition instructions: xsl:if, xsl:choose,
 * xsl:for-each (XSLT 3.0 sections 8 and 7.1).
 *
 * @module @tradik/xslt3/xslt/instructions/control
 */

import { effectiveBooleanValue } from "../../xdm/nodes.js";
import { compileBody } from "../compiler/body.js";
import { checkAttributes, required } from "../compiler/attributes.js";
import { derive, evaluate } from "../runtime/context.js";
import { BodyFrame, LoopFrame } from "../runtime/machine.js";
import { isXsl, xsltError } from "../names.js";
import { compileSorts, splitSorts } from "./sort.js";

/**
 * xsl:if.
 * @param {Element} element
 * @param {object} cx
 * @param {object} scope
 * @returns {Function}
 */
export function compileIf(element, cx, scope) {
  const test = cx.exprs.xpath(required(element, "test"), element, scope.vars);
  const body = compileBody(element, cx, scope);
  return (xc, out, machine) => {
    if (effectiveBooleanValue(evaluate(test, xc)) && body.length > 0) {
      machine.push(new BodyFrame(body, xc, out));
    }
  };
}

/**
 * xsl:choose.
 * @param {Element} element
 * @param {object} cx
 * @param {object} scope
 * @returns {Function}
 */
export function compileChoose(element, cx, scope) {
  const branches = [];
  let otherwise = null;
  for (const child of cx.children(element)) {
    const misplaced =
      child.nodeType !== 1 ||
      otherwise !== null ||
      !(isXsl(child, "when") || isXsl(child, "otherwise"));
    if (misplaced) {
      throw xsltError(
        "XTSE0010",
        "xsl:choose may only contain xsl:when then xsl:otherwise",
      );
    }
    checkAttributes(child);
    if (isXsl(child, "when")) {
      branches.push({
        test: cx.exprs.xpath(required(child, "test"), child, scope.vars),
        body: compileBody(child, cx, scope),
      });
    } else otherwise = compileBody(child, cx, scope);
  }
  if (branches.length === 0) {
    throw xsltError("XTSE0010", "xsl:choose needs at least one xsl:when");
  }
  return (xc, out, machine) => {
    let body = otherwise;
    for (const branch of branches) {
      if (effectiveBooleanValue(evaluate(branch.test, xc))) {
        body = branch.body;
        break;
      }
    }
    if (body && body.length > 0) machine.push(new BodyFrame(body, xc, out));
  };
}

/**
 * Runs a body once per item, with that item as the focus.
 * @param {Array} items
 * @param {import("../runtime/machine.js").Body} body
 * @param {object} xc - Context of the instruction
 * @param {object} out
 * @param {import("../runtime/machine.js").Machine} machine
 * @param {object} [changes] - Further changes to the context
 */
export function forEachItem(items, body, xc, out, machine, changes = {}) {
  if (items.length === 0 || body.length === 0) return;
  const size = items.length;
  const base = derive(xc, { rule: null, ...changes });
  machine.push(
    new LoopFrame(size, (i) =>
      machine.push(
        new BodyFrame(
          body,
          derive(base, { item: items[i], position: i + 1, size }),
          out,
        ),
      ),
    ),
  );
}

/**
 * xsl:for-each.
 * @param {Element} element
 * @param {object} cx
 * @param {object} scope
 * @returns {Function}
 */
export function compileForEach(element, cx, scope) {
  const select = cx.exprs.xpath(
    required(element, "select"),
    element,
    scope.vars,
  );
  const { sorts, rest } = splitSorts(cx.children(element));
  const sort = compileSorts(sorts, cx, scope);
  const body = compileBody(element, cx, scope, rest);
  return (xc, out, machine) => {
    const items = sort(evaluate(select, xc), xc, machine);
    forEachItem(items, body, xc, out, machine);
  };
}
