/**
 * XSLT processing context (the state of one instruction's evaluation).
 */

import { XPathEvaluator } from "../../xpath/evaluator.js";
import { createVariableView, lookupVariable } from "../variables.js";

/**
 * XSLT Processing Context
 *
 * `variables` and `parameters` hold the local bindings in scope; the global
 * variables and parameters of the transformation are in `globals`. The engine
 * starts every template invocation with empty local bindings (and the
 * template's own parameters), so local variables are lexically scoped.
 * `namespaces` holds the prefixes in scope on the stylesheet element being
 * instantiated.
 */
export class XsltContext {
  constructor(options = {}) {
    this.currentNode = options.currentNode;
    this.currentNodeList = options.currentNodeList || [];
    this.position = options.position || 1;
    this.variables = { ...options.variables };
    this.parameters = { ...options.parameters };
    this.globals = options.globals ?? null;
    this.outputDocument = options.outputDocument;
    this.stylesheet = options.stylesheet;
    this.namespaces = options.namespaces ?? {};
    this.templates = options.templates || [];
    this.keys = options.keys || {};
    this.decimalFormats = options.decimalFormats || {};
    this.outputMethod = options.outputMethod || "xml";
    this.xpathEvaluator = options.xpathEvaluator || new XPathEvaluator();
    this.currentTemplate = options.currentTemplate || null;
    this.currentMode = options.currentMode ?? null;
    this.variableView = null;
  }

  /**
   * Copy the context, changing some of its properties.
   *
   * `variables`, `parameters` and `namespaces` overrides are merged into the
   * current ones; with `fresh: true` the copy starts without local bindings
   * (a new template invocation).
   *
   * @param {object} [overrides] - Properties to change
   * @returns {XsltContext} The copy
   */
  clone(overrides = {}) {
    const fresh = overrides.fresh === true;
    const merge = (own, extra) => (extra ? { ...own, ...extra } : own);
    return new XsltContext({
      currentNode: overrides.currentNode ?? this.currentNode,
      currentNodeList: overrides.currentNodeList ?? this.currentNodeList,
      position: overrides.position ?? this.position,
      variables: fresh ? null : merge(this.variables, overrides.variables),
      parameters: fresh ? null : merge(this.parameters, overrides.parameters),
      globals: this.globals,
      outputDocument: this.outputDocument,
      stylesheet: this.stylesheet,
      namespaces: merge(this.namespaces, overrides.namespaces),
      templates: this.templates,
      keys: this.keys,
      decimalFormats: this.decimalFormats,
      outputMethod: this.outputMethod,
      xpathEvaluator: this.xpathEvaluator,
      currentTemplate: overrides.currentTemplate ?? this.currentTemplate,
      currentMode: overrides.currentMode ?? this.currentMode,
    });
  }

  /**
   * The variables in scope, as the object view the XPath evaluator reads.
   *
   * @returns {object} A live, read-only view (see createVariableView)
   */
  get xpathVariables() {
    this.variableView ??= createVariableView(this);
    return this.variableView;
  }

  /**
   * The value of a variable or parameter in scope.
   *
   * @param {string} name - The variable name
   * @returns {*} The value
   * @throws {Error} When no such variable is in scope
   */
  getVariable(name) {
    const { found, value } = lookupVariable(this, name);
    if (!found) throw new Error(`Undefined variable: $${name}`);
    return value;
  }

  /**
   * Bind a local variable in this context.
   *
   * @param {string} name - The variable name
   * @param {*} value - Its value
   * @returns {void}
   */
  setVariable(name, value) {
    this.variables[name] = value;
  }
}
