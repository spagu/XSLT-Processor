/**
 * Markup the serializer adds on its own: the XML declaration, the
 * document type declaration and the content type `meta` element of
 * include-content-type (Serialization 3.1 sections 5.1, 6, 7.1 and 7.4).
 *
 * @module @tradik/xslt3/serialize/markup/prolog
 */

/**
 * @param {import("../params/settings.js").Settings} settings
 * @returns {string} the XML declaration, "" when omitted or not XML
 */
export function xmlDeclaration(settings) {
  const { method, omitXmlDeclaration, version, encoding, standalone } =
    settings;
  if (omitXmlDeclaration || (method !== "xml" && method !== "xhtml")) {
    return "";
  }
  const standalonePart =
    standalone === "omit" ? "" : ` standalone="${standalone}"`;
  return `<?xml version="${version}" encoding="${encoding.name}"${standalonePart}?>`;
}

/**
 * The document type declaration written before the first element.
 * @param {import("../params/settings.js").Settings} settings
 * @param {string} name - Output name of the first element
 * @returns {string} the declaration, "" for none
 */
export function doctype(settings, name) {
  const { method, doctypePublic, doctypeSystem, htmlVersion } = settings;
  const html5Default =
    htmlVersion === 5 && name.replace(/^.*:/, "").toLowerCase() === "html";
  if (method === "html") {
    if (doctypePublic !== undefined) {
      const system = doctypeSystem === undefined ? "" : ` "${doctypeSystem}"`;
      return `<!DOCTYPE html PUBLIC "${doctypePublic}"${system}>`;
    }
    if (doctypeSystem !== undefined) {
      return `<!DOCTYPE html SYSTEM "${doctypeSystem}">`;
    }
    return html5Default ? "<!DOCTYPE html>" : "";
  }
  if (doctypeSystem !== undefined) {
    const external =
      doctypePublic === undefined
        ? `SYSTEM "${doctypeSystem}"`
        : `PUBLIC "${doctypePublic}" "${doctypeSystem}"`;
    return `<!DOCTYPE ${name} ${external}>`;
  }
  return method === "xhtml" && html5Default ? "<!DOCTYPE html>" : "";
}

/**
 * @param {import("../params/settings.js").Settings} settings
 * @returns {string} the meta element declaring the content type
 */
export function contentTypeMeta(settings) {
  const end = settings.method === "html" ? ">" : " />";
  const content = `${settings.mediaType}; charset=${settings.encoding.name}`;
  return `<meta http-equiv="Content-Type" content="${content}"${end}`;
}

/**
 * Whether a node is a meta element declaring the content type (replaced
 * by the serializer's own with include-content-type).
 * @param {Node} node
 * @returns {boolean}
 */
export function isContentTypeMeta(node) {
  if (node.nodeType !== 1) return false;
  if ((node.localName ?? node.nodeName).toLowerCase() !== "meta") return false;
  const value = node.getAttribute("http-equiv");
  return typeof value === "string" && value.toLowerCase() === "content-type";
}
