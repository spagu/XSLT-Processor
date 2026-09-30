/**
 * Top-level declarations other than templates and xsl:output: global
 * variables and parameters, keys, decimal formats, namespace aliases,
 * attribute sets and whitespace stripping.
 *
 * Methods installed on XsltEngine.prototype (`this` is the engine).
 */

import { inScopeNamespaces } from "../stylesheetNamespaces.js";
import { compileSpaceNameTests } from "../spaceNameTests.js";
import { registerAttributeSet } from "../attributeSets.js";
import { expandName } from "../declarationNames.js";
import {
  checkGlobalDuplicate,
  checkLocalBindings,
  checkPattern,
  xsltLocalName,
} from "../stylesheetChecks.js";

/**
 * The properties of an xsl:decimal-format declaration, with their defaults
 * (XSLT 1.0 section 12.3).
 *
 * @param {Element} node - The xsl:decimal-format element
 * @param {number} importPrecedence - Its import precedence
 * @returns {object} The decimal format
 */
function readDecimalFormat(node, importPrecedence) {
  return {
    importPrecedence,
    decimalSeparator: node.getAttribute("decimal-separator") || ".",
    groupingSeparator: node.getAttribute("grouping-separator") || ",",
    percent: node.getAttribute("percent") || "%",
    perMille: node.getAttribute("per-mille") || "‰",
    zeroDigit: node.getAttribute("zero-digit") || "0",
    digit: node.getAttribute("digit") || "#",
    patternSeparator: node.getAttribute("pattern-separator") || ";",
    infinity: node.getAttribute("infinity") || "Infinity",
    nan: node.getAttribute("NaN") || "NaN",
    minusSign: node.getAttribute("minus-sign") || "-",
  };
}

export const declarationMethods = {
  /**
   * Register an `xsl:variable` top level declaration.
   *
   * @param {Element} node - The `xsl:variable` element
   * @returns {void}
   */
  processGlobalVariable(node) {
    const name = node.getAttribute("name");
    this.checkGlobalBinding(name, node);
    this.globalVariables[name] = {
      node,
      select: node.getAttribute("select"),
      importPrecedence: this.currentImportPrecedence,
    };
  },

  /**
   * Warn about a global variable or parameter declared twice at the same
   * import precedence (an error in XSLT 1.0 section 11.4 that libxslt
   * reports) and about duplicate local bindings in its content. The later
   * declaration is used, or the xsl:variable when a parameter has the same
   * name and import precedence.
   *
   * @param {string} name - The declared name
   * @param {Element} node - The xsl:variable or xsl:param element
   * @returns {void}
   */
  checkGlobalBinding(name, node) {
    const warn = (message) => this.warnOnce(message);
    checkLocalBindings(node, warn);
    checkGlobalDuplicate(
      {
        name,
        kind: xsltLocalName(node),
        precedence: this.currentImportPrecedence,
      },
      {
        variable: this.globalVariables[name],
        param: this.globalParameters[name],
      },
      warn,
    );
  },

  /**
   * Register an `xsl:param` top level declaration.
   *
   * A value supplied from outside (through `setParameter`) has precedence over
   * the declared default, so it survives compilation of the stylesheet.
   *
   * @param {Element} node - The `xsl:param` element
   * @returns {void}
   */
  processGlobalParam(node) {
    const name = node.getAttribute("name");
    this.checkGlobalBinding(name, node);
    const existing = this.globalParameters[name];
    const definition = {
      node,
      select: node.getAttribute("select"),
      importPrecedence: this.currentImportPrecedence,
    };

    if (existing && "value" in existing) {
      definition.value = existing.value;
    }

    this.globalParameters[name] = definition;
  },

  /**
   * Register an xsl:key declaration. Declarations sharing a name all
   * contribute to the same key (XSLT 1.0 section 12.2); a declaration seen
   * again through another import branch is only kept once.
   *
   * @param {Element} node - The xsl:key element
   * @returns {void}
   */
  processKey(node) {
    const name = node.getAttribute("name");
    const match = node.getAttribute("match");
    const use = node.getAttribute("use");
    if (match !== null) {
      checkPattern(this.patternMatcher, match, "xsl:key match");
    }
    const definitions = (this.keys[name] ??= []);

    if (!definitions.some((d) => d.match === match && d.use === use)) {
      definitions.push({ match, use, namespaces: inScopeNamespaces(node) });
    }
    this.keyRegistry.clear();
  },

  /**
   * Register an xsl:decimal-format declaration under the expanded name of
   * its `name` (XSLT 1.0 section 12.3). Like libxslt, an invalid name or an
   * undeclared prefix is reported and the declaration ignored, and a second
   * declaration of the same name and import precedence is reported and
   * ignored; one of a higher import precedence replaces an imported one.
   *
   * @param {Element} node - The xsl:decimal-format element
   * @returns {void}
   */
  processDecimalFormat(node) {
    const name = node.getAttribute("name");
    let key = "";
    if (name !== null) {
      const expanded = expandName(name, node);
      if (expanded.error) {
        this.warnOnce(
          `xsl:decimal-format: ${expanded.error}; the declaration is ignored`,
        );
        return;
      }
      key = expanded.key;
      const existing = this.decimalFormats[key];
      if (existing?.importPrecedence === this.currentImportPrecedence) {
        this.warnOnce(
          `xsl:decimal-format: "${name}" is already declared; the first declaration is used`,
        );
        return;
      }
    }

    this.decimalFormats[key] = readDecimalFormat(
      node,
      this.currentImportPrecedence,
    );
  },

  /**
   * Register an xsl:namespace-alias declaration.
   *
   * @param {Element} node - The xsl:namespace-alias element
   * @returns {void}
   */
  processNamespaceAlias(node) {
    this.namespaceAliases.add(node);
  },

  /**
   * Register an xsl:attribute-set declaration; declarations of the same
   * expanded name are merged (see attributeSets.js).
   *
   * @param {Element} node - The xsl:attribute-set element
   * @returns {void}
   */
  processAttributeSet(node) {
    checkLocalBindings(node, (message) => this.warnOnce(message));
    registerAttributeSet(
      this.attributeSets,
      node,
      this.currentImportPrecedence,
    );
  },

  /**
   * Register the name tests of an xsl:strip-space element, expanded with
   * its namespace declarations (see spaceNameTests.js).
   *
   * @param {Element} node - The xsl:strip-space element
   * @returns {void}
   */
  processStripSpace(node) {
    this.stripSpace.push(...this.spaceNameTests(node));
  },

  /**
   * Register the name tests of an xsl:preserve-space element.
   *
   * @param {Element} node - The xsl:preserve-space element
   * @returns {void}
   */
  processPreserveSpace(node) {
    this.preserveSpace.push(...this.spaceNameTests(node));
  },

  /**
   * Expand the `elements` name tests of xsl:strip-space/preserve-space.
   *
   * @param {Element} node - The declaring element
   * @returns {object[]} The expanded name tests
   */
  spaceNameTests(node) {
    return compileSpaceNameTests(node.getAttribute("elements"), node, (m) =>
      this.warnOnce(m),
    );
  },
};
