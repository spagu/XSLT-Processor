/**
 * Values of variables and parameters (XSLT 3.0 section 9.3): the select
 * expression, or the content as a temporary tree (as a sequence when
 * there is an `as` attribute), converted to the declared type.
 *
 * @module @tradik/xslt3/xslt/instructions/variables
 */

import { stringItem } from "../../xpath/eval/atomics.js";
import { coerce } from "../../xpath/eval/coercion.js";
import { compileBody } from "../compiler/body.js";
import { required } from "../compiler/attributes.js";
import { infoOf } from "../compiler/elementInfo.js";
import { derive, evaluate } from "../runtime/context.js";
import { LazyEntry } from "../runtime/lazy.js";
import { bodySequence, temporaryTree } from "../runtime/values.js";
import { attr, clarkOf, declaredName, isXsl, xsltError } from "../names.js";

/**
 * A converter to a declared sequence type, raising a given error code
 * when the value does not match.
 * @param {object|null} type - Compiled sequence type, null for none
 * @param {string} code - Error code for a type mismatch
 * @param {string} what - Description for messages
 * @param {boolean} [compatible] - XPath 1.0 compatibility
 * @returns {(value: Array) => Array}
 */
export function typeConverter(type, code, what, compatible = false) {
  if (!type) return (value) => value;
  return (value) => {
    try {
      return coerce(value, type, { what, compatible });
    } catch (error) {
      if (error.code === "XPTY0004" || error.code === "FORG0001") {
        throw xsltError(code, error.message.replace(/^[A-Z]{4}\d{4}: /, ""));
      }
      throw error;
    }
  };
}

/**
 * Compiles the value of a variable, parameter or with-param.
 * @param {Element} element
 * @param {object} cx
 * @param {object} scope - Scope of the select expression and content
 * @param {string} code - Error code of a type mismatch
 * @returns {{value: (xc: object, machine: object) => Array, type: object|null,
 *   hasDefault: boolean}}
 */
export function compileValue(element, cx, scope, code) {
  const select = attr(element, "select");
  const asText = attr(element, "as");
  const type =
    asText === undefined ? null : cx.exprs.sequenceType(asText, element);
  const children = cx
    .children(element)
    .filter((child) => !isXsl(child, "fallback"));
  if (select !== undefined && children.length > 0) {
    throw xsltError(
      "XTSE0620",
      `xsl:${element.localName} cannot have both select and content`,
    );
  }
  const name = attr(element, "name") ?? "";
  const convert = typeConverter(
    type,
    code,
    `value of $${name}`,
    infoOf(element).version < 2,
  );
  const hasDefault = select !== undefined || children.length > 0;
  if (select !== undefined) {
    const expr = cx.exprs.xpath(select, element, scope.vars);
    return { value: (xc) => convert(evaluate(expr, xc)), type, hasDefault };
  }
  if (children.length > 0) {
    const body = compileBody(element, cx, scope, children);
    const value = type
      ? (xc, machine) => convert(bodySequence(body, xc, machine))
      : (xc, machine) => [temporaryTree(body, xc, machine)];
    return { value, type, hasDefault };
  }
  const empty = type ? [] : [stringItem("")];
  return { value: () => convert(empty), type, hasDefault };
}

/**
 * The Clark name of a variable or parameter.
 * @param {Element} element
 * @param {object} cx
 * @returns {string}
 */
export const variableName = (element, cx) =>
  clarkOf(declaredName(cx.exprs.qname(required(element, "name"), element)));

/**
 * Compiles a local xsl:variable.
 * @param {Element} element
 * @param {object} cx
 * @param {object} scope
 * @returns {{step: {binding: Function}, scope: object}} the binding step and
 *   the scope of the following siblings
 */
export function compileLocalVariable(element, cx, scope) {
  const key = variableName(element, cx);
  const { value } = compileValue(element, cx, scope, "XTTE0570");
  return {
    step: {
      binding: (xc, machine) =>
        derive(xc, {
          env: new LazyEntry(xc.env, () => value(xc, machine), key),
        }),
    },
    scope: { ...scope, vars: { key, next: scope.vars } },
  };
}
