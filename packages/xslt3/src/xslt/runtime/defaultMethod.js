/**
 * The default output method of a result tree (XSLT 3.0 section 26.1): html
 * for an `html` document element in no namespace (any case), xhtml for
 * `html` in the XHTML namespace (xml when the principal stylesheet module
 * is version 1.0 and the tree is the implicit principal result), else xml.
 *
 * @module @tradik/xslt3/xslt/runtime/defaultMethod
 */

const XHTML_NS = "http://www.w3.org/1999/xhtml";

/**
 * The method a tree implies.
 * @param {*} tree - Document or document fragment (other values: xml)
 * @param {boolean} versionOne - XSLT 1.0 rules for an XHTML tree
 * @returns {string}
 */
function impliedMethod(tree, versionOne) {
  for (let child = tree?.firstChild; child; child = child.nextSibling) {
    if (child.nodeType === 3 && /\S/.test(child.nodeValue)) return "xml";
    if (child.nodeType !== 1) continue;
    const local = child.localName;
    const uri = child.namespaceURI ?? "";
    if (local.toLowerCase() === "html" && uri === "") return "html";
    if (local === "html" && uri === XHTML_NS && !versionOne) return "xhtml";
    return "xml";
  }
  return "xml";
}

/**
 * Serialization parameters with the default method when they have none.
 * @param {object} output - Parameters of the output definition
 * @param {*} tree - The result
 * @param {boolean} [versionOne] - The implicit principal result of a
 *   version 1.0 stylesheet
 * @returns {object}
 */
export function withDefaultMethod(output, tree, versionOne = false) {
  if (output.method !== undefined) return output;
  return { ...output, method: impliedMethod(tree, versionOne) };
}
