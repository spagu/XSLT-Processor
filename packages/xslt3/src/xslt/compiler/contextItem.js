/**
 * xsl:context-item (XSLT 3.0 section 10.1.1): the context item a
 * template requires (use="required", XTTE3090 when absent), accepts
 * (optional) or ignores (absent: the template runs with an absent
 * focus), and its type (XTTE0590 when it does not match; no conversion).
 *
 * @module @tradik/xslt3/xslt/compiler/contextItem
 */

import { matchesSequenceType } from "../../xpath/eval/sequenceType.js";
import { derive } from "../runtime/context.js";
import { attr, isXsl, xsltError } from "../names.js";
import { checkAttributes } from "./attributes.js";
import { isWhitespaceText } from "./children.js";

/** Values of the use attribute. */
const USES = new Set(["required", "optional", "absent"]);

/**
 * Compiles the type of an `as` attribute that must be an item type.
 * @param {Element} element
 * @param {object} cx
 * @returns {object|null} a sequence type of exactly one item
 */
function itemType(element, cx) {
  const text = attr(element, "as");
  if (text === undefined) return null;
  const type = cx.exprs.sequenceType(text, element);
  if (type.occurrence !== "" || type.itemType === null) {
    throw xsltError("XTSE0020", `"${text}" is not an item type`);
  }
  return type;
}

/**
 * The step that checks the context item of a template.
 * @param {Element} element - xsl:context-item
 * @param {boolean} named - The template has a name
 * @param {object} cx
 * @returns {{binding: Function}}
 */
function compileCheck(element, named, cx) {
  checkAttributes(element);
  const use = (attr(element, "use") ?? "optional").trim();
  if (!USES.has(use)) throw xsltError("XTSE0020", `Invalid use "${use}"`);
  if (use === "absent" && attr(element, "as") !== undefined) {
    throw xsltError("XTSE3088", 'use="absent" cannot have a type');
  }
  if (!named && use !== "required") {
    throw xsltError("XTSE0020", "A template rule requires its context item");
  }
  const type = itemType(element, cx);
  return {
    binding(xc) {
      if (use === "absent") {
        return derive(xc, { item: undefined, position: 0, size: 0 });
      }
      if (xc.item === undefined) {
        if (use === "required") {
          throw xsltError("XTTE3090", "The template requires a context item");
        }
      } else if (type && !matchesSequenceType([xc.item], type)) {
        throw xsltError("XTTE0590", "The context item has the wrong type");
      }
      return xc;
    },
  };
}

/**
 * Separates the xsl:context-item of a template from its other children.
 * @param {Array<object>} children - Significant children of the template
 * @param {Element} template
 * @param {object} cx
 * @returns {{rest: Array<object>, steps: Array}} the other children, and
 *   the step that checks the context item (to run first)
 */
export function splitContextItem(children, template, cx) {
  const index = children.findIndex((child) => !isWhitespaceText(child));
  const first = children[index];
  const declared = first !== undefined && isXsl(first, "context-item");
  const rest = declared ? children.slice(index + 1) : children;
  if (rest.some((child) => isXsl(child, "context-item"))) {
    throw xsltError("XTSE0010", "xsl:context-item must be the first child");
  }
  if (!declared) return { rest, steps: [] };
  const named = attr(template, "name") !== undefined;
  return { rest, steps: [compileCheck(first, named, cx)] };
}
