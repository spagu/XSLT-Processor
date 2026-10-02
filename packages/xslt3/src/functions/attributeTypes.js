/**
 * Attribute types declared in the internal DTD subset of a document
 * (`<!ATTLIST>` declarations), which make attributes IDs, IDREFs or
 * IDREFS without a schema (XDM 3.1: the is-id and is-idrefs properties).
 * DOM implementations that expose `doctype.internalSubset` (such as
 * @xmldom/xmldom) are supported; external DTD subsets are not read.
 * `xml:id` attributes are always IDs.
 *
 * @module @tradik/xslt3/functions/attributeTypes
 */

import { XML_NAMESPACE } from "../xpath/eval/namespaceNodes.js";

const ATTLIST = /<!ATTLIST\s+([^\s>]+)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const ATTRIBUTE_DEF =
  /([^\s()"']+)\s+(\([^)]*\)|NOTATION\s*\([^)]*\)|[A-Z]+)\s+(?:#REQUIRED|#IMPLIED|(?:#FIXED\s+)?(?:"[^"]*"|'[^']*'))/g;

/** @type {WeakMap<object, Map<string, string>>} */
const cache = new WeakMap();

/**
 * Declared types of the attributes of a document, by "element attribute".
 * @param {Document} document
 * @returns {Map<string, string>} e.g. "chapter id" to "ID"
 */
function declaredTypes(document) {
  let types = cache.get(document);
  if (!types) {
    types = new Map();
    const subset = document.doctype?.internalSubset ?? "";
    for (const [, element, body] of subset.matchAll(ATTLIST)) {
      for (const [, attribute, type] of body.matchAll(ATTRIBUTE_DEF)) {
        const key = `${element} ${attribute}`;
        if (!types.has(key)) types.set(key, type);
      }
    }
    cache.set(document, types);
  }
  return types;
}

/**
 * The type of an attribute: "ID" for xml:id, else its DTD declaration.
 * @param {Attr} attribute
 * @param {Element} element - Its parent
 * @returns {string|undefined} "ID", "IDREF", "IDREFS", "CDATA"...
 */
export function attributeType(attribute, element) {
  if (
    attribute.namespaceURI === XML_NAMESPACE &&
    attribute.localName === "id"
  ) {
    return "ID";
  }
  return declaredTypes(element.ownerDocument).get(
    `${element.nodeName} ${attribute.name}`,
  );
}
