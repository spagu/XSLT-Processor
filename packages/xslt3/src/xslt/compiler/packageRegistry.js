/**
 * What a package adds to the registries of a stylesheet (XSLT 3.0
 * section 3.5): the modes accepted from used packages, the modes the
 * package refers to (declared-modes), and the name xsl:original while an
 * overriding declaration is compiled.
 *
 * @module @tradik/xslt3/xslt/compiler/packageRegistry
 */

import { attr, clarkOf, ORIGINAL } from "../names.js";
import { infoOf } from "./elementInfo.js";
import { CompilerRegistry } from "./registry.js";

/** Registries of a package. */
export class PackageRegistry extends CompilerRegistry {
  /** @param {object} options - See compileStylesheet (and packageChain) */
  constructor(options) {
    super(options);
    /** @type {Map<string, import("../patterns/modes.js").Mode>} */
    this.acceptedModes = new Map();
    /** @type {Set<string>} modes named by xsl:apply-templates */
    this.modeRefs = new Set();
    /** @type {object|null} the component an overriding one is compiled for */
    this.overriding = null;
    /** @type {string[]} names of the packages being compiled */
    this.packageChain = options.packageChain ?? [];
    this.uses = [];
    this.table = new Map();
  }

  /**
   * The scope of top-level declarations.
   * @param {number} [original] - Index of the global that the name
   *   xsl:original refers to (in an overriding variable)
   * @returns {{vars: object|null}}
   */
  globalScope(original) {
    if (original === undefined) return super.globalScope();
    let vars = null;
    this.globalKeys.forEach((key, i) => {
      vars = { key: i === original ? ORIGINAL : key, next: vars };
    });
    return { vars };
  }

  /**
   * The registry key of a template or attribute set reference: the
   * overridden component for xsl:original in an overriding declaration.
   * @param {string} kind - "template" or "attribute-set"
   * @param {string} name - Clark name
   * @returns {string|null} null when the name is not xsl:original there
   */
  originalName(kind, name) {
    if (name !== ORIGINAL || this.overriding?.kind !== kind) return null;
    return `${ORIGINAL}#${this.overriding.key}`;
  }

  /**
   * @param {Element} element - xsl:mode
   * @returns {string} the Clark name of the mode it declares
   */
  declaredModeName(element) {
    const text = attr(element, "name");
    return text === undefined ? "" : clarkOf(this.exprs.qname(text, element));
  }

  /**
   * @param {Element} element
   * @returns {string} the default mode of an element
   */
  defaultModeOf(element) {
    return infoOf(element).defaultMode;
  }

  /**
   * A mode accepted from a used package, else one of this package.
   * @param {string} name - Clark name, "" for the unnamed mode
   * @returns {import("../patterns/modes.js").Mode}
   */
  mode(name) {
    return this.acceptedModes.get(name) ?? super.mode(name);
  }

  /**
   * Resolves the mode attribute of xsl:apply-templates, noting the mode.
   * @param {string|undefined} text
   * @param {Element} element
   * @returns {{current: boolean, name: string}}
   */
  modeRef(text, element) {
    const ref = super.modeRef(text, element);
    if (!ref.current) this.modeRefs.add(ref.name);
    return ref;
  }
}
