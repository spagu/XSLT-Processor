/**
 * Helpers of the markup writer about content: the children of an element
 * as written, whitespace, namespace URIs in declarations, and the check
 * that a document type or standalone declaration has a document to go
 * with.
 *
 * @module @tradik/xslt3/serialize/markup/content
 */

import { XPathError } from "../../errors.js";
import { isContentTypeMeta } from "./prolog.js";

/**
 * @param {string} text
 * @returns {boolean} whether the text is XML whitespace only
 */
export const isWhitespace = (text) => /^[ \t\r\n]*$/.test(text);

const URI_ESCAPES = { "&": "&amp;", "<": "&lt;", '"': "&quot;" };

/**
 * @param {string} uri - A namespace URI
 * @returns {string} the URI escaped for an attribute value
 */
export const escapeNamespaceUri = (uri) =>
  uri.replace(/[&<"]/g, (c) => URI_ESCAPES[c]);

/**
 * The children of an element as written: adjacent character data merged
 * into strings, other nodes kept.
 * @param {Element} element
 * @param {boolean} dropMeta - Leave out content type meta elements
 * @returns {Array<string|Node>}
 */
export function childList(element, dropMeta) {
  const list = [];
  for (let child = element.firstChild; child; child = child.nextSibling) {
    const type = child.nodeType;
    if (type === 3 || type === 4) {
      const last = list.length - 1;
      if (typeof list[last] === "string") list[last] += child.nodeValue;
      else if (child.nodeValue) list.push(child.nodeValue);
    } else if (type === 1 || type === 7 || type === 8) {
      if (!(dropMeta && isContentTypeMeta(child))) list.push(child);
    }
  }
  return list;
}

/**
 * A document type declaration or a standalone declaration needs a
 * well-formed document: one element and no text at the top level.
 * @param {Array<string|Node>} entries
 * @param {import("../params/settings.js").Settings} settings
 * @throws {XPathError} SEPM0004 when the content is not a document
 */
export function checkDocument(entries, settings) {
  const { method, doctypeSystem, standalone } = settings;
  if (
    method === "html" ||
    (doctypeSystem === undefined && standalone === "omit")
  ) {
    return;
  }
  const elements = entries.filter(
    (e) => typeof e !== "string" && e.nodeType === 1,
  );
  if (elements.length > 1 || entries.some((e) => typeof e === "string")) {
    throw new XPathError(
      "SEPM0004",
      "doctype-system and standalone need a single element and no text at the top level",
    );
  }
}
