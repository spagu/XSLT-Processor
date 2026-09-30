/**
 * Document type declaration of the html output method (XSLT 1.0 section
 * 16.2), as libxslt and libxml2 (and so Chrome) write it.
 *
 * Without `doctype-public` and `doctype-system`, libxslt derives the
 * identifiers from the `version` attribute of `xsl:output` (its table
 * below): `version="5"` gives `<!DOCTYPE html>`, `version="4.01"` the HTML
 * 4.01 Transitional DTD. The system identifier `about:legacy-compat` is not
 * written (HTML5's legacy doctype string).
 *
 * @module xslt/serializer/htmlDoctype
 */

/** Doctype identifiers by html `version`, libxslt's xsltHTMLVersions. */
const HTML_VERSIONS = new Map([
  ["5", [null, "about:legacy-compat"]],
  [
    "4.01frame",
    [
      "-//W3C//DTD HTML 4.01 Frameset//EN",
      "http://www.w3.org/TR/1999/REC-html401-19991224/frameset.dtd",
    ],
  ],
  [
    "4.01strict",
    [
      "-//W3C//DTD HTML 4.01//EN",
      "http://www.w3.org/TR/1999/REC-html401-19991224/strict.dtd",
    ],
  ],
  [
    "4.01trans",
    [
      "-//W3C//DTD HTML 4.01 Transitional//EN",
      "http://www.w3.org/TR/1999/REC-html401-19991224/loose.dtd",
    ],
  ],
  [
    "4.01",
    [
      "-//W3C//DTD HTML 4.01 Transitional//EN",
      "http://www.w3.org/TR/1999/REC-html401-19991224/loose.dtd",
    ],
  ],
  [
    "4.0strict",
    ["-//W3C//DTD HTML 4.01//EN", "http://www.w3.org/TR/html4/strict.dtd"],
  ],
  [
    "4.0trans",
    [
      "-//W3C//DTD HTML 4.01 Transitional//EN",
      "http://www.w3.org/TR/html4/loose.dtd",
    ],
  ],
  [
    "4.0frame",
    [
      "-//W3C//DTD HTML 4.01 Frameset//EN",
      "http://www.w3.org/TR/html4/frameset.dtd",
    ],
  ],
  [
    "4.0",
    [
      "-//W3C//DTD HTML 4.01 Transitional//EN",
      "http://www.w3.org/TR/html4/loose.dtd",
    ],
  ],
  ["3.2", ["-//W3C//DTD HTML 3.2//EN", null]],
]);

/** System identifier libxml2 leaves out of an HTML doctype. */
const LEGACY_COMPAT = "about:legacy-compat";

/**
 * Build the doctype of html output.
 *
 * @param {{doctypePublic?: string|null, doctypeSystem?: string|null,
 *   version?: string|null}} settings - Normalized output settings
 * @param {string} name - Name of the document element
 * @returns {string} The doctype markup, or "" when there is none
 *
 * @example
 * htmlDoctypeMarkup({ version: "5" }, "html"); // "<!DOCTYPE html>"
 */
export function htmlDoctypeMarkup(settings, name) {
  let publicId = settings.doctypePublic || null;
  let systemId = settings.doctypeSystem || null;
  if (!publicId && !systemId) {
    const ids = HTML_VERSIONS.get(String(settings.version).toLowerCase());
    if (!ids) return "";
    [publicId, systemId] = ids;
  }
  if (publicId) {
    const system = systemId ? ` "${systemId}"` : "";
    return `<!DOCTYPE ${name} PUBLIC "${publicId}"${system}>`;
  }
  return systemId === LEGACY_COMPAT
    ? `<!DOCTYPE ${name}>`
    : `<!DOCTYPE ${name} SYSTEM "${systemId}">`;
}
