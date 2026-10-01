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
import { infoOf } from "./elementInfo.js";
import { evaluateStatic, evaluateStaticAvt, useWhen } from "./useWhen.js";

/**
 * An embedded stylesheet module: the element of a document whose id is
 * the fragment identifier of its URI.
 * @param {Document} document
 * @param {string} id
 * @param {string} uri - For the error message
 * @returns {Element}
 */
function embeddedStylesheet(document, id, uri) {
  const stack = [document.documentElement];
  while (stack.length > 0) {
    const element = stack.pop();
    if (element.getAttribute("id") === id) return element;
    for (let child = element.lastChild; child; child = child.previousSibling) {
      if (child.nodeType === 1) stack.push(child);
    }
  }
  throw xsltError("XTSE0165", `No element with id ${id} in ${uri}`);
}

/**
 * @param {Element} element
 * @returns {boolean} whether an element declares a static variable or
 *   parameter
 */
const isStaticDeclaration = (element) =>
  (isXsl(element, "variable") || isXsl(element, "param")) &&
  ["yes", "true", "1"].includes(attr(element, "static")?.trim()) &&
  (isXsl(element.parentNode, "stylesheet") ||
    isXsl(element.parentNode, "transform"));

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
      included = useWhen(element, this.statics);
      this.includedCache.set(element, included);
      if (included) {
        this.applyShadows(element);
        if (isStaticDeclaration(element)) this.declareStatic(element);
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
      const value = evaluateStaticAvt(attribute.value, element, this.statics);
      values.set(name.slice(1), value);
    }
    if (values.size > 0) setShadowAttributes(element, values);
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
    const key = clarkOf(resolveQName(name, infoOf(element).namespaces));
    const supplied = this.options.staticParams?.get?.(key);
    const select = attr(element, "select");
    let value;
    if (isXsl(element, "param") && supplied !== undefined) {
      value = toSequence(supplied);
    } else if (select !== undefined) {
      value = evaluateStatic(select, element, this.statics);
    } else value = [stringItem("")];
    this.statics.set(key, value);
  }

  /**
   * Loads an included or imported module (`uri#id` for an embedded one).
   * @param {string} uri
   * @returns {Document|Element}
   */
  loadModule(uri) {
    const [location, fragment] = uri.split("#");
    let document;
    try {
      document = this.options.loadStylesheet?.(location);
    } catch (error) {
      throw xsltError("XTSE0165", `Cannot load ${uri}: ${error.message}`);
    }
    if (!document) throw xsltError("XTSE0165", `Cannot load ${uri}`);
    if (typeof document === "string") {
      document = this.options.parse(document, location);
    }
    return fragment ? embeddedStylesheet(document, fragment, uri) : document;
  }
}
