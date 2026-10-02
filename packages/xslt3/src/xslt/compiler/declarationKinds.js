/**
 * The top-level declarations of a stylesheet module tree, grouped by kind
 * and checked: known XSLT declarations (XTSE0010), elements in no
 * namespace (XTSE0130), xsl:expose only in xsl:package, empty
 * declarations (XTSE0260), no xsl:import-schema (XTSE1650: this
 * processor is not schema aware).
 *
 * @module @tradik/xslt3/xslt/compiler/declarationKinds
 */

import { isXsl, XSL_NS, xsltError } from "../names.js";
import { checkAttributes, checkEmpty } from "./attributes.js";
import { infoOf } from "./elementInfo.js";
import { declarationsOf } from "./modules.js";

/** Top-level XSLT declarations. */
const DECLARATIONS = new Set([
  "template",
  "function",
  "variable",
  "param",
  "key",
  "output",
  "decimal-format",
  "namespace-alias",
  "strip-space",
  "preserve-space",
  "character-map",
  "attribute-set",
  "mode",
  "import-schema",
  "global-context-item",
  "accumulator",
  "use-package",
  "expose",
]);

/** Declarations that must be empty. */
const EMPTY_DECLARATIONS = new Set([
  "strip-space",
  "preserve-space",
  "namespace-alias",
  "output",
  "decimal-format",
]);

/**
 * The declarations of a module tree by kind, checked.
 * @param {object} tree - See modules.js
 * @param {object} cx - Stylesheet compiler (records the precedences)
 * @returns {(kind: string) => object[]} the declarations of a kind
 */
export function collectDeclarations(tree, cx) {
  const packageRoot = isXsl(tree.root, "package") ? tree.root : null;
  const byKind = new Map();
  for (const declaration of declarationsOf(tree)) {
    const { element, simplified } = declaration;
    const kind = simplified ? "simplified" : element.localName;
    if (!simplified && element.namespaceURI !== XSL_NS) {
      if (!element.namespaceURI) {
        throw xsltError("XTSE0130", `${element.nodeName} has no namespace`);
      }
      continue;
    }
    if (!simplified && !DECLARATIONS.has(kind)) {
      if (infoOf(element).version > 3) continue;
      throw xsltError("XTSE0010", `xsl:${kind} is not a declaration`);
    }
    if (kind === "expose" && element.parentNode !== packageRoot) {
      throw xsltError("XTSE0010", "xsl:expose belongs in xsl:package");
    }
    if (!simplified) checkAttributes(element);
    if (EMPTY_DECLARATIONS.has(kind)) checkEmpty(element, cx);
    if (!byKind.has(kind)) byKind.set(kind, []);
    byKind.get(kind).push(declaration);
    cx.declarationPrecedence.set(element, declaration.precedence);
  }
  if (byKind.has("import-schema")) {
    throw xsltError("XTSE1650", "xsl:import-schema needs schema awareness");
  }
  return (kind) => byKind.get(kind) ?? [];
}
