/**
 * Loading of stylesheet modules for the static stage: the documents of
 * xsl:import and xsl:include (cached by URI, so that a module is one tree
 * however often it is referenced), loaded as soon as the reference is met
 * so that the static variables of the module are in scope for what
 * follows (XSLT 3.0 section 9.7).
 *
 * @module @tradik/xslt3/xslt/compiler/moduleLoading
 */

import { resolveUri } from "../../xpath/eval/uris.js";
import { attr, isXsl, xsltError } from "../names.js";
import { infoOf, setModuleUri } from "./elementInfo.js";

/**
 * An embedded stylesheet module: the element of a document whose id is
 * the fragment identifier of its URI.
 * @param {Document} document
 * @param {string} id
 * @param {string} uri - For the error message
 * @returns {Element}
 */
function embeddedStylesheet(document, id, uri) {
  const stack = [document.documentElement];
  while (stack.length > 0) {
    const element = stack.pop();
    if (element.getAttribute("id") === id) return element;
    for (let child = element.lastChild; child; child = child.previousSibling) {
      if (child.nodeType === 1) stack.push(child);
    }
  }
  throw xsltError("XTSE0165", `No element with id ${id} in ${uri}`);
}

/**
 * @param {Element} element
 * @returns {boolean} whether an element is a top-level xsl:import or
 *   xsl:include
 */
export const isModuleReference = (element) =>
  (isXsl(element, "import") || isXsl(element, "include")) &&
  isModuleRoot(element.parentNode);

/**
 * @param {Node} node
 * @returns {boolean} whether a node is the root of a stylesheet module
 */
const isModuleRoot = (node) =>
  isXsl(node, "stylesheet") ||
  isXsl(node, "transform") ||
  isXsl(node, "package");

/**
 * Loads the module of an xsl:import or xsl:include as soon as it is
 * met, so that its static variables are in scope for what follows
 * (XSLT 3.0 section 9.7); the module tree is built later from the same
 * documents (modules.js).
 * @param {object} stage - The static stage
 * @param {Element} element - xsl:import or xsl:include
 */
export function preloadModule(stage, element) {
  const href = attr(element, "href");
  if (href === undefined) return;
  const uri = resolveUri(href.trim(), infoOf(element).baseUri);
  if (stage.preloading.has(uri)) return;
  let loaded;
  try {
    loaded = stage.loadModule(uri, infoOf(element).baseUri);
  } catch {
    // reported when the module tree is built, after the checks of the
    // element (modules.js)
    return;
  }
  const root = loaded.nodeType === 9 ? loaded.documentElement : loaded;
  if (!isModuleRoot(root)) return;
  setModuleUri(root, uri);
  stage.preloading.add(uri);
  const imported = isXsl(element, "import");
  if (imported) stage.importPath.push(stage.imports++);
  if (stage.included(root)) stage.children(root);
  if (imported) stage.importPath.pop();
  stage.preloading.delete(uri);
}

/**
 * Loads an included or imported module (`uri#id` for an embedded one).
 * @param {object} stage - The static stage (`options`, `loadedModules`)
 * @param {string} uri - Absolute URI
 * @param {string} [base] - Base URI it was resolved against, passed on
 *   to the `loadStylesheet` option
 * @returns {Document|Element}
 */
export function loadModuleDocument(stage, uri, base) {
  if (stage.loadedModules.has(uri)) return stage.loadedModules.get(uri);
  const [location, fragment] = uri.split("#");
  let document;
  try {
    document = stage.options.loadStylesheet?.(location, base);
  } catch (error) {
    throw xsltError("XTSE0165", `Cannot load ${uri}: ${error.message}`);
  }
  if (!document) throw xsltError("XTSE0165", `Cannot load ${uri}`);
  if (typeof document === "string") {
    document = stage.options.parse(document, location);
  }
  const module = fragment
    ? embeddedStylesheet(document, fragment, uri)
    : document;
  stage.loadedModules.set(uri, module);
  return module;
}
