/**
 * The namespace a prefix is bound to on a result element, by the DOM
 * Standard's "locate a namespace" algorithm, done here rather than through
 * `Node.lookupNamespaceURI`: Firefox and @xmldom/xmldom only look at `xmlns`
 * attributes there, so for an element whose own name carries the namespace
 * (created with createElementNS, no declaration attribute) they answer null,
 * and copied nodes got a redundant `xmlns` declaration (issue #30).
 *
 * @module xslt/namespaceLookup
 */

/** Namespace of namespace declaration attributes. */
const XMLNS_NAMESPACE = "http://www.w3.org/2000/xmlns/";

/**
 * The namespace URI `prefix` resolves to on `node` and its ancestors.
 *
 * @param {Node|null|undefined} node - An element (anything else gives null)
 * @param {string|null|undefined} prefix - The prefix; null or "" for the default namespace
 * @returns {string|null} The namespace URI, or null when none is in scope
 *
 * @example
 * locateNamespace(document.createElementNS(XHTML, "p"), null); // XHTML
 */
export function locateNamespace(node, prefix) {
  const wanted = prefix || "";
  for (
    let element = node;
    element?.nodeType === 1;
    element = element.parentNode
  ) {
    if (element.namespaceURI && (element.prefix ?? "") === wanted) {
      return element.namespaceURI;
    }
    const declaration = element.getAttributeNodeNS(
      XMLNS_NAMESPACE,
      wanted || "xmlns",
    );
    if (declaration) return declaration.value || null;
  }
  return null;
}
