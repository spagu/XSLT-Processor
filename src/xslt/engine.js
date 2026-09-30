/**
 * XSLT 1.0 Processing Engine
 * Based on W3C XSLT 1.0 Specification: http://www.w3.org/TR/1999/REC-xslt-19991116
 *
 * Processes XSLT stylesheets and transforms XML documents.
 *
 * XsltEngine is a facade: it owns the engine state and the helpers every
 * part uses (XPath evaluation, XSLT element tests, warnings), while the
 * methods live in modules under ./engine/ by concern and are installed on
 * its prototype (see engine/methods.js):
 *
 * - stylesheetLoading.js: importStylesheet, xsl:import/xsl:include
 * - topLevel.js: dispatch of top-level elements, simplified stylesheets
 * - declarations.js, outputDeclaration.js: top-level declarations
 * - templateRules.js: template registry and matching
 * - templateInvocation.js: apply-templates, apply-imports, call-template
 * - sequenceConstructor.js: instruction dispatch, fallback, extensions
 * - workStack.js: the explicit stack instantiating templates and their
 *   content without deep JavaScript recursion, and the template depth limit
 * - controlFlow.js: if, choose, for-each, sorting
 * - bindings.js: variables and parameters
 * - textInstructions.js, numbering.js: value-of, text, comment, PI,
 *   message, number
 * - nodeConstruction.js, copyInstructions.js: literal result elements,
 *   element, attribute, attribute sets, copy, copy-of
 * - transformation.js: transform entry points and the result tree
 * - functionSupport.js: document(), generate-id() and key() services
 */

import { parse as parseXPath } from "../xpath/parser.js";
import { XPathEvaluator, XPathContext } from "../xpath/evaluator.js";
import { XSLT_NAMESPACE } from "./elements.js";
import { createXsltFunctions } from "./functions.js";
import { KeyIndexRegistry } from "./keys.js";
import { NamespaceAliasMap } from "./literalResult.js";
import { PatternMatcher } from "./patterns.js";
import { installMethods } from "./engine/methods.js";
import {
  createOutputSettings,
  outputDeclarationMethods,
} from "./engine/outputDeclaration.js";
import { stylesheetLoadingMethods } from "./engine/stylesheetLoading.js";
import { topLevelMethods } from "./engine/topLevel.js";
import { declarationMethods } from "./engine/declarations.js";
import { templateRuleMethods } from "./engine/templateRules.js";
import { templateInvocationMethods } from "./engine/templateInvocation.js";
import { sequenceConstructorMethods } from "./engine/sequenceConstructor.js";
import { controlFlowMethods } from "./engine/controlFlow.js";
import { bindingMethods } from "./engine/bindings.js";
import { textInstructionMethods } from "./engine/textInstructions.js";
import { numberingMethods } from "./engine/numbering.js";
import { nodeConstructionMethods } from "./engine/nodeConstruction.js";
import { copyInstructionMethods } from "./engine/copyInstructions.js";
import { transformationMethods } from "./engine/transformation.js";
import { functionSupportMethods } from "./engine/functionSupport.js";
import {
  XSLT_MAX_TEMPLATE_DEPTH,
  workStackMethods,
} from "./engine/workStack.js";

export { XsltContext } from "./engine/context.js";
export { XSLT_MAX_TEMPLATE_DEPTH };

/**
 * Largest node-set a single XPath step may produce inside a transformation.
 *
 * The standalone XPath API keeps its low default (XPathLimits.MAX_RESULT_SIZE)
 * as a guard against untrusted expressions. A stylesheet is trusted program
 * code and commonly walks documents with tens of thousands of nodes, which the
 * native XSLTProcessor handles without any limit, so the engine uses a much
 * higher bound. Override it with the `maxResultSize` engine option.
 */
export const XSLT_MAX_RESULT_SIZE = 5000000;

/**
 * Deepest XPath expression nesting allowed inside a transformation.
 *
 * Like XSLT_MAX_RESULT_SIZE, this is higher than the standalone XPath default
 * (XPathLimits.MAX_RECURSION_DEPTH = 100) because stylesheets are trusted and
 * generated ones often contain long chains such as `a + b + c + ...`.
 * Override it with the `maxRecursionDepth` engine option.
 */
export const XSLT_MAX_EXPRESSION_DEPTH = 1000;

/**
 * XSLT Engine
 */
export class XsltEngine {
  /**
   * @param {object} [options] - Engine options
   * @param {number} [options.maxResultSize] - Largest node-set of one XPath step
   * @param {number} [options.maxRecursionDepth] - Deepest XPath expression nesting
   * @param {number} [options.maxTemplateDepth] - Deepest nesting of template
   *   instantiations (default XSLT_MAX_TEMPLATE_DEPTH, 3000 as in libxslt)
   * @param {boolean} [options.legacyNameTests] - Deprecated: unprefixed name
   *   tests also match nodes in a namespace, as before 1.2.0
   * @param {Function} [options.stylesheetLoader] - Loader for xsl:import/include
   * @param {Function} [options.documentLoader] - Loader for document()
   * @param {string} [options.baseUri] - Base URI of the stylesheet
   * @param {object} [options.domParser] - Parser for loaded XML strings
   * @param {boolean} [options.enableDynamicEvaluate] - Allow EXSLT
   *   `dyn:evaluate()` (off by default: it evaluates XPath built from data)
   * @param {() => Date} [options.clock] - Clock for EXSLT current-time functions
   */
  constructor(options = {}) {
    this.enableDynamicEvaluate = options.enableDynamicEvaluate === true;
    this.clock = options.clock ?? null;
    this.xpathEvaluator = new XPathEvaluator({
      maxResultSize: options.maxResultSize ?? XSLT_MAX_RESULT_SIZE,
      maxRecursionDepth: options.maxRecursionDepth ?? XSLT_MAX_EXPRESSION_DEPTH,
      legacyNameTests: options.legacyNameTests,
    });
    // Template instantiation (see engine/workStack.js)
    this.maxTemplateDepth = options.maxTemplateDepth ?? XSLT_MAX_TEMPLATE_DEPTH;
    this.frames = null;
    this.templateDepth = 0;

    this.templates = [];
    this.keys = {};
    this.globalVariables = {};
    this.globalParameters = {};
    this.outputSettings = createOutputSettings();
    this.namespaces = {};
    this.decimalFormats = {};
    this.stylesheetDoc = null;
    this.attributeSets = {};
    this.namespaceAliases = new NamespaceAliasMap();
    this.stripSpace = [];
    this.preserveSpace = [];

    // Import/Include support
    this.stylesheetLoader = options.stylesheetLoader || null;
    this.currentImportPrecedence = 0;
    // URIs of the stylesheets being loaded, used to detect import cycles
    this.stylesheetStack = [];
    this.baseUri = options.baseUri || "";

    // document() support
    this.documentLoader = options.documentLoader || null;
    this.loadedDocuments = new Map();

    // Parser for XML strings returned by the loaders (see domParsing.js)
    this.domParser = options.domParser ?? null;

    // generate-id() support
    this.generatedIds = new WeakMap();
    this.generatedIdCount = 0;

    // Compiled XSLT patterns (template match, xsl:key, xsl:number)
    this.patternMatcher = new PatternMatcher(this.xpathEvaluator);

    // key() support
    this.rootContext = null;
    this.keyRegistry = new KeyIndexRegistry({
      keys: this.keys,
      matchesPattern: (node, pattern, definition) =>
        this.matchesPattern(
          node,
          pattern,
          this.rootContext,
          definition?.namespaces,
        ),
      evaluateUse: (node, expression, definition) =>
        this.evaluateKeyValues(node, expression, definition?.namespaces),
    });

    // Recoverable errors already reported, so each is reported once
    this.reportedWarnings = new Set();

    // Extension element implementations by expanded name `{uri}local`
    this.extensionElements = new Map();

    this.xpathEvaluator.registerFunctions(createXsltFunctions(this));
  }

  /**
   * Evaluate an XPath expression in an XSLT context.
   *
   * @param {string} expr - The expression
   * @param {XsltContext} context - The current context
   * @returns {*} The value
   */
  evaluateXPath(expr, context) {
    const ast = parseXPath(expr);
    const xpathContext = new XPathContext(
      context.currentNode,
      context.position,
      context.currentNodeList.length,
      context.xpathVariables,
      context.namespaces,
      context,
    );
    return this.xpathEvaluator.evaluate(ast, xpathContext);
  }

  /**
   * Whether a node is in the XSLT namespace (or uses the xsl prefix).
   *
   * @param {Node} node - A stylesheet node
   * @returns {boolean} True for an XSLT element
   */
  isXsltNamespace(node) {
    return (
      node.namespaceURI === XSLT_NAMESPACE ||
      (node.nodeName && node.nodeName.startsWith("xsl:"))
    );
  }

  /**
   * Whether a node is the XSLT element of a local name.
   *
   * @param {Node} node - A stylesheet node
   * @param {string} localName - The XSLT element name, e.g. "template"
   * @returns {boolean} True for that element
   */
  isXsltElement(node, localName) {
    if (node.nodeType !== 1) return false;

    const nodeName = node.localName || node.nodeName;
    return (
      (node.namespaceURI === XSLT_NAMESPACE && nodeName === localName) ||
      node.nodeName === `xsl:${localName}`
    );
  }

  /**
   * Report a recoverable stylesheet error with console.warn, once per engine
   * and message (libxslt reports these errors and goes on).
   *
   * @param {string} message - The error description
   * @returns {void}
   */
  warnOnce(message) {
    if (this.reportedWarnings.has(message)) return;
    this.reportedWarnings.add(message);
    console.warn(`XSLT: ${message}`);
  }
}

installMethods(
  XsltEngine.prototype,
  stylesheetLoadingMethods,
  topLevelMethods,
  declarationMethods,
  outputDeclarationMethods,
  templateRuleMethods,
  templateInvocationMethods,
  sequenceConstructorMethods,
  workStackMethods,
  controlFlowMethods,
  bindingMethods,
  textInstructionMethods,
  numberingMethods,
  nodeConstructionMethods,
  copyInstructionMethods,
  transformationMethods,
  functionSupportMethods,
);
