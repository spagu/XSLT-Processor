/**
 * XSLT 1.0 Processing Engine
 * Based on W3C XSLT 1.0 Specification: http://www.w3.org/TR/1999/REC-xslt-19991116
 *
 * Processes XSLT stylesheets and transforms XML documents.
 */

import { parse as parseXPath } from "../xpath/parser.js";
import { XPathEvaluator, XPathContext } from "../xpath/evaluator.js";
import { XSLT_NAMESPACE } from "./elements.js";
import { createXsltFunctions } from "./functions.js";
import { KeyIndexRegistry } from "./keys.js";
import { countXsltNumber } from "./number.js";
import { formatXsltNumber, toRoman } from "./numberFormat.js";
import { resolveUri, stripFragment } from "./uri.js";
import {
  WhitespaceFilter,
  isXmlWhitespace,
  stripWhitespaceNodes,
} from "./whitespace.js";
import {
  NamespaceAliasMap,
  getXsltAttribute,
  shouldCopyAttribute,
} from "./literalResult.js";
import {
  createResultDocument,
  importResultFragment,
  wrapTextResult,
} from "./resultTree.js";
import { childAxis, isTextContinuation } from "../xpath/axes.js";
import { evaluateAvt } from "./avt.js";
import {
  cloneNode,
  copyAttribute,
  copyOf,
  shallowCopyElement,
} from "./copying.js";
import {
  attributeName,
  copyLiteralNamespaces,
  elementName,
  setResultAttribute,
} from "./resultNamespaces.js";
import { inScopeNamespaces } from "./stylesheetNamespaces.js";
import {
  GlobalBindings,
  createVariableView,
  lookupVariable,
} from "./variables.js";
import { calculatePriority } from "./templatePriority.js";
import { PatternMatcher } from "./patterns.js";
import { sortNodes } from "./sort.js";
import { serializeResult } from "./serializer.js";

const XSLT_NS = XSLT_NAMESPACE;

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
 * Engine method handling each top-level XSLT element (xsl:import is handled
 * first, separately, because imports must precede everything else).
 */
const TOP_LEVEL_HANDLERS = Object.freeze({
  template: "registerTemplate",
  output: "processOutput",
  variable: "processGlobalVariable",
  param: "processGlobalParam",
  key: "processKey",
  "decimal-format": "processDecimalFormat",
  "namespace-alias": "processNamespaceAlias",
  "attribute-set": "processAttributeSet",
  "strip-space": "processStripSpace",
  "preserve-space": "processPreserveSpace",
  include: "processInclude",
});

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

  setVariable(name, value) {
    this.variables[name] = value;
  }
}

/**
 * Turn a JavaScript stack overflow into a clear transformation error; any
 * other error is returned unchanged.
 *
 * @param {Error} error - The error thrown by a transformation
 * @returns {Error} The error to report
 */
function recursionError(error) {
  const isStackOverflow =
    (error instanceof RangeError && /call stack/i.test(error.message)) ||
    // Firefox reports "InternalError: too much recursion"
    (error?.name === "InternalError" && /recursion/i.test(error.message));
  if (!isStackOverflow) return error;

  return new Error(
    "Template recursion too deep: the transformation exceeded the JavaScript " +
      "call stack (infinite recursion, or recursion deeper than the runtime allows)",
    { cause: error },
  );
}

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

/**
 * XSLT Engine
 */
export class XsltEngine {
  constructor(options = {}) {
    this.xpathEvaluator = new XPathEvaluator({
      maxResultSize: options.maxResultSize ?? XSLT_MAX_RESULT_SIZE,
      maxRecursionDepth: options.maxRecursionDepth ?? XSLT_MAX_EXPRESSION_DEPTH,
    });
    this.templates = [];
    this.keys = {};
    this.globalVariables = {};
    this.globalParameters = {};
    // A null method means "not declared": the serializer then picks html or
    // xml from the result tree (XSLT 1.0 section 16).
    this.outputSettings = {
      method: null,
      version: "1.0",
      encoding: "UTF-8",
      standalone: null,
      indent: "no",
      omitXmlDeclaration: "no",
      doctypePublic: null,
      doctypeSystem: null,
      mediaType: null,
      cdataSectionElements: [],
    };
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

    // Whether the "attribute after children" warning was already given
    this.warnedLateAttribute = false;

    this.xpathEvaluator.registerFunctions(createXsltFunctions(this));
  }

  /**
   * Set the loader used by the XSLT `document()` function.
   *
   * The loader is synchronous and must return a `Document`, an XML string or
   * null. Returning null (or configuring no loader at all) makes `document()`
   * evaluate to an empty node-set instead of failing the transformation.
   *
   * @param {((uri: string, baseUri?: string) => (Document|string|null))|null} loader - The loader, or null to remove it
   * @returns {XsltEngine} This engine, to allow chaining
   *
   * @example
   * engine.setDocumentLoader((uri) => readFileSync(uri, 'utf8'));
   */
  setDocumentLoader(loader) {
    this.documentLoader = loader ?? null;
    this.loadedDocuments.clear();
    return this;
  }

  /**
   * Load an external document for the `document()` function.
   *
   * Results are cached per resolved URI for the life of the engine, so the same
   * URI always yields the identical node-set.
   *
   * @param {string} uri - The requested URI, fragment identifiers are ignored
   * @param {string} [baseUri] - Base URI used to resolve relative references
   * @returns {Document|null} The loaded document, or null when unavailable
   *
   * @example
   * engine.loadDocument('data.xml', '/styles/main.xsl');
   */
  loadDocument(uri, baseUri) {
    const target = stripFragment(uri);

    if (target === "") return this.stylesheetDoc;
    if (!this.documentLoader) return null;

    const resolved = resolveUri(target, baseUri);
    if (this.loadedDocuments.has(resolved)) {
      return this.loadedDocuments.get(resolved);
    }

    const loaded = this.documentLoader(resolved, baseUri);
    const doc =
      typeof loaded === "string" ? this.parseXmlString(loaded) : loaded || null;

    this.loadedDocuments.set(resolved, doc);
    return doc;
  }

  /**
   * Return the stable identifier of a node for `generate-id()`.
   *
   * @param {Node} node - The node to identify
   * @returns {string} An identifier starting with a letter
   *
   * @example
   * engine.generateId(element); // 'N1'
   */
  generateId(node) {
    let id = this.generatedIds.get(node);
    if (!id) {
      this.generatedIdCount++;
      id = `N${this.generatedIdCount}`;
      this.generatedIds.set(node, id);
    }
    return id;
  }

  /**
   * Evaluate the `use` expression of an `xsl:key` for one node.
   *
   * @param {Node} node - The node being indexed
   * @param {string} expression - The `use` expression
   * @param {Object<string, string>} [namespaces] - Prefixes in scope on the xsl:key
   * @returns {string[]} The key values contributed by the node
   */
  evaluateKeyValues(node, expression, namespaces) {
    const context = this.rootContext.clone({
      currentNode: node,
      currentNodeList: [node],
      position: 1,
    });
    if (namespaces) context.namespaces = namespaces;
    const value = this.evaluateXPath(expression, context);

    if (Array.isArray(value)) {
      return value.map((item) => this.xpathEvaluator.getStringValue(item));
    }
    return [this.xpathEvaluator.toString(value)];
  }

  /**
   * Set the stylesheet loader function for xsl:import and xsl:include
   * @param {Function} loader - Function(href, baseUri) => Document or string (XML)
   */
  setStylesheetLoader(loader) {
    this.stylesheetLoader = loader;
  }

  /**
   * Resolve a relative URI against a base URI
   *
   * @param {string} href - The URI to resolve
   * @param {string} [baseUri] - The base URI
   * @returns {string} The resolved URI
   */
  resolveUri(href, baseUri) {
    return resolveUri(href, baseUri);
  }

  /**
   * Load an external stylesheet document
   */
  loadStylesheet(href, baseUri) {
    if (!this.stylesheetLoader) {
      throw new Error(
        `Cannot load stylesheet "${href}": no stylesheetLoader configured. ` +
          "Use engine.setStylesheetLoader(fn) to provide a loader function.",
      );
    }

    const resolvedUri = this.resolveUri(href, baseUri);
    const result = this.stylesheetLoader(resolvedUri, baseUri);

    // If result is a string, it needs to be parsed (caller should handle this)
    return { document: result, uri: resolvedUri };
  }

  /**
   * Parse XML string to document (helper for stylesheet loading)
   */
  parseXmlString(xmlString) {
    if (typeof DOMParser !== "undefined") {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlString, "application/xml");
      const parseError = doc.querySelector("parsererror");
      if (parseError) {
        throw new Error(`XML parse error: ${parseError.textContent}`);
      }
      return doc;
    }
    throw new Error("XML parsing not available in this environment");
  }

  /**
   * Import and compile an XSLT stylesheet
   * @param {Document|Element} stylesheetNode - The stylesheet document or root element
   * @param {string} [stylesheetUri] - Optional URI of the stylesheet for resolving imports
   */
  importStylesheet(stylesheetNode, stylesheetUri) {
    const isMainStylesheet = this.stylesheetDoc === null;

    if (isMainStylesheet) {
      this.stylesheetDoc = stylesheetNode.ownerDocument || stylesheetNode;
      if (stylesheetUri) this.baseUri = stylesheetUri;
      if (this.baseUri) this.stylesheetStack.push(this.baseUri);
    }

    const root = stylesheetNode.documentElement || stylesheetNode;

    // Validate stylesheet
    if (
      !this.isXsltElement(root, "stylesheet") &&
      !this.isXsltElement(root, "transform")
    ) {
      // Check for literal result element (simplified stylesheet)
      if (root.getAttribute && root.getAttribute("xsl:version")) {
        this.processLiteralResultStylesheet(root);
        return;
      }
      throw new Error(
        "Invalid XSLT stylesheet: root element must be xsl:stylesheet or xsl:transform",
      );
    }

    this.processTopLevelElements(root, stylesheetUri || this.baseUri);

    // Increment import precedence after processing this stylesheet
    if (isMainStylesheet) {
      this.currentImportPrecedence++;
    }
  }

  /**
   * Process an xsl:include element: the included stylesheet is merged at the
   * import precedence of the including stylesheet.
   *
   * @param {Element} node - The xsl:include element
   * @param {string} baseUri - URI of the including stylesheet
   * @returns {void}
   */
  processInclude(node, baseUri) {
    const savedPrecedence = this.currentImportPrecedence;
    this.loadStylesheetModule(node, baseUri, "include");
    this.currentImportPrecedence = savedPrecedence;
  }

  /**
   * Process an xsl:import element: the imported stylesheet gets a lower import
   * precedence than everything processed after it.
   *
   * @param {Element} node - The xsl:import element
   * @param {string} baseUri - URI of the importing stylesheet
   * @returns {void}
   */
  processImport(node, baseUri) {
    this.loadStylesheetModule(node, baseUri, "import");
    this.currentImportPrecedence++;
  }

  /**
   * Load and process the stylesheet referenced by xsl:import or xsl:include.
   *
   * Only a stylesheet that (directly or indirectly) references itself is an
   * error; the same stylesheet may be reached through several branches of the
   * import tree ("diamond" imports), as in libxslt.
   *
   * @param {Element} node - The xsl:import or xsl:include element
   * @param {string} baseUri - URI of the referencing stylesheet
   * @param {"import"|"include"} kind - The referencing instruction
   * @returns {void}
   * @throws {Error} When href is missing, loading fails or a cycle is found
   */
  loadStylesheetModule(node, baseUri, kind) {
    const href = node.getAttribute("href");
    if (!href) {
      throw new Error(`xsl:${kind} requires an href attribute`);
    }

    const resolvedUri = this.resolveUri(href, baseUri);
    if (this.stylesheetStack.includes(resolvedUri)) {
      throw new Error(`Circular stylesheet reference detected: ${resolvedUri}`);
    }

    this.stylesheetStack.push(resolvedUri);
    try {
      const { document: loaded } = this.loadStylesheet(href, baseUri);
      const doc =
        typeof loaded === "string" ? this.parseXmlString(loaded) : loaded;
      this.processIncludedStylesheet(doc, resolvedUri);
    } catch (error) {
      throw new Error(
        `Failed to ${kind} stylesheet "${href}": ${error.message}`,
        { cause: error },
      );
    } finally {
      this.stylesheetStack.pop();
    }
  }

  /**
   * Process an included/imported stylesheet document
   */
  processIncludedStylesheet(stylesheetDoc, stylesheetUri) {
    const root = stylesheetDoc.documentElement || stylesheetDoc;

    // Validate stylesheet
    if (
      !this.isXsltElement(root, "stylesheet") &&
      !this.isXsltElement(root, "transform")
    ) {
      throw new Error(
        "Included/imported document is not a valid XSLT stylesheet",
      );
    }

    this.processTopLevelElements(root, stylesheetUri);
  }

  /**
   * Process the top-level elements of a stylesheet module.
   *
   * xsl:import elements are processed first, so imported declarations get a
   * lower import precedence than the ones of the importing stylesheet.
   *
   * @param {Element} root - The xsl:stylesheet element
   * @param {string} stylesheetUri - URI used to resolve imports and includes
   * @returns {void}
   */
  processTopLevelElements(root, stylesheetUri) {
    this.collectNamespaces(root);

    const imports = [];
    const otherElements = [];

    for (const child of root.childNodes) {
      if (child.nodeType !== 1) continue;

      if (this.isXsltElement(child, "import")) {
        imports.push(child);
      } else {
        otherElements.push(child);
      }
    }

    for (const importNode of imports) {
      this.processImport(importNode, stylesheetUri);
    }

    for (const child of otherElements) {
      const method = this.isXsltNamespace(child)
        ? TOP_LEVEL_HANDLERS[child.localName]
        : undefined;
      if (method) this[method](child, stylesheetUri);
    }
  }

  /**
   * Register a simplified stylesheet (XSLT 1.0 section 2.3): the literal result
   * root element is the body of a template rule matching "/", so the root
   * element itself is instantiated, not only its children.
   *
   * @param {Element} root - The literal result root element
   * @returns {void}
   */
  processLiteralResultStylesheet(root) {
    this.collectNamespaces(root);
    this.templates.push({
      match: "/",
      name: null,
      mode: null,
      priority: 0.5,
      importPrecedence: this.currentImportPrecedence,
      namespaces: inScopeNamespaces(root),
      node: { firstChild: root, childNodes: [root] },
    });
  }

  /**
   * Record the namespace declarations of a stylesheet document element in
   * the stylesheet-wide fallback table. Instructions resolve prefixes against
   * their own in-scope namespaces; this table only serves contexts without a
   * stylesheet element. The first binding of a prefix wins, so a module
   * loaded later cannot rebind the main stylesheet's prefixes.
   *
   * @param {Element} node - The stylesheet element
   * @returns {void}
   */
  collectNamespaces(node) {
    if (!node.attributes) return;

    for (const attr of node.attributes) {
      let prefix = null;
      if (attr.name.startsWith("xmlns:")) prefix = attr.name.substring(6);
      else if (attr.name === "xmlns") prefix = "";

      if (prefix !== null && attr.value !== XSLT_NS) {
        this.namespaces[prefix] ??= attr.value;
      }
    }
  }

  /**
   * Register a template rule.
   *
   * A union match pattern is equivalent to a set of template rules, one per
   * alternative (XSLT 1.0 section 5.5), so each alternative is registered
   * separately with its own default priority.
   *
   * @param {Element} node - The xsl:template element
   */
  registerTemplate(node) {
    const match = node.getAttribute("match");
    const name = node.getAttribute("name");
    const mode = node.getAttribute("mode") || null;
    const priorityAttr = node.getAttribute("priority");
    const alternatives = match
      ? this.splitUnionPattern(match).map((p) => p.trim())
      : [null];

    const namespaces = inScopeNamespaces(node);
    for (const alternative of alternatives) {
      this.templates.push({
        match: alternative,
        name,
        mode,
        namespaces,
        priority: priorityAttr
          ? parseFloat(priorityAttr)
          : this.calculatePriority(alternative),
        importPrecedence: this.currentImportPrecedence,
        node,
      });
    }
  }

  /**
   * Default priority of a single match pattern (see templatePriority.js).
   *
   * @param {string|null} matchPattern - The match pattern
   * @returns {number} The default priority
   */
  calculatePriority(matchPattern) {
    return calculatePriority(matchPattern ? matchPattern.trim() : matchPattern);
  }

  processOutput(node) {
    const method = node.getAttribute("method");
    if (method) this.outputSettings.method = method;

    const version = node.getAttribute("version");
    if (version) this.outputSettings.version = version;

    const encoding = node.getAttribute("encoding");
    if (encoding) this.outputSettings.encoding = encoding;

    const standalone = node.getAttribute("standalone");
    if (standalone) this.outputSettings.standalone = standalone;

    const indent = node.getAttribute("indent");
    if (indent) this.outputSettings.indent = indent;

    const omit = node.getAttribute("omit-xml-declaration");
    if (omit) this.outputSettings.omitXmlDeclaration = omit;

    const doctypePublic = node.getAttribute("doctype-public");
    if (doctypePublic) this.outputSettings.doctypePublic = doctypePublic;

    const doctypeSystem = node.getAttribute("doctype-system");
    if (doctypeSystem) this.outputSettings.doctypeSystem = doctypeSystem;

    const mediaType = node.getAttribute("media-type");
    if (mediaType) this.outputSettings.mediaType = mediaType;

    const cdataElements = node.getAttribute("cdata-section-elements");
    if (cdataElements) {
      this.outputSettings.cdataSectionElements = cdataElements
        .split(/\s+/)
        .filter(Boolean);
    }
  }

  processGlobalVariable(node) {
    const name = node.getAttribute("name");
    const select = node.getAttribute("select");

    this.globalVariables[name] = { node, select };
  }

  /**
   * Register an `xsl:param` top level declaration.
   *
   * A value supplied from outside (through `setParameter`) has precedence over
   * the declared default, so it survives compilation of the stylesheet.
   *
   * @param {Element} node - The `xsl:param` element
   * @returns {void}
   */
  processGlobalParam(node) {
    const name = node.getAttribute("name");
    const select = node.getAttribute("select");
    const existing = this.globalParameters[name];
    const definition = { node, select };

    if (existing && "value" in existing) {
      definition.value = existing.value;
    }

    this.globalParameters[name] = definition;
  }

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
  }

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
  }

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
  }

  /**
   * Register an xsl:key declaration. Declarations sharing a name all
   * contribute to the same key (XSLT 1.0 section 12.2); a declaration seen
   * again through another import branch is only kept once.
   *
   * @param {Element} node - The xsl:key element
   * @returns {void}
   */
  processKey(node) {
    const name = node.getAttribute("name");
    const match = node.getAttribute("match");
    const use = node.getAttribute("use");
    const definitions = (this.keys[name] ??= []);

    if (!definitions.some((d) => d.match === match && d.use === use)) {
      definitions.push({ match, use, namespaces: inScopeNamespaces(node) });
    }
    this.keyRegistry.clear();
  }

  processDecimalFormat(node) {
    const name = node.getAttribute("name") || "";

    this.decimalFormats[name] = {
      decimalSeparator: node.getAttribute("decimal-separator") || ".",
      groupingSeparator: node.getAttribute("grouping-separator") || ",",
      percent: node.getAttribute("percent") || "%",
      perMille: node.getAttribute("per-mille") || "\u2030",
      zeroDigit: node.getAttribute("zero-digit") || "0",
      digit: node.getAttribute("digit") || "#",
      patternSeparator: node.getAttribute("pattern-separator") || ";",
      infinity: node.getAttribute("infinity") || "Infinity",
      nan: node.getAttribute("NaN") || "NaN",
      minusSign: node.getAttribute("minus-sign") || "-",
    };
  }

  processNamespaceAlias(node) {
    this.namespaceAliases.add(node);
  }

  processAttributeSet(node) {
    const name = node.getAttribute("name");
    const useAttributeSets = node.getAttribute("use-attribute-sets");

    this.attributeSets[name] = {
      node,
      useAttributeSets: useAttributeSets
        ? useAttributeSets.split(/\s+/).filter(Boolean)
        : [],
    };
  }

  processStripSpace(node) {
    const elements = node.getAttribute("elements");
    if (elements) {
      this.stripSpace.push(...elements.split(/\s+/).filter(Boolean));
    }
  }

  processPreserveSpace(node) {
    const elements = node.getAttribute("elements");
    if (elements) {
      this.preserveSpace.push(...elements.split(/\s+/).filter(Boolean));
    }
  }

  /**
   * Transform a source document
   */
  transform(sourceNode, ownerDocument) {
    const doc =
      ownerDocument || (typeof document !== "undefined" ? document : null);

    if (!doc) {
      throw new Error("No output document available");
    }

    // Build the result tree in a neutral XML document: creating nodes directly
    // in an HTML owner document would lower case names and force the XHTML
    // namespace on every element.
    const resultDocument = createResultDocument(doc);
    const source = this.initialNode(this.prepareSource(sourceNode, doc));

    // Create context - use document node as initial context for "/" template matching
    // XPath paths like "RootElement/child" expect to start from document node
    const context = new XsltContext({
      currentNode: source,
      currentNodeList: [source],
      position: 1,
      outputDocument: resultDocument,
      stylesheet: this.stylesheetDoc,
      namespaces: this.namespaces,
      templates: this.templates,
      keys: this.keys,
      decimalFormats: this.decimalFormats,
      outputMethod: this.outputSettings.method,
      xpathEvaluator: this.xpathEvaluator,
    });

    this.rootContext = context;
    // The source tree may have changed since the previous transformation
    this.keyRegistry.clear();
    this.patternMatcher.reset();

    // Create result document fragment
    const fragment = resultDocument.createDocumentFragment();

    try {
      context.globals = this.createGlobals(context);
      context.globals.evaluateAll();

      // Apply templates to document node (not documentElement)
      // This ensures "/" template has document as context, so paths like
      // "RootElement/child" work correctly
      this.applyTemplates([source], null, context, fragment);
    } catch (error) {
      throw recursionError(error);
    }

    return importResultFragment(fragment, doc);
  }

  /**
   * Declare the global variables and parameters of the stylesheet for one
   * transformation. They are evaluated lazily with the root node as context
   * node (XSLT 1.0 section 11.4), so they may refer to each other in any
   * order; a variable wins over a parameter of the same name.
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
      globals.define(name, def);
    }
    return globals;
  }

  /**
   * Choose the node the transformation starts from.
   *
   * A document element is transformed through its document, so that the "/"
   * template rule applies as for a whole document (as browsers do); any other
   * node is transformed as is.
   *
   * @param {Node} source - The (prepared) source node
   * @returns {Node} The initial context node
   */
  initialNode(source) {
    const owner = source.ownerDocument;
    return source.nodeType === 1 && owner?.documentElement === source
      ? owner
      : source;
  }

  /**
   * Apply `xsl:strip-space` to the source tree.
   *
   * Stripping produces a copy so the caller's document is never modified; when
   * no `xsl:strip-space` is declared the original node is used unchanged.
   *
   * @param {Node} sourceNode - The source document or element
   * @param {Document} ownerDocument - Document providing the DOM implementation
   * @returns {Node} The source to transform
   */
  prepareSource(sourceNode, ownerDocument) {
    const filter = new WhitespaceFilter(this.stripSpace, this.preserveSpace);
    if (!filter.isActive()) return sourceNode;

    return stripWhitespaceNodes(
      sourceNode,
      filter,
      createResultDocument(ownerDocument),
    );
  }

  /**
   * Transform to a complete document
   */
  /**
   * Transform to a complete document.
   *
   * With `xsl:output method="text"` the result is not a tree, so it is
   * returned the way Chrome's XSLTProcessor does: as an XHTML page holding
   * the text in a `pre` element (see wrapTextResult).
   *
   * @param {Node} sourceNode - Source document or element to transform
   * @returns {Document} The result document
   */
  transformToDocument(sourceNode) {
    // For Node.js environments, we need a document implementation
    const doc = this.createDocument(sourceNode);
    const fragment = this.transform(sourceNode, doc);

    if (this.outputSettings.method === "text") {
      return wrapTextResult(doc, fragment.textContent);
    }

    // Move fragment contents to document
    while (fragment.firstChild) {
      doc.appendChild(fragment.firstChild);
    }

    return doc;
  }

  /**
   * Transform a source document and serialize the result to a string.
   *
   * Non-W3C convenience method: the result tree is serialized honoring the
   * `xsl:output` settings of the stylesheet (XSLT 1.0 section 16).
   *
   * @param {Node} sourceNode - Source document or element to transform
   * @returns {string} The serialized transformation result
   */
  transformToString(sourceNode) {
    const fragment = this.transform(
      sourceNode,
      this.createDocument(sourceNode),
    );
    return serializeResult(fragment, this.outputSettings);
  }

  /**
   * Create an empty XML document to hold a transformation result.
   *
   * Uses the global `document` when running in a browser and otherwise falls
   * back to the DOM implementation owning `referenceNode` (e.g. a jsdom or
   * xmldom document in Node.js).
   *
   * @param {Node} [referenceNode] - Any node whose DOM implementation can be reused
   * @returns {Document} A new empty document
   * @throws {Error} When no DOM implementation is available
   */
  createDocument(referenceNode) {
    if (typeof document !== "undefined") {
      return document.implementation.createDocument(null, null, null);
    }

    const ownerDocument =
      referenceNode &&
      (referenceNode.nodeType === 9
        ? referenceNode
        : referenceNode.ownerDocument);
    if (ownerDocument?.implementation) {
      return ownerDocument.implementation.createDocument(null, null, null);
    }

    throw new Error("Document creation not available in this environment");
  }

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

    // If no select, evaluate content as result tree fragment
    const fragment = context.outputDocument.createDocumentFragment();
    this.processChildren(def.node, context, fragment);
    return fragment;
  }

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
        // Built-in templates
        this.applyBuiltinTemplate(node, mode, context, output, params);
      }
    }
  }

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
  }

  /**
   * Find the best matching template for a node
   */
  findMatchingTemplate(node, mode, context, maxImportPrecedence = Infinity) {
    let bestMatch = null;
    let bestPriority = -Infinity;
    let bestImportPrecedence = -Infinity;

    for (const template of this.templates) {
      if (template.mode !== mode) continue;
      if (!template.match) continue;
      if ((template.importPrecedence || 0) >= maxImportPrecedence) continue;

      if (
        this.matchesPattern(node, template.match, context, template.namespaces)
      ) {
        const priority = template.priority;
        const importPrecedence = template.importPrecedence || 0;

        // On equal precedence and priority the last template in stylesheet
        // order wins (the XSLT 1.0 section 5.5 recovery, as in libxslt)
        if (
          importPrecedence > bestImportPrecedence ||
          (importPrecedence === bestImportPrecedence &&
            priority >= bestPriority)
        ) {
          bestMatch = template;
          bestPriority = priority;
          bestImportPrecedence = importPrecedence;
        }
      }
    }

    return bestMatch;
  }

  /**
   * Check whether a node matches an XSLT pattern (see patterns.js).
   *
   * Errors raised while evaluating a predicate make the pattern not match,
   * as before the compiled matcher existed.
   *
   * @param {Node} node - The candidate node
   * @param {string} pattern - The XSLT pattern
   * @param {XsltContext|null} context - Context supplying variables and namespaces
   * @param {Object<string, string>} [namespaces] - Prefixes in scope on the
   *   element holding the pattern, when they differ from the context's
   * @returns {boolean} Whether the node matches
   */
  matchesPattern(node, pattern, context, namespaces) {
    try {
      return this.patternMatcher.matches(node, pattern, context, namespaces);
    } catch {
      return false;
    }
  }

  splitUnionPattern(pattern) {
    // Simple split on | not inside predicates or strings
    const parts = [];
    let current = "";
    let depth = 0;
    let inString = false;
    let stringChar = "";

    for (let i = 0; i < pattern.length; i++) {
      const char = pattern[i];

      if (inString) {
        current += char;
        if (char === stringChar) {
          inString = false;
        }
      } else if (char === '"' || char === "'") {
        inString = true;
        stringChar = char;
        current += char;
      } else if (char === "[") {
        depth++;
        current += char;
      } else if (char === "]") {
        depth--;
        current += char;
      } else if (char === "|" && depth === 0) {
        parts.push(current);
        current = "";
      } else {
        current += char;
      }
    }

    if (current) {
      parts.push(current);
    }

    return parts;
  }

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
  }

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
  }

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
  }

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
  }

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
  }

  shouldPreserveSpace(node) {
    // Check xml:space attribute on ancestors
    let current = node.parentNode;
    while (current && current.nodeType === 1) {
      const space = current.getAttribute("xml:space");
      if (space === "preserve") return true;
      if (space === "default") return false;
      current = current.parentNode;
    }
    return false;
  }

  /**
   * Name of the engine method instantiating a stylesheet element: the
   * handler of an XSLT instruction, or processLiteralResultElement. Returns
   * null for elements that are not instructions (xsl:param, xsl:sort,
   * xsl:with-param, xsl:fallback) and, with a warning, for unknown ones.
   *
   * @param {Element} node - A stylesheet element in a sequence constructor
   * @returns {string|null} The method name
   */
  instructionMethod(node) {
    if (!this.isXsltNamespace(node)) return "processLiteralResultElement";

    const localName = node.localName || node.nodeName.replace(/^xsl:/, "");
    if (Object.hasOwn(INSTRUCTION_METHODS, localName)) {
      return INSTRUCTION_METHODS[localName];
    }
    console.warn(`Unknown XSLT element: ${localName}`);
    return null;
  }

  /**
   * Process a literal result element (non-XSLT)
   *
   * Applies `xsl:namespace-alias` to the element and its attributes, honours
   * `xsl:use-attribute-sets` and keeps XSLT-only attributes and namespace
   * declarations out of the result tree.
   *
   * @param {Element} node - The literal result element in the stylesheet
   * @param {XsltContext} context - The current XSLT context
   * @param {Node} output - The result tree node receiving the element
   * @returns {void}
   */
  /**
   * Copy one attribute of a literal result element to the result, evaluating
   * it as an attribute value template and applying xsl:namespace-alias.
   *
   * @param {Attr} attr - Attribute of the literal result element
   * @param {XsltContext} context - The current XSLT context
   * @param {Element} outputElement - The result element
   * @returns {void}
   */
  copyLiteralAttribute(attr, context, outputElement) {
    const value = this.processAttributeValueTemplate(attr.value, context);
    const alias = this.namespaceAliases.resolve(
      attr.namespaceURI,
      attr.localName || attr.name,
    );

    if (alias) {
      outputElement.setAttributeNS(alias.namespaceUri, alias.qname, value);
    } else if (attr.namespaceURI) {
      outputElement.setAttributeNS(attr.namespaceURI, attr.name, value);
    } else {
      outputElement.setAttribute(attr.name, value);
    }
  }

  processLiteralResultElement(node, context, output) {
    const localName = node.localName || node.nodeName;
    const alias = this.namespaceAliases.resolve(node.namespaceURI, localName);
    const namespaceUri = alias ? alias.namespaceUri : node.namespaceURI;
    const qname = alias ? alias.qname : node.nodeName;

    const outputElement =
      namespaceUri && context.outputDocument.createElementNS
        ? context.outputDocument.createElementNS(namespaceUri, qname)
        : context.outputDocument.createElement(qname);
    // Attached first, so namespace lookups see the result ancestors
    output.appendChild(outputElement);
    copyLiteralNamespaces(outputElement, node, output, (uri) =>
      this.namespaceAliases.isAliased(uri),
    );

    // Attribute sets come first so literal attributes take precedence
    const useAttributeSets = getXsltAttribute(
      node,
      "use-attribute-sets",
      XSLT_NS,
    );
    if (useAttributeSets) {
      this.applyAttributeSets(useAttributeSets, context, outputElement);
    }

    for (const attr of node.attributes) {
      if (shouldCopyAttribute(attr, XSLT_NS)) {
        this.copyLiteralAttribute(attr, context, outputElement);
      }
    }

    // Process children
    this.processChildren(node, context, outputElement);
  }

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
  }

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
  }

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
  }

  /**
   * Whether an attribute may still be added to a result node: it must be an
   * element without children. Attributes added after children are ignored
   * (as libxslt does), with a single warning per engine.
   *
   * @param {Node} target - The result node
   * @returns {boolean} True when the attribute can be added
   */
  canAddAttribute(target) {
    if (target.nodeType !== 1) return false;
    if (!target.firstChild) return true;
    if (!this.warnedLateAttribute) {
      this.warnedLateAttribute = true;
      console.warn(
        "XSLT: an attribute created after the children of an element is ignored (XSLT 1.0 section 7.1.3)",
      );
    }
    return false;
  }

  // XSLT Instructions
  xslApplyTemplates(node, context, output) {
    const select = node.getAttribute("select") || "node()";
    const mode = node.getAttribute("mode") || null;

    // Evaluate select expression
    let nodes = this.evaluateXPath(select, context);
    if (!Array.isArray(nodes)) {
      nodes = nodes ? [nodes] : [];
    }

    nodes = this.sortNodes(nodes, this.sortElementsOf(node), context);

    const params = this.withParams(node, context);
    this.applyTemplates(nodes, mode, context, output, params);
  }

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
  }

  /**
   * Find the named template with the highest import precedence; among equal
   * precedences the last one in stylesheet order wins.
   *
   * @param {string} name - The template name
   * @returns {object|null} The template, or null when none has that name
   */
  findNamedTemplate(name) {
    let best = null;
    for (const template of this.templates) {
      if (
        template.name === name &&
        (!best ||
          (template.importPrecedence || 0) >= (best.importPrecedence || 0))
      ) {
        best = template;
      }
    }
    return best;
  }

  xslCallTemplate(node, context, output) {
    const name = node.getAttribute("name");
    const template = this.findNamedTemplate(name);
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
  }

  xslValueOf(node, context, output) {
    const select = node.getAttribute("select");
    const disableOutputEscaping =
      node.getAttribute("disable-output-escaping") === "yes";

    const result = this.evaluateXPath(select, context);
    const text = this.xpathEvaluator.toString(result);

    if (text) {
      const textNode = context.outputDocument.createTextNode(text);
      if (disableOutputEscaping) {
        textNode._disableOutputEscaping = true;
      }
      output.appendChild(textNode);
    }
  }

  xslText(node, context, output) {
    const disableOutputEscaping =
      node.getAttribute("disable-output-escaping") === "yes";
    let text = "";

    for (const child of node.childNodes) {
      if (child.nodeType === 3 || child.nodeType === 4) {
        text += child.nodeValue || "";
      }
    }

    if (text) {
      const textNode = context.outputDocument.createTextNode(text);
      if (disableOutputEscaping) {
        textNode._disableOutputEscaping = true;
      }
      output.appendChild(textNode);
    }
  }

  /**
   * Instantiate `xsl:element`. The name's prefix, or the default namespace
   * for an unprefixed name, resolves against the namespaces in scope on the
   * instruction; a `namespace` attribute wins (XSLT 1.0 section 7.1.2).
   *
   * @param {Element} node - The xsl:element instruction
   * @param {XsltContext} context - The current context
   * @param {Node} output - The result node receiving the element
   * @returns {void}
   */
  xslElement(node, context, output) {
    const { namespaceUri, qname } = elementName(
      this.processAttributeValueTemplate(node.getAttribute("name"), context),
      this.optionalAvt(node, "namespace", context),
      context.namespaces,
    );
    const element = namespaceUri
      ? context.outputDocument.createElementNS(namespaceUri, qname)
      : context.outputDocument.createElement(qname);
    output.appendChild(element);

    const useAttributeSets = node.getAttribute("use-attribute-sets");
    if (useAttributeSets) {
      this.applyAttributeSets(useAttributeSets, context, element);
    }

    this.processChildren(node, context, element);
  }

  /**
   * Instantiate `xsl:attribute` (XSLT 1.0 section 7.1.3): a prefixed name
   * uses the namespace bound in scope, `namespace` wins, and a namespaced
   * attribute without a usable prefix gets a generated one.
   *
   * @param {Element} node - The xsl:attribute instruction
   * @param {XsltContext} context - The current context
   * @param {Node} output - The result element receiving the attribute
   * @returns {void}
   */
  xslAttribute(node, context, output) {
    if (!this.canAddAttribute(output)) return;

    const name = attributeName(
      this.processAttributeValueTemplate(node.getAttribute("name"), context),
      this.optionalAvt(node, "namespace", context),
      context.namespaces,
    );
    setResultAttribute(output, name, this.instantiateText(node, context));
  }

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
  }

  xslIf(node, context, output) {
    const test = node.getAttribute("test");
    const result = this.evaluateXPath(test, context);

    if (this.xpathEvaluator.toBoolean(result)) {
      this.processChildren(node, context, output);
    }
  }

  xslChoose(node, context, output) {
    for (const child of node.childNodes) {
      if (child.nodeType !== 1) continue;

      if (this.isXsltElement(child, "when")) {
        const test = child.getAttribute("test");
        const result = this.evaluateXPath(test, context);

        if (this.xpathEvaluator.toBoolean(result)) {
          this.processChildren(child, context, output);
          return;
        }
      } else if (this.isXsltElement(child, "otherwise")) {
        this.processChildren(child, context, output);
        return;
      }
    }
  }

  xslForEach(node, context, output) {
    const select = node.getAttribute("select");

    let nodes = this.evaluateXPath(select, context);
    if (!Array.isArray(nodes)) {
      nodes = nodes ? [nodes] : [];
    }

    nodes = this.sortNodes(nodes, this.sortElementsOf(node), context);

    // Process each node
    for (let i = 0; i < nodes.length; i++) {
      const newContext = context.clone({
        currentNode: nodes[i],
        currentNodeList: nodes,
        position: i + 1,
      });

      this.processChildren(node, newContext, output);
    }
  }

  xslCopy(node, context, output) {
    const currentNode = context.currentNode;
    const useAttributeSets = node.getAttribute("use-attribute-sets");

    switch (currentNode.nodeType) {
      case 1: {
        // Element, with its namespace declarations (XSLT 1.0 section 7.5)
        const copy = shallowCopyElement(currentNode, context.outputDocument);
        output.appendChild(copy);

        if (useAttributeSets) {
          this.applyAttributeSets(useAttributeSets, context, copy);
        }

        this.processChildren(node, context, copy);
        break;
      }

      case 2: // Attribute
        copyAttribute(currentNode, output, (target) =>
          this.canAddAttribute(target),
        );
        break;

      case 3: // Text
      case 4: {
        // CDATA; a text node stands for its whole text run
        const textCopy = context.outputDocument.createTextNode(
          this.xpathEvaluator.getStringValue(currentNode),
        );
        output.appendChild(textCopy);
        break;
      }

      case 7: {
        // Processing Instruction
        const piCopy = context.outputDocument.createProcessingInstruction(
          currentNode.target,
          currentNode.data,
        );
        output.appendChild(piCopy);
        break;
      }

      case 8: {
        // Comment
        const commentCopy = context.outputDocument.createComment(
          currentNode.nodeValue || "",
        );
        output.appendChild(commentCopy);
        break;
      }

      case 9: // Document
      case 11: // Document Fragment
        this.processChildren(node, context, output);
        break;
    }
  }

  xslCopyOf(node, context, output) {
    const select = node.getAttribute("select");
    const result = this.evaluateXPath(select, context);

    this.copyToOutput(result, context, output);
  }

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
  }

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
  }

  xslVariable(node, context, _output) {
    context.setVariable(
      node.getAttribute("name"),
      this.evaluateVariable(
        { node, select: node.getAttribute("select") },
        context,
      ),
    );
  }

  xslComment(node, context, output) {
    // "--" and a trailing "-" are made safe by the serializer (section 7.4)
    const text = this.instantiateText(node, context);
    output.appendChild(context.outputDocument.createComment(text));
  }

  xslProcessingInstruction(node, context, output) {
    const name = this.processAttributeValueTemplate(
      node.getAttribute("name"),
      context,
    );
    // Error recovery of XSLT 1.0 section 7.3: "?>" cannot end the data early
    const data = this.instantiateText(node, context).replaceAll("?>", "? >");

    const pi = context.outputDocument.createProcessingInstruction(name, data);
    output.appendChild(pi);
  }

  /**
   * Instantiate `xsl:number` (XSLT 1.0 section 7.7). The formatting
   * attributes format, grouping-separator and grouping-size are attribute
   * value templates; lang and letter-value have no effect.
   *
   * @param {Element} node - The xsl:number instruction
   * @param {XsltContext} context - The current context
   * @param {Node} output - The result node receiving the number
   * @returns {void}
   */
  xslNumber(node, context, output) {
    const value = node.getAttribute("value");
    const format = this.optionalAvt(node, "format", context) || "1";
    const grouping = {
      separator: this.optionalAvt(node, "grouping-separator", context),
      size: Number(this.optionalAvt(node, "grouping-size", context)),
    };

    let numbers;
    if (value) {
      numbers = [
        Math.round(
          this.xpathEvaluator.toNumber(this.evaluateXPath(value, context)),
        ),
      ];
    } else {
      numbers = countXsltNumber(
        context.currentNode,
        {
          level: node.getAttribute("level") || "single",
          count: node.getAttribute("count"),
          from: node.getAttribute("from"),
        },
        (candidate, pattern) =>
          this.matchesPattern(candidate, pattern, context),
      );
    }

    const text = context.outputDocument.createTextNode(
      formatXsltNumber(numbers, format, grouping),
    );
    output.appendChild(text);
  }

  /**
   * Format a single number with an `xsl:number` format token.
   *
   * @param {number} number - The number to format
   * @param {string} format - The format token, e.g. `1`, `01`, `a`, `I`
   * @returns {string} The formatted number
   */
  formatNumber(number, format) {
    return formatXsltNumber([number], format);
  }

  /**
   * Convert a number to an upper case Roman numeral.
   *
   * @param {number} num - The number to convert
   * @returns {string} The Roman numeral
   */
  toRoman(num) {
    return toRoman(num);
  }

  xslMessage(node, context, _output) {
    const terminate = node.getAttribute("terminate") === "yes";
    const text = this.instantiateText(node, context);

    console.log("XSLT Message:", text);

    if (terminate) {
      throw new Error(`XSLT terminated: ${text}`);
    }
  }

  applyAttributeSets(names, context, element) {
    const setNames = names.split(/\s+/).filter(Boolean);

    for (const name of setNames) {
      const attrSet = this.attributeSets[name];
      if (attrSet) {
        // Apply inherited sets first
        if (attrSet.useAttributeSets.length > 0) {
          this.applyAttributeSets(
            attrSet.useAttributeSets.join(" "),
            context,
            element,
          );
        }

        // Apply the xsl:attribute children, with the prefixes in scope there
        this.processChildren(attrSet.node, context, element);
      }
    }
  }

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
  }

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
  }

  /**
   * Engine callbacks used by the sort module, created once per engine.
   *
   * @returns {import('./sort.js').SortHost} The callbacks
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
  }

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

  isXsltNamespace(node) {
    return (
      node.namespaceURI === XSLT_NS ||
      (node.nodeName && node.nodeName.startsWith("xsl:"))
    );
  }

  isXsltElement(node, localName) {
    if (node.nodeType !== 1) return false;

    const nodeName = node.localName || node.nodeName;
    return (
      (node.namespaceURI === XSLT_NS && nodeName === localName) ||
      node.nodeName === `xsl:${localName}`
    );
  }
}
