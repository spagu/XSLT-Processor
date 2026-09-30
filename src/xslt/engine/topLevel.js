/**
 * Top-level elements of a stylesheet module: their dispatch to the
 * declaration handlers, simplified stylesheets and the stylesheet-wide
 * namespace table.
 *
 * Methods installed on XsltEngine.prototype (`this` is the engine).
 */

import { XSLT_NAMESPACE } from "../elements.js";
import { inScopeNamespaces } from "../stylesheetNamespaces.js";
import {
  checkLocalBindings,
  checkNumberPatterns,
  checkTopLevelText,
} from "../stylesheetChecks.js";
import { isForwardsCompatible } from "../forwardsCompatible.js";

/**
 * Engine method handling each top-level XSLT element (xsl:import is handled
 * first, separately, because imports must precede everything else).
 */
const TOP_LEVEL_HANDLERS = Object.freeze({
  template: "registerTemplate",
  output: "processOutput",
  variable: "processGlobalVariable",
  param: "processGlobalParam",
  key: "processKey",
  "decimal-format": "processDecimalFormat",
  "namespace-alias": "processNamespaceAlias",
  "attribute-set": "processAttributeSet",
  "strip-space": "processStripSpace",
  "preserve-space": "processPreserveSpace",
  include: "processInclude",
});

export const topLevelMethods = {
  /**
   * Process the top-level elements of a stylesheet module.
   *
   * xsl:import elements are processed first, so imported declarations get a
   * lower import precedence than the ones of the importing stylesheet.
   *
   * @param {Element} root - The xsl:stylesheet element
   * @param {string} stylesheetUri - URI used to resolve imports and includes
   * @returns {void}
   */
  processTopLevelElements(root, stylesheetUri) {
    checkTopLevelText(root);
    this.collectNamespaces(root);

    const imports = [];
    const otherElements = [];
    for (const child of root.childNodes) {
      if (child.nodeType !== 1) continue;
      if (this.isXsltElement(child, "import")) imports.push(child);
      else otherElements.push(child);
    }

    for (const importNode of imports) {
      this.processImport(importNode, stylesheetUri);
    }

    for (const child of otherElements) {
      if (!this.isXsltNamespace(child)) continue;
      const method = TOP_LEVEL_HANDLERS[child.localName];
      if (method) this[method](child, stylesheetUri);
      else this.unknownTopLevelElement(child);
    }
    checkNumberPatterns(this.patternMatcher, root);
  },

  /**
   * Ignore an unknown top-level XSLT element: silently in forwards-compatible
   * mode (XSLT 1.0 section 2.5), with a warning otherwise.
   *
   * @param {Element} node - The unknown element
   * @returns {void}
   */
  unknownTopLevelElement(node) {
    if (isForwardsCompatible(node)) return;
    this.warnOnce(`unknown top-level element xsl:${node.localName} is ignored`);
  },

  /**
   * Register a simplified stylesheet (XSLT 1.0 section 2.3): the literal result
   * root element is the body of a template rule matching "/", so the root
   * element itself is instantiated, not only its children.
   *
   * @param {Element} root - The literal result root element
   * @returns {void}
   */
  processLiteralResultStylesheet(root) {
    this.collectNamespaces(root);
    checkNumberPatterns(this.patternMatcher, root);
    checkLocalBindings(root, (message) => this.warnOnce(message));
    this.templates.push({
      match: "/",
      name: null,
      mode: null,
      priority: 0.5,
      importPrecedence: this.currentImportPrecedence,
      namespaces: inScopeNamespaces(root),
      node: { firstChild: root, childNodes: [root] },
    });
  },

  /**
   * Record the namespace declarations of a stylesheet document element in
   * the stylesheet-wide fallback table. Instructions resolve prefixes against
   * their own in-scope namespaces; this table only serves contexts without a
   * stylesheet element. The first binding of a prefix wins, so a module
   * loaded later cannot rebind the main stylesheet's prefixes.
   *
   * @param {Element} node - The stylesheet element
   * @returns {void}
   */
  collectNamespaces(node) {
    if (!node.attributes) return;

    for (const attr of node.attributes) {
      let prefix = null;
      if (attr.name.startsWith("xmlns:")) prefix = attr.name.substring(6);
      else if (attr.name === "xmlns") prefix = "";

      if (prefix !== null && attr.value !== XSLT_NAMESPACE) {
        this.namespaces[prefix] ??= attr.value;
      }
    }
  },
};
