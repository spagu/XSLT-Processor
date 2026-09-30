/**
 * Variables and parameters: external parameter values, the global bindings
 * of a transformation, variable values, xsl:variable and xsl:with-param.
 *
 * Methods installed on XsltEngine.prototype (`this` is the engine).
 */

import { trimXmlSpace } from "../../xpath/strings.js";
import { inScopeNamespaces } from "../stylesheetNamespaces.js";
import { GlobalBindings } from "../variables.js";

/**
 * Whether a variable-binding element has content (XSLT 1.0 section 11.2).
 *
 * Whitespace-only text is stripped from stylesheets, and comments and
 * processing instructions are not part of a template, so they do not count.
 *
 * @param {Element|undefined} node - xsl:variable, xsl:param or xsl:with-param
 * @returns {boolean} True when instantiating the element produces a fragment
 */
function hasTemplateContent(node) {
  for (let child = node?.firstChild; child; child = child.nextSibling) {
    if (child.nodeType === 1) return true;
    const isText = child.nodeType === 3 || child.nodeType === 4;
    if (isText && trimXmlSpace(child.nodeValue) !== "") return true;
  }
  return false;
}

export const bindingMethods = {
  /**
   * Supply the value of a global parameter from outside the stylesheet.
   *
   * The value is merged into the `xsl:param` declaration when there is one, so
   * removing the value later restores the declared default.
   *
   * @param {string} name - The parameter name, `{uri}local` when namespaced
   * @param {*} value - The value to use
   * @returns {void}
   *
   * @example
   * engine.setParameterValue('sortOrder', 'ascending');
   */
  setParameterValue(name, value) {
    const definition = this.globalParameters[name];

    if (definition) definition.value = value;
    else this.globalParameters[name] = { value };
  },

  /**
   * Remove an externally supplied parameter value.
   *
   * The `xsl:param` declaration of the stylesheet is kept, so the parameter
   * falls back to its declared default instead of becoming undefined.
   *
   * @param {string} name - The parameter name, `{uri}local` when namespaced
   * @returns {void}
   *
   * @example
   * engine.clearParameterValue('sortOrder');
   */
  clearParameterValue(name) {
    const definition = this.globalParameters[name];
    if (!definition) return;

    if (definition.node) delete definition.value;
    else delete this.globalParameters[name];
  },

  /**
   * Remove every externally supplied parameter value.
   *
   * @returns {void}
   *
   * @example
   * engine.clearParameterValues();
   */
  clearParameterValues() {
    for (const name of Object.keys(this.globalParameters)) {
      this.clearParameterValue(name);
    }
  },

  /**
   * Declare the global variables and parameters of the stylesheet for one
   * transformation. They are evaluated lazily with the root node as context
   * node (XSLT 1.0 section 11.4), so they may refer to each other in any
   * order. Of a variable and a parameter of the same name, the one with the
   * higher import precedence wins (section 11.4), the variable when the
   * precedences are equal.
   *
   * @param {XsltContext} rootContext - The initial context
   * @returns {GlobalBindings} The global bindings
   */
  createGlobals(rootContext) {
    const globals = new GlobalBindings((def) => {
      const context = rootContext.clone();
      if (def.node) context.namespaces = inScopeNamespaces(def.node);
      return this.evaluateVariable(def, context);
    });

    for (const [name, def] of Object.entries(this.globalParameters)) {
      globals.define(name, def);
    }
    for (const [name, def] of Object.entries(this.globalVariables)) {
      const param = this.globalParameters[name];
      if (param?.node && param.importPrecedence > def.importPrecedence) {
        continue;
      }
      globals.define(name, def);
    }
    return globals;
  },

  /**
   * Compute the value of a variable or parameter definition.
   *
   * A value supplied from outside (`setParameter`) wins over the `select`
   * expression and over the instantiated content of the declaration.
   *
   * @param {{value?: *, select?: string, node?: Element}} def - The definition
   * @param {XsltContext} context - The context used for evaluation
   * @returns {*} The variable value
   */
  evaluateVariable(def, context) {
    if ("value" in def) {
      return def.value;
    }

    if (def.select) {
      return this.evaluateXPath(def.select, context);
    }

    // Empty content and no select: the value is an empty string (XSLT 11.2),
    // which is false in a boolean test, unlike an (always true) fragment.
    if (!hasTemplateContent(def.node)) {
      return "";
    }

    // Otherwise the content is instantiated as a result tree fragment
    const fragment = context.outputDocument.createDocumentFragment();
    this.processChildren(def.node, context, fragment);
    return fragment;
  },

  /**
   * Evaluate the xsl:with-param children of an apply-templates or
   * call-template instruction.
   *
   * @param {Element} node - The invoking instruction
   * @param {XsltContext} context - Its context
   * @returns {Object<string, *>} Values by parameter name
   */
  withParams(node, context) {
    const params = {};
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (this.isXsltElement(child, "with-param")) {
        params[child.getAttribute("name")] = this.evaluateVariable(
          { node: child, select: child.getAttribute("select") },
          context,
        );
      }
    }
    return params;
  },

  /**
   * Instantiate xsl:variable: bind the variable for the following siblings.
   * Content is instantiated from the work stack (see workStack.js), so
   * recursion inside a variable keeps the JavaScript stack flat, and the
   * fragment is bound once it is complete.
   *
   * @param {Element} node - The xsl:variable element
   * @param {XsltContext} context - The current context
   * @param {Node} _output - Unused: a variable produces no output
   * @returns {void}
   */
  xslVariable(node, context, _output) {
    const name = node.getAttribute("name");
    const select = node.getAttribute("select");
    if (select || !hasTemplateContent(node)) {
      context.setVariable(
        name,
        this.evaluateVariable({ node, select }, context),
      );
      return;
    }

    const fragment = context.outputDocument.createDocumentFragment();
    this.scheduleChildren(node, context, fragment, () =>
      context.setVariable(name, fragment),
    );
  },
};
