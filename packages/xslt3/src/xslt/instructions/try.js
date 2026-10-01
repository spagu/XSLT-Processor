/**
 * xsl:try and xsl:catch (XSLT 3.0 section 8.3): the result of the try
 * body is built apart, and replaced by the result of the first matching
 * xsl:catch when a dynamic error occurs; the catch body sees the error in
 * the variables err:code, err:description, err:value...
 *
 * @module @tradik/xslt3/xslt/instructions/try
 */

import { AtomicValue } from "../../xdm/atomic.js";
import { QNameValue } from "../../xdm/qname.js";
import { types } from "../../xdm/types.js";
import { compileBody } from "../compiler/body.js";
import { checkAttributes } from "../compiler/attributes.js";
import { infoOf } from "../compiler/elementInfo.js";
import { derive, evaluate } from "../runtime/context.js";
import { SequenceReceiver } from "../runtime/sequenceReceiver.js";
import { attr, isXsl, tokens, xsltError } from "../names.js";

/** Namespace of the error codes and of the err:* variables. */
const ERR = "http://www.w3.org/2005/xqt-errors";

/** The variables of a catch body, outermost first. */
const ERROR_VARIABLES = [
  "code",
  "description",
  "value",
  "module",
  "line-number",
  "column-number",
  "additional",
];

/**
 * The expanded name of an error code (`LOCAL` in the err namespace, or
 * `Q{uri}local`).
 * @param {string} code
 * @returns {{uri: string, local: string}}
 */
function codeName(code) {
  const eq = /^Q\{([^}]*)\}(.*)$/.exec(code);
  return eq ? { uri: eq[1], local: eq[2] } : { uri: ERR, local: code };
}

/**
 * Compiles the name tests of an errors attribute.
 * @param {Element} element - xsl:catch
 * @returns {(name: {uri: string, local: string}) => boolean}
 */
function errorTests(element) {
  const namespaces = infoOf(element).namespaces;
  const tests = tokens(attr(element, "errors") ?? "*").map((token) => {
    if (token === "*") return () => true;
    if (token.startsWith("*:")) return (n) => n.local === token.slice(2);
    const eq = /^Q\{([^}]*)\}(.*)$/.exec(token);
    const [uri, local] = eq
      ? [eq[1], eq[2]]
      : token.includes(":")
        ? [namespaces.get(token.split(":")[0]) ?? "", token.split(":")[1]]
        : ["", token];
    return (n) => n.uri === uri && (local === "*" || n.local === local);
  });
  return (name) => tests.some((test) => test(name));
}

/**
 * The values of the err:* variables for an error.
 * @param {Error} error
 * @returns {Array[]} in the order of ERROR_VARIABLES
 */
function errorValues(error) {
  const { uri, local } = codeName(error.code);
  const description = error.message.replace(/^[^ ]+: /, "");
  return [
    [new AtomicValue(types.QName, new QNameValue(uri, local, "err"))],
    [new AtomicValue(types.string, description)],
    error.errorObject ?? error.value ?? [],
    [],
    [],
    [],
    [],
  ].map((value) => (Array.isArray(value) ? value : [value]));
}

/**
 * Compiles the body or select of xsl:try / xsl:catch.
 * @returns {(xc: object, machine: object) => Array}
 */
function compileContent(element, children, cx, scope, conflictCode) {
  const select = attr(element, "select");
  if (select !== undefined && children.length > 0) {
    throw xsltError(
      conflictCode,
      `xsl:${element.localName} has select and content`,
    );
  }
  if (select !== undefined) {
    const expr = cx.exprs.xpath(select, element, scope.vars);
    return (xc) => evaluate(expr, xc);
  }
  const body = compileBody(element, cx, scope, children);
  return (xc, machine) => {
    const out = new SequenceReceiver(xc.tx.scratch);
    machine.runBody(body, xc, out);
    return out.items;
  };
}

/**
 * xsl:try.
 * @param {Element} element
 * @param {object} cx
 * @param {object} scope
 * @returns {Function}
 */
export function compileTry(element, cx, scope) {
  const children = cx.children(element).filter((c) => !isXsl(c, "fallback"));
  const first = children.findIndex((child) => isXsl(child, "catch"));
  if (first < 0) throw xsltError("XTSE0010", "xsl:try needs an xsl:catch");
  const catchElements = children.slice(first);
  if (!catchElements.every((child) => isXsl(child, "catch"))) {
    throw xsltError("XTSE0010", "xsl:catch must come last in xsl:try");
  }
  const content = compileContent(
    element,
    children.slice(0, first),
    cx,
    scope,
    "XTSE3140",
  );
  let catchScope = scope;
  for (const name of ERROR_VARIABLES) {
    catchScope = {
      ...catchScope,
      vars: { key: `{${ERR}}${name}`, next: catchScope.vars },
    };
  }
  const catches = catchElements.map((catchElement) => {
    checkAttributes(catchElement);
    return {
      matches: errorTests(catchElement),
      content: compileContent(
        catchElement,
        cx.children(catchElement),
        cx,
        catchScope,
        "XTSE3150",
      ),
    };
  });
  return (xc, out, machine) => {
    let items;
    try {
      items = content(xc, machine);
    } catch (error) {
      if (typeof error?.code !== "string") throw error;
      const handler = catches.find((c) => c.matches(codeName(error.code)));
      if (!handler) throw error;
      let env = xc.env;
      for (const value of errorValues(error)) env = { value, next: env };
      items = handler.content(derive(xc, { env }), machine);
    }
    for (const item of items) out.item(item);
  };
}
