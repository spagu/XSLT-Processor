/**
 * Statically Known document() URIs
 *
 * Finds the `document('literal')` calls of a stylesheet module, so that the
 * asynchronous API can load those documents before the synchronous
 * transformation runs. Expressions are parsed with the XPath parser and the
 * syntax tree is searched for `document()` calls whose first argument is a
 * string literal; URIs computed at run time (`document(@href)`) and calls
 * with an explicit base (second argument) are left to the synchronous
 * document loader.
 *
 * Expressions are read from the expression attributes of XSLT instructions
 * (`select`, `test`, `use`, `value`) and from the `{...}` parts of every other
 * attribute (attribute value templates).
 *
 * @module async/documentUris
 */

import { NodeType, parse } from "../xpath/parser.js";
import { parseAvt } from "../xslt/avt.js";
import { XSLT_NAMESPACE } from "../xslt/elements.js";
import { resolveUri, stripFragment } from "../xslt/uri.js";

/** Attributes of XSLT instructions holding a whole expression. */
const EXPRESSION_ATTRIBUTES = new Set(["select", "test", "use", "value"]);

/**
 * The literal arguments of the `document()` calls of an expression.
 *
 * @param {string} expression - XPath expression
 * @returns {string[]} The literal URIs, empty when the expression is invalid
 *   (the engine reports that when compiling)
 *
 * @example
 * literalDocumentArguments("document('a.xml')/x | document(@b)"); // ["a.xml"]
 */
export function literalDocumentArguments(expression) {
  let tree;
  try {
    tree = parse(expression);
  } catch {
    return [];
  }
  const found = [];
  const stack = [tree];
  while (stack.length > 0) {
    const node = stack.pop();
    const [first] = node.args ?? [];
    const isStatic =
      node.type === NodeType.FUNCTION_CALL &&
      node.name === "document" &&
      !node.prefix &&
      node.args.length === 1 &&
      first.type === NodeType.LITERAL;
    if (isStatic) found.push(first.value);
    for (const value of Object.values(node)) {
      for (const child of Array.isArray(value) ? value : [value]) {
        if (typeof child?.type === "string") stack.push(child);
      }
    }
  }
  return found;
}

/**
 * The expressions held by an attribute.
 *
 * @param {Attr} attribute - An attribute of a stylesheet element
 * @returns {string[]} The expressions
 */
function attributeExpressions(attribute) {
  const element = attribute.ownerElement;
  const isExpression =
    element.namespaceURI === XSLT_NAMESPACE &&
    !attribute.namespaceURI &&
    EXPRESSION_ATTRIBUTES.has(attribute.localName);
  if (isExpression) return [attribute.value];
  try {
    return parseAvt(attribute.value)
      .filter((part) => typeof part !== "string")
      .map((part) => part.expr);
  } catch {
    return [];
  }
}

/**
 * The resolved URIs of the literal `document()` calls of a stylesheet module.
 * They are resolved against the main stylesheet URI, as the engine resolves
 * `document()` calls without a base argument; fragment identifiers are
 * dropped and `document('')` (the stylesheet itself) is skipped.
 *
 * @param {Node} module - Stylesheet document or element
 * @param {string|undefined} stylesheetUri - URI of the main stylesheet
 * @returns {string[]} Resolved URIs, possibly repeated
 *
 * @example
 * staticDocumentUris(xslDoc, "/xsl/main.xsl"); // ["/xsl/data.xml"]
 */
export function staticDocumentUris(module, stylesheetUri) {
  const root = module.documentElement ?? module;
  const uris = [];
  for (const element of [root, ...root.getElementsByTagName("*")]) {
    if (!hasDocumentCall(element)) continue;
    for (const attribute of element.attributes) {
      for (const expression of attributeExpressions(attribute)) {
        for (const literal of literalDocumentArguments(expression)) {
          const target = stripFragment(literal);
          if (target) uris.push(resolveUri(target, stylesheetUri));
        }
      }
    }
  }
  return uris;
}

/**
 * Cheap pre-filter: whether any attribute of an element mentions `document`.
 *
 * @param {Element} element - Stylesheet element
 * @returns {boolean} True when an attribute may hold a document() call
 */
function hasDocumentCall(element) {
  for (const attribute of element.attributes) {
    if (attribute.value.includes("document")) return true;
  }
  return false;
}
