/**
 * Template invocation: xsl:apply-templates, xsl:apply-imports,
 * xsl:call-template, the built-in template rules and template parameters.
 *
 * Methods installed on XsltEngine.prototype (`this` is the engine).
 */

import { childAxis } from "../../xpath/axes.js";
import { requireExpandedName } from "../declarationNames.js";
import { selectNodes } from "./controlFlow.js";

export const templateInvocationMethods = {
  /**
   * Apply templates to a node list.
   *
   * @param {Node|Node[]} nodes - The nodes to process, in order
   * @param {string|null} mode - The mode
   * @param {XsltContext} context - Context of the invoking instruction
   * @param {Node} output - The result node receiving the output
   * @param {Object<string, *>|null} [params] - Values of xsl:with-param by name
   * @returns {void}
   */
  applyTemplates(nodes, mode, context, output, params = null) {
    const nodeList = Array.isArray(nodes) ? nodes : [nodes];

    for (let i = 0; i < nodeList.length; i++) {
      const node = nodeList[i];
      const template = this.findMatchingTemplate(node, mode, context);

      if (template) {
        const newContext = this.invocationContext(context, template, {
          currentNode: node,
          currentNodeList: nodeList,
          position: i + 1,
          currentMode: mode,
        });

        this.processTemplate(template.node, newContext, output, params);
      } else {
        this.applyBuiltinTemplate(node, mode, context, output, params);
      }
    }
  },

  /**
   * Context of a template invocation: no local bindings, the template as
   * current template and the prefixes in scope on the xsl:template element.
   *
   * @param {XsltContext} context - Context of the invoking instruction
   * @param {object} template - The template record
   * @param {object} [overrides] - Further properties to change
   * @returns {XsltContext} The invocation context
   */
  invocationContext(context, template, overrides = {}) {
    const invocation = context.clone({
      currentTemplate: template,
      ...overrides,
      fresh: true,
    });
    invocation.namespaces = template.namespaces ?? context.namespaces;
    return invocation;
  },

  /**
   * Apply the built-in template rules (XSLT 1.0 section 5.8). Parameters are
   * passed on to the templates applied to the children, as libxslt does.
   *
   * @param {Node} node - The node without a matching template
   * @param {string|null} mode - The mode
   * @param {XsltContext} context - Context of the invoking instruction
   * @param {Node} output - The result node receiving the output
   * @param {Object<string, *>|null} [params] - Values of xsl:with-param by name
   * @returns {void}
   */
  applyBuiltinTemplate(node, mode, context, output, params = null) {
    switch (node.nodeType) {
      case 1: // Element
      case 9: // Document
      case 11: // Document Fragment
        this.applyTemplates(childAxis(node), mode, context, output, params);
        break;

      case 2: // Attribute
      case 3: // Text
      case 4: // CDATA
        // Copy the string value; a text node stands for its whole text run
        output.appendChild(
          context.outputDocument.createTextNode(
            this.xpathEvaluator.getStringValue(node),
          ),
        );
        break;

      // Comments and PIs have no built-in template
    }
  },

  /**
   * Instantiate a template. Each `xsl:param` takes the value of the
   * `xsl:with-param` of the same name, else its default, evaluated after the
   * preceding parameters were bound (XSLT 1.0 section 11.6).
   *
   * @param {Element|object} templateNode - The xsl:template element
   * @param {XsltContext} context - A fresh invocation context
   * @param {Node} output - The result node receiving the output
   * @param {Object<string, *>|null} [params] - Values of xsl:with-param by name
   * @returns {void}
   */
  processTemplate(templateNode, context, output, params = null) {
    for (
      let child = templateNode.firstChild;
      child;
      child = child.nextSibling
    ) {
      if (child.nodeType !== 1 || !this.isXsltElement(child, "param")) continue;

      const name = child.getAttribute("name");
      context.parameters[name] =
        params && Object.hasOwn(params, name)
          ? params[name]
          : this.evaluateVariable(
              { node: child, select: child.getAttribute("select") },
              context,
            );
    }

    this.processChildren(templateNode, context, output);
  },

  /**
   * Instantiate `xsl:apply-templates`: the selected nodes (default the
   * children), sorted by the xsl:sort children, with the xsl:with-param
   * values.
   *
   * @param {Element} node - The xsl:apply-templates instruction
   * @param {XsltContext} context - The current context
   * @param {Node} output - The result node receiving the output
   * @returns {void}
   */
  xslApplyTemplates(node, context, output) {
    const select = node.getAttribute("select") || "node()";
    const mode = node.getAttribute("mode") || null;
    const nodes = this.sortNodes(
      selectNodes(this, select, context),
      this.sortElementsOf(node),
      context,
    );
    const params = this.withParams(node, context);
    this.applyTemplates(nodes, mode, context, output, params);
  },

  /**
   * Instantiate `xsl:apply-imports`.
   *
   * Only templates with a lower import precedence than the template being
   * instantiated are considered; when none matches, the built-in template rules
   * apply, exactly as for `xsl:apply-templates`.
   *
   * @param {Element} node - The `xsl:apply-imports` element
   * @param {XsltContext} context - The current XSLT context
   * @param {Node} output - The result tree node receiving the output
   * @returns {void}
   */
  xslApplyImports(node, context, output) {
    const currentNode = context.currentNode;
    const mode = context.currentMode ?? null;
    const precedence = context.currentTemplate
      ? context.currentTemplate.importPrecedence || 0
      : 0;

    const template = this.findMatchingTemplate(
      currentNode,
      mode,
      context,
      precedence,
    );

    if (!template) {
      this.applyBuiltinTemplate(currentNode, mode, context, output);
      return;
    }

    // xsl:apply-imports passes no parameters (XSLT 1.0 section 5.6)
    this.processTemplate(
      template.node,
      this.invocationContext(context, template),
      output,
    );
  },

  /**
   * Instantiate `xsl:call-template` with its xsl:with-param values.
   *
   * @param {Element} node - The xsl:call-template instruction
   * @param {XsltContext} context - The current context
   * @param {Node} output - The result node receiving the output
   * @returns {void}
   * @throws {Error} When no template has that name
   */
  xslCallTemplate(node, context, output) {
    const name = node.getAttribute("name");
    const template = this.findNamedTemplate(
      requireExpandedName(name ?? "", node, "xsl:call-template name"),
    );
    if (!template) {
      throw new Error(`Template not found: ${name}`);
    }

    // A named template does not become the current template rule
    const invocation = this.invocationContext(context, template, {
      currentTemplate: context.currentTemplate,
    });
    this.processTemplate(
      template.node,
      invocation,
      output,
      this.withParams(node, context),
    );
  },
};
