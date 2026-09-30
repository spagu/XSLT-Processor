/**
 * Conditional and repetition instructions: xsl:if, xsl:choose,
 * xsl:for-each, and the xsl:sort glue shared with xsl:apply-templates.
 *
 * Methods installed on XsltEngine.prototype (`this` is the engine).
 */

import { sortNodes } from "../sort.js";
import { LoopFrame } from "./workStack.js";

/**
 * Evaluate the `select` expression of xsl:for-each or xsl:apply-templates
 * as a node list.
 *
 * @param {object} engine - The engine
 * @param {string} select - The expression
 * @param {XsltContext} context - The current context
 * @returns {Node[]} The selected nodes (a single value becomes a list of
 *   one, an empty value an empty list)
 */
export function selectNodes(engine, select, context) {
  const nodes = engine.evaluateXPath(select, context);
  if (Array.isArray(nodes)) return nodes;
  return nodes ? [nodes] : [];
}

export const controlFlowMethods = {
  /**
   * Instantiate `xsl:if`: the content when the test is true.
   *
   * @param {Element} node - The xsl:if instruction
   * @param {XsltContext} context - The current context
   * @param {Node} output - The result node receiving the output
   * @returns {void}
   */
  xslIf(node, context, output) {
    const test = node.getAttribute("test");
    const result = this.evaluateXPath(test, context);

    if (this.xpathEvaluator.toBoolean(result)) {
      this.scheduleChildren(node, context, output);
    }
  },

  /**
   * Instantiate `xsl:choose`: the first xsl:when whose test is true, else
   * the xsl:otherwise.
   *
   * @param {Element} node - The xsl:choose instruction
   * @param {XsltContext} context - The current context
   * @param {Node} output - The result node receiving the output
   * @returns {void}
   */
  xslChoose(node, context, output) {
    for (const child of node.childNodes) {
      if (child.nodeType !== 1) continue;

      if (this.isXsltElement(child, "when")) {
        const test = child.getAttribute("test");
        const result = this.evaluateXPath(test, context);

        if (this.xpathEvaluator.toBoolean(result)) {
          this.scheduleChildren(child, context, output);
          return;
        }
      } else if (this.isXsltElement(child, "otherwise")) {
        this.scheduleChildren(child, context, output);
        return;
      }
    }
  },

  /**
   * Instantiate `xsl:for-each`: the content once per selected node, in
   * xsl:sort order, with that node as current node.
   *
   * @param {Element} node - The xsl:for-each instruction
   * @param {XsltContext} context - The current context
   * @param {Node} output - The result node receiving the output
   * @returns {void}
   */
  xslForEach(node, context, output) {
    const select = node.getAttribute("select");
    const nodes = this.sortNodes(
      selectNodes(this, select, context),
      this.sortElementsOf(node),
      context,
    );

    if (nodes.length === 0) return;

    // One node at a time from the work stack (see workStack.js)
    this.continueWith(
      new LoopFrame(nodes.length, (i) => {
        const newContext = context.clone({
          currentNode: nodes[i],
          currentNodeList: nodes,
          position: i + 1,
        });
        this.scheduleChildren(node, newContext, output);
      }),
    );
  },

  /**
   * The xsl:sort children of a sorting instruction, in document order.
   *
   * @param {Element} instruction - xsl:for-each or xsl:apply-templates
   * @returns {Element[]} The xsl:sort elements
   */
  sortElementsOf(instruction) {
    return Array.from(instruction.childNodes).filter((child) =>
      this.isXsltElement(child, "sort"),
    );
  },

  /**
   * Sort a node list by xsl:sort elements (see sort.js).
   *
   * @param {Node[]} nodes - Nodes in document order
   * @param {Element[]} sortElements - The xsl:sort elements
   * @param {XsltContext} context - Context of the sorting instruction
   * @returns {Node[]} The sorted nodes
   */
  sortNodes(nodes, sortElements, context) {
    return sortNodes(nodes, sortElements, context, this.sortHost);
  },

  /**
   * Engine callbacks used by the sort module, created once per engine.
   *
   * @returns {import('../sort.js').SortHost} The callbacks
   */
  get sortHost() {
    if (!this._sortHost) {
      this._sortHost = {
        evaluate: (expr, ctx) => this.evaluateXPath(expr, ctx),
        avt: (value, ctx) => this.processAttributeValueTemplate(value, ctx),
        toString: (value) => this.xpathEvaluator.toString(value),
        toNumber: (value) => this.xpathEvaluator.toNumber(value),
      };
    }
    return this._sortHost;
  },
};
