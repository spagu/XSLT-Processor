/**
 * DOM helpers of the comparison: which children count, the XPath step of
 * a node and how a differing node is shown. Pure (works on any DOM).
 *
 * @module xslt-migrate-check/compat/nodes
 */

/** The element the XML parser wraps a result in (results may be fragments). */
export const WRAPPER = "xslt-migrate-test-result";

/**
 * Tell whether a node is the `<meta>` charset element of HTML output
 * (`http-equiv="Content-Type"` or `charset`), which serializers add on
 * their own.
 *
 * @param {Node} node - A child node
 * @returns {boolean} True for such a meta element
 */
export function isCharsetMeta(node) {
  if (node.nodeType !== 1 || node.localName.toLowerCase() !== "meta") {
    return false;
  }
  const equiv = node.getAttribute("http-equiv") ?? "";
  return equiv.toLowerCase() === "content-type" || node.hasAttribute("charset");
}

/**
 * The children that count: elements, comments, processing instructions and
 * text that is not only whitespace; no doctype, no charset meta.
 *
 * @param {Node} node - A parent node
 * @returns {Node[]} The children
 */
export function significantChildren(node) {
  return [...node.childNodes].filter((child) => {
    if (child.nodeType === 3 || child.nodeType === 4) {
      return child.nodeValue.trim() !== "";
    }
    return [1, 7, 8].includes(child.nodeType) && !isCharsetMeta(child);
  });
}

/**
 * A name that is equal for equal nodes: the namespace and local name of an
 * element, or the kind (and target) of another node.
 *
 * @param {Node} node - A node
 * @returns {string} The name
 */
export function nodeName(node) {
  if (node.nodeType === 1) {
    return `{${node.namespaceURI ?? ""}}${node.localName}`;
  }
  if (node.nodeType === 7) return `processing-instruction(${node.target})`;
  return node.nodeType === 8 ? "comment()" : "text()";
}

/**
 * The XPath step of a node among its significant siblings.
 *
 * @param {Node} node - The node
 * @param {Node[]} siblings - Its significant siblings, itself included
 * @returns {string} e.g. "li[2]" or "text()"
 */
export function stepOf(node, siblings) {
  const name = nodeName(node);
  const same = siblings.filter((sibling) => nodeName(sibling) === name);
  const label = node.nodeType === 1 ? node.localName : name;
  if (same.length === 1) return label;
  return `${label}[${same.indexOf(node) + 1}]`;
}

/**
 * Show a differing node: an element as markup; text, a comment or a
 * processing instruction through its parent element (unless that is the
 * wrapper), which says where it is.
 *
 * @param {Node|null} node - The node, null when missing
 * @param {(node: Node) => string} serialize - Serializer
 * @returns {string} The text to show
 */
export function describeNode(node, serialize) {
  if (!node) return "(nothing)";
  if (node.nodeType === 1) return serialize(node);
  const parent = node.parentNode;
  if (parent?.nodeType === 1 && parent.localName !== WRAPPER) {
    return serialize(parent);
  }
  return node.nodeValue.trim();
}
