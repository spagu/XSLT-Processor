/**
 * The xsl:output declaration and the engine's output settings
 * (XSLT 1.0 section 16).
 *
 * Methods installed on XsltEngine.prototype (`this` is the engine).
 */

import { cdataSectionNames } from "../outputNames.js";
import { inScopeNamespaces } from "../stylesheetNamespaces.js";

/**
 * The xsl:output attributes copied as they are, with their setting names.
 * A later non-empty attribute replaces the setting.
 */
const OUTPUT_ATTRIBUTES = Object.freeze([
  ["method", "method"],
  ["version", "version"],
  ["encoding", "encoding"],
  ["standalone", "standalone"],
  ["indent", "indent"],
  ["omit-xml-declaration", "omitXmlDeclaration"],
  ["doctype-public", "doctypePublic"],
  ["doctype-system", "doctypeSystem"],
  ["media-type", "mediaType"],
]);

/**
 * The output settings of a stylesheet without xsl:output.
 *
 * A null method means "not declared": the serializer then picks html or xml
 * from the result tree (XSLT 1.0 section 16). An undefined indent is "no"
 * too, except for the line breaks libxslt writes between comments and the
 * document element (see serializer/settings.js).
 *
 * @returns {object} New default output settings
 */
export function createOutputSettings() {
  return {
    method: null,
    version: "1.0",
    encoding: "UTF-8",
    standalone: null,
    indent: undefined,
    omitXmlDeclaration: "no",
    doctypePublic: null,
    doctypeSystem: null,
    mediaType: null,
    cdataSectionElements: [],
  };
}

export const outputDeclarationMethods = {
  /**
   * Merge an xsl:output element into the output settings (XSLT 1.0
   * section 16): a later attribute wins, except cdata-section-elements whose
   * expanded names are united.
   *
   * @param {Element} node - The xsl:output element
   * @returns {void}
   */
  processOutput(node) {
    for (const [attribute, setting] of OUTPUT_ATTRIBUTES) {
      const value = node.getAttribute(attribute);
      if (value) this.outputSettings[setting] = value;
    }

    const cdataElements = node.getAttribute("cdata-section-elements");
    if (cdataElements) {
      this.outputSettings.cdataSectionElements = cdataSectionNames(
        cdataElements,
        inScopeNamespaces(node),
        this.outputSettings.cdataSectionElements,
        (message) => this.warnOnce(message),
      );
    }
  },
};
