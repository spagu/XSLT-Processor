/**
 * Instantiation of sequence constructors: the dispatch of each child of a
 * template body to its instruction, stylesheet text, unknown XSLT elements,
 * xsl:fallback and extension elements.
 *
 * Methods installed on XsltEngine.prototype (`this` is the engine).
 */

import { isTextContinuation } from "../../xpath/axes.js";
import { isXmlWhitespace } from "../whitespace.js";
import {
  inScopeNamespaces,
  isExtensionElement,
} from "../stylesheetNamespaces.js";
import { xsltLocalName } from "../stylesheetChecks.js";
import { fallbackChildren } from "../forwardsCompatible.js";

/**
 * Engine method instantiating each XSLT element that may occur in a sequence
 * constructor; null marks elements that produce nothing there.
 */
const INSTRUCTION_METHODS = Object.freeze({
  "apply-templates": "xslApplyTemplates",
  "apply-imports": "xslApplyImports",
  "call-template": "xslCallTemplate",
  "value-of": "xslValueOf",
  text: "xslText",
  element: "xslElement",
  attribute: "xslAttribute",
  if: "xslIf",
  choose: "xslChoose",
  "for-each": "xslForEach",
  copy: "xslCopy",
  "copy-of": "xslCopyOf",
  variable: "xslVariable",
  comment: "xslComment",
  "processing-instruction": "xslProcessingInstruction",
  number: "xslNumber",
  message: "xslMessage",
  // Handled by their parent instruction, or at template start
  param: null,
  sort: null,
  "with-param": null,
  // Used for forward compatibility
  fallback: null,
});

export const sequenceConstructorMethods = {
  /**
   * Instantiate the children of a stylesheet element (a sequence
   * constructor). A variable declared among them is visible to its following
   * siblings and their descendants only, so a body declaring variables gets
   * its own copy of the local bindings.
   *
   * @param {Element|object} node - The parent stylesheet element
   * @param {XsltContext} context - The current context
   * @param {Node} output - The result node receiving the output
   * @returns {void}
   */
  processChildren(node, context, output) {
    const scope = this.declaresVariables(node) ? context.clone() : context;
    const saved = scope.namespaces;

    // Children are dispatched inline, without a per-node helper, to keep the
    // JavaScript stack shallow: each template recursion level costs frames.
    for (let child = node.firstChild; child; child = child.nextSibling) {
      const type = child.nodeType;
      if (type === 1) {
        // Prefixes resolve against the namespaces in scope on the element
        scope.namespaces = inScopeNamespaces(child);
        const method = this.instructionMethod(child);
        if (method) this[method](child, scope, output);
      } else if (type === 3 || type === 4) {
        this.processText(child, scope, output);
      }
    }
    scope.namespaces = saved;
  },

  /**
   * Whether an element has an xsl:variable child. Cached per element.
   *
   * @param {Element|object} node - A stylesheet element
   * @returns {boolean} True when a child declares a variable
   */
  declaresVariables(node) {
    this.variableDeclarations ??= new WeakMap();
    let declares = this.variableDeclarations.get(node);
    if (declares === undefined) {
      declares = false;
      for (let child = node.firstChild; child; child = child.nextSibling) {
        if (this.isXsltElement(child, "variable")) declares = true;
      }
      this.variableDeclarations.set(node, declares);
    }
    return declares;
  },

  /**
   * Instantiate a stylesheet text node. Adjacent text and CDATA nodes form
   * one text node, which is dropped when it only holds XML whitespace (unless
   * xml:space="preserve" is in scope, XSLT 1.0 section 3.4).
   *
   * @param {Text} node - A text or CDATA node of the stylesheet
   * @param {XsltContext} context - The current context
   * @param {Node} output - The result node receiving the output
   * @returns {void}
   */
  processText(node, context, output) {
    if (isTextContinuation(node)) return;
    const text = this.xpathEvaluator.getStringValue(node);
    if (text && (!isXmlWhitespace(text) || this.shouldPreserveSpace(node))) {
      output.appendChild(context.outputDocument.createTextNode(text));
    }
  },

  /**
   * Whether xml:space="preserve" is in scope on a stylesheet text node.
   *
   * @param {Node} node - The text node
   * @returns {boolean} True when the nearest xml:space says preserve
   */
  shouldPreserveSpace(node) {
    let current = node.parentNode;
    while (current && current.nodeType === 1) {
      const space = current.getAttribute("xml:space");
      if (space === "preserve") return true;
      if (space === "default") return false;
      current = current.parentNode;
    }
    return false;
  },

  /**
   * Name of the engine method instantiating a stylesheet element: the
   * handler of an XSLT instruction, processLiteralResultElement, or
   * instantiateUnknown for an XSLT element the engine does not implement.
   * Returns null for elements that are not instructions (xsl:param,
   * xsl:sort, xsl:with-param, xsl:fallback).
   *
   * @param {Element} node - A stylesheet element in a sequence constructor
   * @returns {string|null} The method name
   */
  instructionMethod(node) {
    if (!this.isXsltNamespace(node)) {
      return isExtensionElement(node)
        ? "instantiateExtension"
        : "processLiteralResultElement";
    }

    const localName = node.localName || node.nodeName.replace(/^xsl:/, "");
    if (Object.hasOwn(INSTRUCTION_METHODS, localName)) {
      return INSTRUCTION_METHODS[localName];
    }
    return "instantiateUnknown";
  },

  /**
   * Instantiate an XSLT element the engine does not implement (XSLT 1.0
   * section 15): its xsl:fallback children are instantiated in order; without
   * any, the error is reported and nothing is produced.
   *
   * @param {Element} node - The unknown XSLT element
   * @param {XsltContext} context - The current context
   * @param {Node} output - The result node receiving the output
   * @returns {void}
   */
  instantiateUnknown(node, context, output) {
    if (!this.instantiateFallbacks(node, context, output)) {
      console.warn(`Unknown XSLT element: ${xsltLocalName(node)}`);
    }
  },

  /**
   * Instantiate the xsl:fallback children of an element in order.
   *
   * @param {Element} node - An unknown XSLT element or extension element
   * @param {XsltContext} context - The current context
   * @param {Node} output - The result node receiving the output
   * @returns {boolean} Whether the element had any xsl:fallback child
   */
  instantiateFallbacks(node, context, output) {
    const fallbacks = fallbackChildren(node);
    for (const fallback of fallbacks) {
      this.processChildren(fallback, context, output);
    }
    return fallbacks.length > 0;
  },

  /**
   * Register the implementation of an extension element (XSLT 1.0 section
   * 14.1). It is called as `handler(node, context, output, engine)` where
   * an element of that name is instantiated in a namespace declared with
   * `extension-element-prefixes`.
   *
   * @param {string} namespaceUri - The extension namespace
   * @param {string} localName - The element's local name
   * @param {(node: Element, context: XsltContext, output: Node, engine: XsltEngine) => void} handler - The implementation
   * @returns {XsltEngine} This engine, to allow chaining
   *
   * @example
   * engine.registerExtensionElement("urn:my", "log", (node) => console.log(node.textContent));
   */
  registerExtensionElement(namespaceUri, localName, handler) {
    this.extensionElements.set(`{${namespaceUri}}${localName}`, handler);
    return this;
  },

  /**
   * Instantiate an extension element: its registered implementation, else
   * its xsl:fallback children (XSLT 1.0 sections 14.1 and 15); without
   * either, the error is reported once and nothing is produced, as libxslt
   * does. An extension element is never copied to the result.
   *
   * @param {Element} node - The extension element
   * @param {XsltContext} context - The current context
   * @param {Node} output - The result node receiving the output
   * @returns {void}
   */
  instantiateExtension(node, context, output) {
    const name = `{${node.namespaceURI}}${node.localName}`;
    const handler = this.extensionElements.get(name);
    if (handler) {
      handler(node, context, output, this);
      return;
    }
    if (!this.instantiateFallbacks(node, context, output)) {
      this.warnOnce(
        `extension element ${node.nodeName} (${name}) is not supported and has no xsl:fallback`,
      );
    }
  },
};
