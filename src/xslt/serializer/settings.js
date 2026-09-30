/**
 * Output Settings Resolution
 *
 * Normalizes the `xsl:output` settings collected by the XSLT engine into the
 * shape the serializers consume (XSLT 1.0 section 16).
 */

import { NODE_TYPE } from "./constants.js";

/**
 * Test whether an `xsl:output` yes/no attribute is enabled.
 *
 * @param {string|boolean|undefined} value - Raw attribute value
 * @returns {boolean} True when the value means "yes"
 */
function isYes(value) {
  return value === true || String(value).toLowerCase() === "yes";
}

/**
 * Lookup key of an expanded name, in Clark notation: `{uri}local`, or the
 * bare local name for a name in no namespace.
 *
 * @param {string|null|undefined} namespaceUri - Namespace URI, empty for none
 * @param {string} localName - Local name
 * @returns {string} The key
 *
 * @example
 * expandedNameKey("urn:p", "c"); // "{urn:p}c"
 * expandedNameKey(null, "c");    // "c"
 */
export function expandedNameKey(namespaceUri, localName) {
  return namespaceUri ? `{${namespaceUri}}${localName}` : localName;
}

/**
 * @typedef {Object} CdataNames
 * @property {Set<string>} expanded - Expanded name keys ({@link expandedNameKey})
 * @property {Array<{prefix: string, localName: string}>} qnames - Prefixed
 *   names whose prefix is resolved against the result element
 */

/**
 * Normalize a `cdata-section-elements` value.
 *
 * Entries resolved by the engine, `{namespaceUri, localName}`, are exact
 * expanded names. A plain string QName carries no namespace bindings: an
 * unprefixed name is taken to be in no namespace, and a prefixed one is kept
 * aside to be resolved with the in-scope namespaces of each result element.
 *
 * @param {string|Array<string|{namespaceUri: ?string, localName: string}>|undefined} value -
 *   Whitespace separated QNames, or an array of QNames and expanded names
 * @returns {CdataNames} The names
 */
function toCdataNames(value) {
  const entries =
    typeof value === "string" ? value.split(/\s+/) : [value ?? []].flat();
  const expanded = new Set();
  const qnames = [];

  for (const entry of entries) {
    if (typeof entry !== "string") {
      expanded.add(expandedNameKey(entry.namespaceUri, entry.localName));
      continue;
    }
    const colon = entry.indexOf(":");
    if (colon === -1) {
      if (entry) expanded.add(entry);
    } else {
      qnames.push({
        prefix: entry.slice(0, colon),
        localName: entry.slice(colon + 1),
      });
    }
  }

  return { expanded, qnames };
}

/**
 * Find the first element node of a result tree.
 *
 * @param {Node|null} node - Document, fragment or element
 * @returns {Element|null} The result document element, when there is one
 */
export function findRootElement(node) {
  if (!node) {
    return null;
  }
  if (node.nodeType === NODE_TYPE.ELEMENT) {
    return node;
  }
  for (const child of node.childNodes || []) {
    if (child.nodeType === NODE_TYPE.ELEMENT) {
      return child;
    }
  }
  return null;
}

/** Text made only of XML whitespace (#x20 #x9 #xD #xA). */
const XML_WHITESPACE_ONLY = /^[ \t\r\n]*$/;

/**
 * Whether text other than XML whitespace precedes the first element child.
 *
 * @param {Node} node - Document or fragment that has an element child
 * @returns {boolean} True when a non-whitespace text node comes first
 */
function hasLeadingText(node) {
  for (
    let child = node.firstChild;
    child.nodeType !== NODE_TYPE.ELEMENT;
    child = child.nextSibling
  ) {
    const isText =
      child.nodeType === NODE_TYPE.TEXT ||
      child.nodeType === NODE_TYPE.CDATA_SECTION;
    if (isText && !XML_WHITESPACE_ONLY.test(child.nodeValue)) return true;
  }
  return false;
}

/**
 * Derive the default output method from the result tree.
 *
 * XSLT 1.0 section 16 defaults to `html` when the document element is `html`
 * in no namespace and no text other than whitespace precedes it, and to
 * `xml` otherwise.
 *
 * @param {Node|null} node - Result tree root
 * @returns {string} Either "html" or "xml"
 */
export function detectOutputMethod(node) {
  const root = findRootElement(node);
  const isHtmlRoot =
    root &&
    !root.namespaceURI &&
    root.localName.toLowerCase() === "html" &&
    (root === node || !hasLeadingText(node));
  return isHtmlRoot ? "html" : "xml";
}

/**
 * Normalize an `xsl:output` settings object.
 *
 * An absent, empty or "auto" method triggers the XSLT 1.0 default method
 * detection based on the result tree.
 *
 * @param {object|null} outputSettings - Raw settings from the XSLT engine
 * @param {Node|null} node - Result tree used for default method detection
 * @returns {object} Normalized settings consumed by the serializers
 */
export function resolveOutputSettings(outputSettings, node) {
  const raw = outputSettings || {};
  const declared = typeof raw.method === "string" ? raw.method.trim() : "";
  const method =
    declared && declared !== "auto"
      ? declared.toLowerCase()
      : detectOutputMethod(node);
  const cdata = toCdataNames(raw.cdataSectionElements);

  return {
    method,
    version: raw.version || "1.0",
    encoding: raw.encoding || "UTF-8",
    standalone: raw.standalone || null,
    indent: isYes(raw.indent),
    // libxslt writes a line break after a top-level comment followed by
    // another node unless indent="no" is declared (xsltSaveResultTo)
    topLevelLineBreaks: raw.indent == null || isYes(raw.indent),
    omitXmlDeclaration: isYes(raw.omitXmlDeclaration),
    doctypePublic: raw.doctypePublic || null,
    doctypeSystem: raw.doctypeSystem || null,
    mediaType: raw.mediaType || null,
    cdataSectionElements: cdata.expanded,
    cdataSectionQNames: cdata.qnames,
  };
}
