/**
 * Static checks run while a stylesheet is compiled.
 *
 * - Patterns (XSLT 1.0 section 5.2) of `xsl:template match`, `xsl:key match`
 *   and `xsl:number count`/`from` are compiled at import time, so an invalid
 *   pattern makes `importStylesheet` fail with an error naming it, as libxslt
 *   (and so the browsers' XSLTProcessor) rejects such a stylesheet.
 * - Two local variables or parameters of the same name where one is in the
 *   scope of the other (section 11.5), and two global ones with the same
 *   import precedence (section 11.4), are errors libxslt reports; they are
 *   only warned about here, and the binding used so far keeps being used.
 *
 * @module xslt/stylesheetChecks
 */

"use strict";

import { XSLT_NAMESPACE } from "./elements.js";

/**
 * The local name of an XSLT element, or null for any other node.
 *
 * @param {Node} node - A stylesheet node
 * @returns {string|null} e.g. "number" for xsl:number
 */
export function xsltLocalName(node) {
  if (node.nodeType !== 1) return null;
  if (node.namespaceURI === XSLT_NAMESPACE) return node.localName;
  return node.nodeName.startsWith("xsl:") ? node.nodeName.slice(4) : null;
}

/**
 * Visit every element below a node, in document order.
 *
 * @param {Node} root - The subtree root (not visited itself)
 * @param {(element: Element) => void} visit - Called for each element
 * @returns {void}
 */
function forEachDescendant(root, visit) {
  for (let child = root.firstChild; child; child = child.nextSibling) {
    if (child.nodeType !== 1) continue;
    visit(child);
    forEachDescendant(child, visit);
  }
}

/**
 * Compile a pattern of the stylesheet, reporting where it comes from when
 * it is invalid.
 *
 * @param {{compile: (pattern: string) => object[]}} matcher - The pattern matcher
 * @param {string} pattern - The pattern
 * @param {string} where - The attribute holding it, e.g. "xsl:template match"
 * @returns {void}
 * @throws {Error} When the pattern is invalid
 *
 * @example
 * checkPattern(matcher, "a/..", "xsl:template match");
 * // Error: xsl:template match: Invalid pattern "a/..": Axis not allowed ...
 */
export function checkPattern(matcher, pattern, where) {
  try {
    matcher.compile(pattern);
  } catch (error) {
    throw new Error(`${where}: ${error.message}`, { cause: error });
  }
}

/**
 * Compile the `count` and `from` patterns of every `xsl:number` below a
 * stylesheet element (they are not attribute value templates, so they are
 * known at compile time).
 *
 * @param {{compile: (pattern: string) => object[]}} matcher - The pattern matcher
 * @param {Element} root - The stylesheet (or simplified stylesheet) element
 * @returns {void}
 * @throws {Error} When one of the patterns is invalid
 */
export function checkNumberPatterns(matcher, root) {
  forEachDescendant(root, (element) => {
    if (xsltLocalName(element) !== "number") return;
    for (const attribute of ["count", "from"]) {
      const pattern = element.getAttribute(attribute);
      if (pattern) checkPattern(matcher, pattern, `xsl:number ${attribute}`);
    }
  });
}

/**
 * A short description of the declaration holding local bindings.
 *
 * @param {Element} declaration - xsl:template, xsl:variable, ...
 * @returns {string} e.g. `template match="/"`
 */
function describeDeclaration(declaration) {
  const kind = xsltLocalName(declaration) ?? declaration.nodeName;
  for (const attribute of ["match", "name"]) {
    const value = declaration.getAttribute(attribute);
    if (value !== null) return `${kind} ${attribute}="${value}"`;
  }
  return kind;
}

/**
 * Walk a sequence constructor, reporting bindings that shadow another local
 * binding in scope. A binding is in scope for its following siblings and
 * their descendants, not for its own content.
 *
 * @param {Element} parent - The element whose children are walked
 * @param {Set<string>} inScope - Local names bound around `parent`
 * @param {(name: string) => void} report - Called for each duplicate
 * @returns {void}
 */
function walkBindings(parent, inScope, report) {
  let scope = inScope;
  for (let child = parent.firstChild; child; child = child.nextSibling) {
    if (child.nodeType !== 1) continue;
    const kind = xsltLocalName(child);
    walkBindings(child, scope, report);
    if (kind !== "variable" && kind !== "param") continue;

    const name = child.getAttribute("name");
    if (scope.has(name)) report(name);
    scope = new Set(scope).add(name);
  }
}

/**
 * Warn about local variables and parameters that shadow another local
 * binding of the same declaration (XSLT 1.0 section 11.5). A local binding
 * shadowing a global one is allowed and not reported.
 *
 * @param {Element} declaration - A top-level element (xsl:template,
 *   xsl:variable, xsl:param, xsl:attribute-set)
 * @param {(message: string) => void} warn - Reports one duplicate
 * @returns {void}
 *
 * @example
 * checkLocalBindings(templateElement, (m) => console.warn(m));
 */
export function checkLocalBindings(declaration, warn) {
  walkBindings(declaration, new Set(), (name) =>
    warn(
      `duplicate binding of variable $${name} in ${describeDeclaration(declaration)}; the later one is used (XSLT 1.0 section 11.5)`,
    ),
  );
}

/**
 * Warn about a global variable or parameter repeating the name of an
 * earlier one with the same import precedence (XSLT 1.0 section 11.4). The
 * message names the binding the engine uses: the later declaration, except
 * that a global xsl:variable wins over an xsl:param of the same name.
 *
 * @param {{name: string, kind: string, precedence: number}} declaration - The
 *   new declaration: its name, "variable" or "param", and import precedence
 * @param {{variable?: object, param?: object}} earlier - The definitions
 *   registered so far under that name (with `node` and `importPrecedence`)
 * @param {(message: string) => void} warn - Reports the duplicate
 * @returns {void}
 *
 * @example
 * checkGlobalDuplicate({ name: "v", kind: "variable", precedence: 1 },
 *   { variable: { node, importPrecedence: 1 } }, console.warn);
 */
export function checkGlobalDuplicate(declaration, earlier, warn) {
  const { name, kind, precedence } = declaration;
  const clash = [earlier.variable, earlier.param].some(
    (definition) =>
      definition?.node && definition.importPrecedence === precedence,
  );
  if (!clash) return;
  const used =
    kind === "param" && earlier.variable ? "the xsl:variable" : "the later one";
  warn(
    `duplicate global binding of variable $${name} at the same import precedence; ${used} is used (XSLT 1.0 section 11.4)`,
  );
}
