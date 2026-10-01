/**
 * Parameters (XSLT 3.0 sections 9.2 and 10.1.1): the xsl:param
 * declarations of templates and functions, and the xsl:with-param
 * children of invocations.
 *
 * @module @tradik/xslt3/xslt/instructions/params
 */

import { checkAttributes, yesNo } from "../compiler/attributes.js";
import { isXsl, xsltError } from "../names.js";
import { compileValue, typeConverter, variableName } from "./variables.js";

/**
 * Compiles the xsl:with-param children of an instruction.
 * @param {Node[]} children
 * @param {object} cx
 * @param {object} scope
 * @returns {{names: Set<string>,
 *   evaluate: (xc: object, machine: object) => import("../runtime/apply.js").Args}}
 */
export function compileWithParams(children, cx, scope) {
  const compiled = [];
  for (const child of children) {
    if (!isXsl(child, "with-param")) continue;
    checkAttributes(child);
    const key = variableName(child, cx);
    if (compiled.some((param) => param.key === key)) {
      throw xsltError("XTSE0670", `Duplicate parameter ${key}`);
    }
    const { value } = compileValue(child, cx, scope, "XTTE0570");
    compiled.push({ key, value, tunnel: yesNo(child, "tunnel", false) });
  }
  return {
    names: new Set(compiled.filter((p) => !p.tunnel).map((p) => p.key)),
    evaluate(xc, machine) {
      const params = new Map();
      const tunnel = new Map();
      for (const param of compiled) {
        const target = param.tunnel ? tunnel : params;
        target.set(param.key, param.value(xc, machine));
      }
      return { params, tunnel };
    },
  };
}

/**
 * The default value of a parameter with a type and no default: the
 * empty sequence, or XTDE0610 when the type does not allow it.
 * @param {object} compiled - See variables.compileValue
 * @param {string} key
 * @returns {(xc: object, machine: object) => Array}
 */
function implicitDefault(compiled, key) {
  return (xc, machine) => {
    try {
      return compiled.value(xc, machine);
    } catch (error) {
      throw error.code === "XTTE0590"
        ? xsltError("XTDE0610", `No value for the parameter ${key}`)
        : error;
    }
  };
}

/**
 * The parameters of a template or function, compiled in order (each
 * default value sees the parameters before it).
 * @param {Element[]} elements - The xsl:param children
 * @param {object} cx
 * @param {object} scope
 * @param {boolean} [isFunction]
 * @returns {{params: object[], scope: object}}
 */
export function compileParams(elements, cx, scope, isFunction = false) {
  const params = [];
  let current = scope;
  for (const element of elements) {
    checkAttributes(element);
    const key = variableName(element, cx);
    if (params.some((param) => param.key === key)) {
      throw xsltError("XTSE0580", `Duplicate parameter ${key}`);
    }
    const compiled = compileValue(element, cx, current, "XTTE0590");
    if (isFunction && compiled.hasDefault) {
      throw xsltError("XTSE0760", "A function parameter cannot have a default");
    }
    const required = isFunction || yesNo(element, "required", false);
    if (!isFunction && required && compiled.hasDefault) {
      throw xsltError("XTSE0010", "A required parameter cannot have a default");
    }
    params.push({
      key,
      required,
      tunnel: yesNo(element, "tunnel", false),
      value:
        compiled.hasDefault || !compiled.type
          ? compiled.value
          : implicitDefault(compiled, key),
      type: compiled.type,
      convert: typeConverter(compiled.type, "XTTE0590", `parameter $${key}`),
    });
    current = { ...current, vars: { key, next: current.vars } };
  }
  return { params, scope: current };
}
