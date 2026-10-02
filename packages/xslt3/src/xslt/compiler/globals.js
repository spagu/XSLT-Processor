/**
 * Global variables and parameters (XSLT 3.0 section 9.5) and stylesheet
 * functions (section 10.3): names collected first (they are in scope
 * everywhere), the declaration of highest import precedence chosen, then
 * compiled.
 *
 * @module @tradik/xslt3/xslt/compiler/globals
 */

import { coerce } from "../../xpath/eval/coercion.js";
import { compileParams } from "../instructions/params.js";
import {
  compileValue,
  typeConverter,
  variableName,
} from "../instructions/variables.js";
import {
  attr,
  displayName,
  isXsl,
  RESERVED_NAMESPACES,
  xsltError,
} from "../names.js";
import { required, yesNo } from "./attributes.js";
import { compileBody } from "./body.js";
import { splitParams } from "./templatesDecl.js";

/**
 * Chooses, among declarations with the same key, the one of highest
 * import precedence.
 * @param {object[]} declarations
 * @param {(declaration: object) => string} keyOf
 * @param {string} code - Error code for two at the same precedence
 * @returns {Map<string, object>} the winners by key, in declaration order
 */
export function winners(declarations, keyOf, code) {
  const chosen = new Map();
  for (const declaration of declarations) {
    const key = keyOf(declaration);
    const current = chosen.get(key);
    if (current && current.precedence === declaration.precedence) {
      throw xsltError(code, `Duplicate declaration of ${key}`);
    }
    if (!current || current.precedence < declaration.precedence) {
      chosen.set(key, declaration);
    }
  }
  return chosen;
}

/**
 * Collects the global variables and parameters: their keys, in scope
 * everywhere, and the winning declarations.
 * @param {object[]} declarations - xsl:variable and xsl:param declarations
 * @param {object} cx
 * @returns {Map<string, object>}
 */
export function collectGlobals(declarations, cx) {
  return winners(
    declarations,
    (declaration) => {
      declaration.key ??= variableName(declaration.element, cx);
      return declaration.key;
    },
    "XTSE0630",
  );
}

/**
 * A scope without a variable: its binding keeps its place (references are
 * resolved to depths) but cannot be found by name.
 * @param {object} scope - `{vars}`
 * @param {string} key - Clark name hidden
 * @returns {object} the scope
 */
function hideVariable(scope, key) {
  const before = [];
  let found = scope.vars;
  while (found !== null && found.key !== key) {
    before.push(found.key);
    found = found.next;
  }
  if (found === null) return scope;
  let vars = { key: "", next: found.next };
  for (let i = before.length - 1; i >= 0; i--) {
    vars = { key: before[i], next: vars };
  }
  return { ...scope, vars };
}

/**
 * Compiles a global variable or parameter. Its own name is not in scope
 * in its declaration (XSLT 3.0 section 9.9: XPST0008).
 * @param {{element: Element, key: string}} declaration
 * @param {object} cx
 * @param {object} [global] - Default: the global scope of the package
 * @returns {object} `{key, isParam, required, value, convert}`
 */
export function compileGlobal({ element, key }, cx, global = cx.globalScope()) {
  const scope = hideVariable(global, key);
  const isParam = isXsl(element, "param");
  if (isParam && yesNo(element, "tunnel", false)) {
    throw xsltError(
      "XTSE0020",
      "A global parameter cannot be a tunnel parameter",
    );
  }
  const compiled = compileValue(
    element,
    cx,
    scope,
    isParam ? "XTTE0590" : "XTTE0570",
  );
  return {
    key,
    isParam,
    required: isParam && yesNo(element, "required", false),
    // a static variable keeps the value of the static stage
    value:
      cx.staticDeclarations?.get(key)?.element === element
        ? () =>
            typeConverter(
              compiled.type,
              isParam ? "XTTE0590" : "XTTE0570",
              `value of $${displayName(key)}`,
            )(cx.statics.get(key))
        : compiled.value,
    convert: typeConverter(
      compiled.type,
      "XTTE0590",
      `parameter $${displayName(key)}`,
    ),
  };
}

/**
 * The function definition of an xsl:function for the function library;
 * its body is compiled later by {@link compileFunction}.
 * @param {object} declaration
 * @param {object} cx
 * @returns {object} `{key, uri, local, arity, declaration}`
 */
export function functionSignature(declaration, cx) {
  const { element } = declaration;
  const name = cx.exprs.qname(required(element, "name"), element, {
    syntaxCode: "XTSE0020",
  });
  yesNo(element, "override", true);
  yesNo(element, "override-extension-function", true);
  if (!name.uri) throw xsltError("XTSE0740", "A function name needs a prefix");
  if (RESERVED_NAMESPACES.has(name.uri)) {
    throw xsltError("XTSE0080", `The namespace ${name.uri} is reserved`);
  }
  const children = cx.children(element);
  const arity = splitParams(children).params.length;
  return {
    key: `{${name.uri}}${name.local}#${arity}`,
    ...name,
    arity,
    declaration,
  };
}

/**
 * Compiles the body of a stylesheet function.
 * @param {object} signature - From {@link functionSignature}
 * @param {object} cx
 * @returns {object} `{params, body, convert}`
 */
export function compileFunction(signature, cx) {
  const { element } = signature.declaration;
  const { params: paramElements, rest } = splitParams(cx.children(element));
  const { params, scope } = compileParams(
    paramElements,
    cx,
    cx.globalScope(),
    true,
  );
  const asText = attr(element, "as");
  const type = asText ? cx.exprs.sequenceType(asText, element) : null;
  return {
    params: params.map((param) => ({
      ...param,
      convert: param.type
        ? (value) =>
            coerce(value, param.type, {
              what: `argument $${displayName(param.key)}`,
            })
        : (value) => value,
    })),
    body: compileBody(element, cx, { ...scope, inFunction: true }, rest),
    convert: typeConverter(type, "XTTE0780", "result of the function"),
    memo: isMemoized(element),
  };
}

/**
 * Whether the results of a function are cached: cache="yes", or
 * new-each-time="no" (the same arguments give the same nodes).
 * @param {Element} element - xsl:function
 * @returns {boolean}
 */
function isMemoized(element) {
  const flag = (name) => attr(element, name)?.trim();
  return (
    ["yes", "true", "1"].includes(flag("cache")) ||
    ["no", "false", "0"].includes(flag("new-each-time"))
  );
}
