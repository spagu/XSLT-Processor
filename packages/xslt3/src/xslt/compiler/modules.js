/**
 * Stylesheet modules (XSLT 3.0 sections 3.11 to 3.12): the principal
 * module and the modules it includes and imports, loaded into a tree whose
 * post-order numbering gives the import precedence of each declaration.
 *
 * @module @tradik/xslt3/xslt/compiler/modules
 */

import { resolveUri } from "../../xpath/eval/uris.js";
import { attr, isXsl, XSL_NS, xslAttr, xsltError } from "../names.js";
import { setModuleUri } from "./elementInfo.js";
import { checkAttributes, checkEmpty, required } from "./attributes.js";

/**
 * @typedef {object} ModuleNode
 * @property {Element} root - xsl:stylesheet, xsl:transform or the literal
 *   result element of a simplified stylesheet
 * @property {string|undefined} uri
 * @property {boolean} simplified
 * @property {ModuleNode[]} imports
 * @property {Element[]} declarations - Top-level elements, includes resolved
 * @property {number} [precedence]
 * @property {number} [importLow] - Lowest precedence of its import tree
 */

/** Roots of simplified stylesheet modules. */
const simplifiedRoots = new WeakSet();

/**
 * The root element of a stylesheet module.
 * @param {Document|Element} source
 * @returns {{root: Element, simplified: boolean}}
 */
export function moduleRoot(source) {
  const root = source.nodeType === 9 ? source.documentElement : source;
  if (!root) throw xsltError("XTSE0150", "The stylesheet is empty");
  if (isXsl(root, "stylesheet") || isXsl(root, "transform")) {
    if (attr(root, "version") === undefined) {
      throw xsltError("XTSE0010", "xsl:stylesheet requires a version");
    }
    return { root, simplified: false };
  }
  if (root.namespaceURI === XSL_NS) {
    throw xsltError("XTSE0150", `xsl:${root.localName} is not a stylesheet`);
  }
  if (xslAttr(root, "version") === undefined) {
    throw xsltError(
      "XTSE0150",
      "A simplified stylesheet needs an xsl:version attribute",
    );
  }
  return { root, simplified: true };
}

/**
 * Loads the module tree.
 * @param {Document|Element} source - Principal module
 * @param {string|undefined} uri - Its URI
 * @param {object} cx - Stylesheet compiler: `children(element)`,
 *   `loadModule(uri)` (returns a Document), `moduleDocuments`
 * @returns {ModuleNode}
 */
export function loadModuleTree(source, uri, cx) {
  const active = [];
  const load = (document, moduleUri, imported = false) => {
    const { root, simplified } = moduleRoot(document);
    if (moduleUri !== undefined) {
      if (active.includes(moduleUri)) {
        throw imported
          ? xsltError("XTSE0210", `${moduleUri} imports itself`)
          : xsltError("XTSE0180", `${moduleUri} includes itself`);
      }
      cx.moduleDocuments.set(moduleUri, document.ownerDocument ?? document);
    }
    setModuleUri(root, moduleUri);
    if (!simplified) checkAttributes(root);
    const node = {
      root,
      uri: moduleUri,
      simplified,
      imports: [],
      declarations: [],
    };
    if (simplified) {
      simplifiedRoots.add(root);
      node.declarations.push(root);
      return node;
    }
    if (!cx.included(root)) return node;
    active.push(moduleUri);
    let declared = false;
    for (const child of cx.children(root)) {
      if (child.nodeType === 3) {
        throw xsltError("XTSE0120", "Text is not allowed at the top level");
      }
      const href = () => {
        checkAttributes(child);
        checkEmpty(child, cx);
        return resolveUri(required(child, "href"), cx.baseUriOf(child));
      };
      if (isXsl(child, "import")) {
        if (declared) {
          throw xsltError(
            "XTSE0200",
            "xsl:import must come before other declarations",
          );
        }
        const target = href();
        node.imports.push(load(cx.loadModule(target), target, true));
      } else if (isXsl(child, "include")) {
        declared = true;
        const target = href();
        const included = load(cx.loadModule(target), target);
        node.imports.push(...included.imports);
        node.declarations.push(...included.declarations);
      } else {
        declared = true;
        node.declarations.push(child);
      }
    }
    active.pop();
    return node;
  };
  const tree = load(source, uri);
  let counter = 0;
  const number = (node) => {
    const low = counter;
    for (const imported of node.imports) number(imported);
    node.precedence = counter++;
    node.importLow = low;
  };
  number(tree);
  return tree;
}

/**
 * The declarations of a module tree with their precedence, in
 * declaration order (lowest precedence first).
 * @param {ModuleNode} tree
 * @returns {Array<{element: Element, precedence: number, importLow: number,
 *   simplified: boolean}>}
 */
export function declarationsOf(tree) {
  const result = [];
  const visit = (node) => {
    for (const imported of node.imports) visit(imported);
    for (const element of node.declarations) {
      result.push({
        element,
        precedence: node.precedence,
        importLow: node.importLow,
        simplified: simplifiedRoots.has(element),
      });
    }
  };
  visit(tree);
  return result;
}
