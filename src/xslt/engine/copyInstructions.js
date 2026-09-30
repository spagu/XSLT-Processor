/**
 * Copying source nodes to the result: xsl:copy and xsl:copy-of.
 *
 * Methods installed on XsltEngine.prototype (`this` is the engine).
 */

import {
  cloneNode,
  copyAttribute,
  copyNamespaceNode,
  copyOf,
  shallowCopyElement,
} from "../copying.js";

export const copyInstructionMethods = {
  /**
   * Instantiate `xsl:copy`: a shallow copy of the current node; the content
   * is instantiated into a copied element, or directly for a root node.
   *
   * @param {Element} node - The xsl:copy instruction
   * @param {XsltContext} context - The current context
   * @param {Node} output - The result node receiving the copy
   * @returns {void}
   */
  xslCopy(node, context, output) {
    const currentNode = context.currentNode;
    const useAttributeSets = node.getAttribute("use-attribute-sets");

    switch (currentNode.nodeType) {
      case 1: {
        // Element, with its namespace declarations (XSLT 1.0 section 7.5)
        const copy = shallowCopyElement(currentNode, context.outputDocument);
        output.appendChild(copy);

        if (useAttributeSets) {
          this.applyAttributeSets(useAttributeSets, context, copy, node);
        }

        this.processChildren(node, context, copy);
        break;
      }

      case 2: // Attribute
        copyAttribute(currentNode, output, (target) =>
          this.canAddAttribute(target),
        );
        break;

      case 13: // Namespace node: a namespace declaration
        copyNamespaceNode(currentNode, output, (target) =>
          this.canAddAttribute(target),
        );
        break;

      case 3: // Text
      case 4: // CDATA; a text node stands for its whole text run
        output.appendChild(
          context.outputDocument.createTextNode(
            this.xpathEvaluator.getStringValue(currentNode),
          ),
        );
        break;

      case 7: // Processing Instruction
        output.appendChild(
          context.outputDocument.createProcessingInstruction(
            currentNode.target,
            currentNode.data,
          ),
        );
        break;

      case 8: // Comment
        output.appendChild(
          context.outputDocument.createComment(currentNode.nodeValue || ""),
        );
        break;

      case 9: // Document
      case 11: // Document Fragment
        this.processChildren(node, context, output);
        break;
    }
  },

  /**
   * Instantiate `xsl:copy-of`: a deep copy of the selected value.
   *
   * @param {Element} node - The xsl:copy-of instruction
   * @param {XsltContext} context - The current context
   * @param {Node} output - The result node receiving the copy
   * @returns {void}
   */
  xslCopyOf(node, context, output) {
    const select = node.getAttribute("select");
    const result = this.evaluateXPath(select, context);

    this.copyToOutput(result, context, output);
  },

  /**
   * Copy a value to the result tree as `xsl:copy-of` does (see copying.js).
   *
   * @param {*} value - The value to copy
   * @param {XsltContext} context - The current context
   * @param {Node} output - The result node receiving the copy
   * @returns {void}
   */
  copyToOutput(value, context, output) {
    copyOf(value, output, {
      doc: context.outputDocument,
      stringValue: (node) => this.xpathEvaluator.getStringValue(node),
      toString: (item) => this.xpathEvaluator.toString(item),
      canAddAttribute: (target) => this.canAddAttribute(target),
    });
  },

  /**
   * Deep copy of a node for the result tree (see copying.js); nodes that
   * cannot be children become an empty text node.
   *
   * @param {Node} node - The node to copy
   * @param {Document} targetDoc - The result document
   * @returns {Node} The copy
   */
  deepCloneNode(node, targetDoc) {
    return (
      cloneNode(node, targetDoc, (text) =>
        this.xpathEvaluator.getStringValue(text),
      ) ?? targetDoc.createTextNode("")
    );
  },
};
