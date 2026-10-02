/**
 * The static stage of compilation (XSLT 3.0 section 3.13): stylesheet
 * modules loaded, elements kept or dropped by use-when, static variables
 * and parameters evaluated in document order, shadow attributes
 * replaced by their values.
 *
 * @module @tradik/xslt3/xslt/compiler/staticStage
 */

import { toSequence } from "../../xpath/eval/values.js";
import { stringItem } from "../../xpath/eval/atomics.js";
import {
  attr,
  clarkOf,
  isXsl,
  resolveQName,
  setShadowAttributes,
  XSL_NS,
  xsltError,
} from "../names.js";
import { significantChildren } from "./children.js";
import { forgetInfo, infoOf } from "./elementInfo.js";
import {
  isModuleReference,
  loadModuleDocument,
  preloadModule,
} from "./moduleLoading.js";
import { declareConsistently } from "./staticVariables.js";
import { evaluateStatic, evaluateStaticAvt, useWhen } from "./useWhen.js";

/**
 * @param {Element} element
 * @returns {boolean} whether an element declares a static variable or
 *   parameter
 */
const isStaticDeclaration = (element) =>
  (isXsl(element, "variable") || isXsl(element, "param")) &&
  ["yes", "true", "1"].includes(attr(element, "static")?.trim()) &&
  (isXsl(element.parentNode, "stylesheet") ||
    isXsl(element.parentNode, "transform") ||
    isXsl(element.parentNode, "package"));

/** Module loading and the static stage. */
export class StaticStage {
  /**
   * @param {object} options - See compileStylesheet: `loadStylesheet`,
   *   `parse`, `staticParams` (Map of Clark names to values)
   */
  constructor(options) {
    this.options = options;
    /** @type {Map<string, Array>} static variables by Clark name */
    this.statics = new Map();
    /** @type {Map<string, Document>} stylesheet modules by URI */
    this.moduleDocuments = new Map();
    this.childCache = new WeakMap();
    this.includedCache = new WeakMap();
    /** @type {Map<string, Document|Element>} loaded modules by URI */
    this.loadedModules = new Map();
    /** @type {Map<string, object>} static declarations by Clark name */
    this.staticDeclarations = new Map();
    /** @type {number[]} the xsl:import elements being loaded, outermost first */
    this.importPath = [];
    this.imports = 0;
    /** @type {Set<string>} modules being loaded ahead (cycles) */
    this.preloading = new Set();
    // static expressions parse XML and build nodes with the XML parser
    const parse = (text) => options.parse(text);
    this.resources = {
      xmlParser: parse,
      createDocument: () => {
        const document = parse("<x/>");
        document.removeChild(document.documentElement);
        return document;
      },
    };
  }

  /**
   * @param {Element} element
   * @returns {Array<Element|object>} the significant children
   */
  children(element) {
    let children = this.childCache.get(element);
    if (!children) {
      children = significantChildren(element, (child) => this.included(child));
      this.childCache.set(element, children);
    }
    return children;
  }

  /**
   * Whether use-when keeps an element; a kept element has its shadow
   * attributes evaluated, and a static declaration is evaluated.
   * @param {Element} element
   * @returns {boolean}
   */
  included(element) {
    let included = this.includedCache.get(element);
    if (included === undefined) {
      // a shadow use-when (_use-when) is evaluated before the condition
      const early = element.hasAttribute?.("_use-when");
      if (early) this.applyShadows(element);
      included = useWhen(element, this.statics, this.resources);
      this.includedCache.set(element, included);
      if (included) {
        if (!early) this.applyShadows(element);
        if (isStaticDeclaration(element)) this.declareStatic(element);
        if (isModuleReference(element)) this.preload(element);
      }
    }
    return included;
  }

  /**
   * Evaluates the shadow attributes (`_name`) of an XSLT element.
   * @param {Element} element
   */
  applyShadows(element) {
    if (element.namespaceURI !== XSL_NS) return;
    const values = new Map();
    for (const attribute of element.attributes) {
      const name = attribute.name;
      if (!name.startsWith("_") || attribute.namespaceURI) continue;
      const value = evaluateStaticAvt(
        attribute.value,
        element,
        this.statics,
        this.resources,
      );
      values.set(name.slice(1), value);
    }
    if (values.size > 0) {
      setShadowAttributes(element, values);
      forgetInfo(element);
    }
  }

  /**
   * Evaluates a static variable or parameter.
   * @param {Element} element
   */
  declareStatic(element) {
    const name = attr(element, "name");
    if (name === undefined) {
      throw xsltError("XTSE0010", "A static variable needs a name");
    }
    if (this.children(element).length > 0) {
      throw xsltError(
        attr(element, "select") === undefined ? "XTSE0010" : "XTSE0620",
        "A static variable has no content",
      );
    }
    if (
      isXsl(element, "param") &&
      ["yes", "true", "1"].includes(attr(element, "required")?.trim()) &&
      attr(element, "select") !== undefined
    ) {
      throw xsltError("XTSE0010", "A required static parameter has no select");
    }
    const key = clarkOf(resolveQName(name, infoOf(element).namespaces));
    const supplied = this.options.staticParams?.get?.(key);
    const select = attr(element, "select");
    let value;
    if (isXsl(element, "param") && supplied !== undefined) {
      value = toSequence(supplied);
    } else if (select !== undefined) {
      value = evaluateStatic(select, element, this.statics, this.resources);
    } else {
      // no select, no content: "" without "as", else the empty sequence
      value = attr(element, "as") === undefined ? [stringItem("")] : [];
    }
    declareConsistently(this, key, {
      element,
      value,
      path: [...this.importPath],
    });
  }

  /**
   * Loads the module of an xsl:import or xsl:include as soon as it is
   * met (see moduleLoading.js).
   * @param {Element} element
   */
  preload(element) {
    preloadModule(this, element);
  }

  /**
   * Loads an included or imported module (see moduleLoading.js).
   * @param {string} uri - Absolute URI
   * @param {string} [base] - Base URI it was resolved against
   * @returns {Document|Element}
   */
  loadModule(uri, base) {
    return loadModuleDocument(this, uri, base);
  }
}
