/**
 * Compilation of sequence constructors (XSLT 3.0 section 5.7): each child
 * of a template body, a literal result element or an instruction becomes
 * a step of the body (see runtime/machine.js). Local variables extend the
 * scope of their following siblings.
 *
 * @module @tradik/xslt3/xslt/compiler/body
 */

import { avtEvaluator } from "../runtime/values.js";
import { isXsl, XSL_NS, xsltError } from "../names.js";
import { infoOf } from "./elementInfo.js";
import { instructionCompilers } from "../instructions/index.js";
import { compileLiteralElement } from "../instructions/literal.js";
import { compileLocalVariable } from "../instructions/variables.js";
import { checkAttributes } from "./attributes.js";

/**
 * The scope of a compilation: the variables in scope (a linked list of
 * Clark names, see xpath/eval/scope.js) and flags of the context.
 * @typedef {object} Scope
 * @property {{key: string, next: object}|null} vars
 * @property {boolean} [inFunction] - In a stylesheet function
 */

/**
 * Compiles a text child: literal text, or a text value template under
 * expand-text="yes".
 * @param {{nodeValue: string, parentNode: Element}} text
 * @param {object} cx - Stylesheet compiler
 * @param {Scope} scope
 * @returns {Function} the step
 */
function compileText(text, cx, scope) {
  const parent = text.parentNode;
  const value = text.nodeValue;
  if (infoOf(parent).expandText) {
    const evaluator = avtEvaluator(cx.exprs.avt(value, parent, scope.vars));
    return (xc, out) => out.text(evaluator(xc));
  }
  return (xc, out) => out.text(value);
}

/**
 * Steps of an element whose instruction is not available: its
 * xsl:fallback children, or a dynamic error when it has none.
 * @param {Element} element
 * @param {object} cx
 * @param {Scope} scope
 * @returns {Function|null}
 */
export function compileFallback(element, cx, scope) {
  const fallbacks = cx
    .children(element)
    .filter((child) => child.nodeType === 1 && isXsl(child, "fallback"));
  if (fallbacks.length === 0) {
    const name = element.nodeName;
    if (element.namespaceURI === XSL_NS) {
      throw xsltError("XTSE0010", `Unknown XSLT element ${name}`);
    }
    return () => {
      throw xsltError("XTDE1450", `The instruction ${name} is not available`);
    };
  }
  const bodies = fallbacks.map((fallback) => compileBody(fallback, cx, scope));
  return (xc, out, machine) => {
    for (const body of bodies) machine.runBody(body, xc, out);
  };
}

/**
 * Compiles an XSLT instruction.
 * @param {Element} element
 * @param {object} cx
 * @param {Scope} scope
 * @returns {Function|null} the step, null for none
 */
function compileInstruction(element, cx, scope) {
  const name = element.localName;
  const compiler = instructionCompilers[name];
  if (compiler) {
    checkAttributes(element, cx);
    return compiler(element, cx, scope);
  }
  if (name === "fallback") return null;
  if (infoOf(element).version > 3) return compileFallback(element, cx, scope);
  if (name === "include" || name === "import") {
    throw xsltError(
      name === "include" ? "XTSE0170" : "XTSE0190",
      `xsl:${name} is only allowed at the top level`,
    );
  }
  throw xsltError(
    "XTSE0010",
    `xsl:${name} is not allowed in a sequence constructor`,
  );
}

/**
 * Compiles the children of a stylesheet element as a sequence
 * constructor.
 * @param {Element} parent
 * @param {object} cx - Stylesheet compiler
 * @param {Scope} scope
 * @param {Node[]} [children] - The children to compile (default: all)
 * @returns {import("../runtime/machine.js").Body}
 */
export function compileBody(parent, cx, scope, children) {
  const body = [];
  let current = scope;
  for (const child of children ?? cx.children(parent)) {
    let step;
    if (child.nodeType === 3) step = compileText(child, cx, current);
    else if (child.namespaceURI === XSL_NS) {
      if (child.localName === "variable") {
        checkAttributes(child, cx);
        const compiled = compileLocalVariable(child, cx, current);
        body.push(compiled.step);
        current = compiled.scope;
        continue;
      }
      step = compileInstruction(child, cx, current);
    } else if (infoOf(child).extension.has(child.namespaceURI)) {
      step = compileFallback(child, cx, current);
    } else step = compileLiteralElement(child, cx, current);
    if (step) body.push(step);
  }
  return body;
}
