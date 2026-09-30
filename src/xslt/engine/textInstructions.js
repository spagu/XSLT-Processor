/**
 * Instructions producing text: xsl:value-of, xsl:text, xsl:comment,
 * xsl:processing-instruction and xsl:message, and attribute value templates.
 *
 * Methods installed on XsltEngine.prototype (`this` is the engine).
 */

import { evaluateAvt } from "../avt.js";

/**
 * Append a text node to the result unless the text is empty.
 *
 * @param {XsltContext} context - The current context
 * @param {Node} output - The result node receiving the text
 * @param {string} text - The text
 * @param {boolean} disableOutputEscaping - Whether the serializer must write
 *   the text without escaping
 * @returns {void}
 */
function appendText(context, output, text, disableOutputEscaping) {
  if (!text) return;
  const textNode = context.outputDocument.createTextNode(text);
  if (disableOutputEscaping) {
    textNode._disableOutputEscaping = true;
  }
  output.appendChild(textNode);
}

/**
 * Whether an instruction has disable-output-escaping="yes".
 *
 * @param {Element} node - xsl:value-of or xsl:text
 * @returns {boolean} True when output escaping is disabled
 */
function disablesOutputEscaping(node) {
  return node.getAttribute("disable-output-escaping") === "yes";
}

export const textInstructionMethods = {
  /**
   * Instantiate `xsl:value-of`: the string value of the expression.
   *
   * @param {Element} node - The xsl:value-of instruction
   * @param {XsltContext} context - The current context
   * @param {Node} output - The result node receiving the text
   * @returns {void}
   */
  xslValueOf(node, context, output) {
    const result = this.evaluateXPath(node.getAttribute("select"), context);
    appendText(
      context,
      output,
      this.xpathEvaluator.toString(result),
      disablesOutputEscaping(node),
    );
  },

  /**
   * Instantiate `xsl:text`: its text and CDATA children.
   *
   * @param {Element} node - The xsl:text instruction
   * @param {XsltContext} context - The current context
   * @param {Node} output - The result node receiving the text
   * @returns {void}
   */
  xslText(node, context, output) {
    let text = "";
    for (const child of node.childNodes) {
      if (child.nodeType === 3 || child.nodeType === 4) {
        text += child.nodeValue || "";
      }
    }
    appendText(context, output, text, disablesOutputEscaping(node));
  },

  /**
   * Instantiate the content of an instruction and return its string value,
   * for instructions whose result is text (attribute, comment, PI, message).
   *
   * @param {Element} node - The instruction
   * @param {XsltContext} context - The current context
   * @returns {string} The text of the instantiated content
   */
  instantiateText(node, context) {
    const fragment = context.outputDocument.createDocumentFragment();
    this.processChildren(node, context, fragment);
    return this.xpathEvaluator.getStringValue(fragment);
  },

  /**
   * Instantiate `xsl:comment`. "--" and a trailing "-" are made safe by the
   * serializer (XSLT 1.0 section 7.4).
   *
   * @param {Element} node - The xsl:comment instruction
   * @param {XsltContext} context - The current context
   * @param {Node} output - The result node receiving the comment
   * @returns {void}
   */
  xslComment(node, context, output) {
    const text = this.instantiateText(node, context);
    output.appendChild(context.outputDocument.createComment(text));
  },

  /**
   * Instantiate `xsl:processing-instruction`, with the error recovery of
   * XSLT 1.0 section 7.3: "?>" cannot end the data early.
   *
   * @param {Element} node - The xsl:processing-instruction instruction
   * @param {XsltContext} context - The current context
   * @param {Node} output - The result node receiving the PI
   * @returns {void}
   */
  xslProcessingInstruction(node, context, output) {
    const name = this.processAttributeValueTemplate(
      node.getAttribute("name"),
      context,
    );
    const data = this.instantiateText(node, context).replaceAll("?>", "? >");
    const pi = context.outputDocument.createProcessingInstruction(name, data);
    output.appendChild(pi);
  },

  /**
   * Instantiate `xsl:message`: log the text, and stop the transformation
   * with terminate="yes".
   *
   * @param {Element} node - The xsl:message instruction
   * @param {XsltContext} context - The current context
   * @param {Node} _output - Unused: a message produces no output
   * @returns {void}
   * @throws {Error} With terminate="yes"
   */
  xslMessage(node, context, _output) {
    const terminate = node.getAttribute("terminate") === "yes";
    const text = this.instantiateText(node, context);

    console.log("XSLT Message:", text);

    if (terminate) {
      throw new Error(`XSLT terminated: ${text}`);
    }
  },

  /**
   * Evaluate an attribute value template (see avt.js).
   *
   * @param {string} value - The attribute value
   * @param {XsltContext} context - The current context
   * @returns {string} The resulting text
   */
  processAttributeValueTemplate(value, context) {
    return evaluateAvt(value, (expr) =>
      this.xpathEvaluator.toString(this.evaluateXPath(expr, context)),
    );
  },

  /**
   * Evaluate an optional attribute value template attribute.
   *
   * @param {Element} node - The instruction
   * @param {string} name - The attribute name
   * @param {XsltContext} context - The current context
   * @returns {string|null} The value, or null when the attribute is absent
   */
  optionalAvt(node, name, context) {
    const raw = node.getAttribute(name);
    return raw === null
      ? null
      : this.processAttributeValueTemplate(raw, context);
  },
};
