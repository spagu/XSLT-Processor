/**
 * XSLT 1.0 Processing Engine
 * Based on W3C XSLT 1.0 Specification: http://www.w3.org/TR/1999/REC-xslt-19991116
 *
 * Processes XSLT stylesheets and transforms XML documents.
 */

import { parse as parseXPath } from '../xpath/parser.js';
import { XPathEvaluator, XPathContext } from '../xpath/evaluator.js';

const XSLT_NS = 'http://www.w3.org/1999/XSL/Transform';

/**
 * XSLT Processing Context
 */
export class XsltContext {
  constructor(options = {}) {
    this.currentNode = options.currentNode;
    this.currentNodeList = options.currentNodeList || [];
    this.position = options.position || 1;
    this.variables = { ...options.variables };
    this.parameters = { ...options.parameters };
    this.outputDocument = options.outputDocument;
    this.stylesheet = options.stylesheet;
    this.namespaces = { ...options.namespaces };
    this.templates = options.templates || [];
    this.keys = options.keys || {};
    this.decimalFormats = options.decimalFormats || {};
    this.outputMethod = options.outputMethod || 'xml';
    this.xpathEvaluator = options.xpathEvaluator || new XPathEvaluator();
  }

  clone(overrides = {}) {
    return new XsltContext({
      currentNode: overrides.currentNode ?? this.currentNode,
      currentNodeList: overrides.currentNodeList ?? this.currentNodeList,
      position: overrides.position ?? this.position,
      variables: overrides.variables ? { ...this.variables, ...overrides.variables } : { ...this.variables },
      parameters: overrides.parameters ? { ...this.parameters, ...overrides.parameters } : { ...this.parameters },
      outputDocument: this.outputDocument,
      stylesheet: this.stylesheet,
      namespaces: overrides.namespaces ? { ...this.namespaces, ...overrides.namespaces } : { ...this.namespaces },
      templates: this.templates,
      keys: this.keys,
      decimalFormats: this.decimalFormats,
      outputMethod: this.outputMethod,
      xpathEvaluator: this.xpathEvaluator
    });
  }

  getVariable(name) {
    if (name in this.variables) {
      return this.variables[name];
    }
    if (name in this.parameters) {
      return this.parameters[name];
    }
    throw new Error(`Undefined variable: $${name}`);
  }

  setVariable(name, value) {
    this.variables[name] = value;
  }
}

/**
 * XSLT Engine
 */
export class XsltEngine {
  constructor(options = {}) {
    this.xpathEvaluator = new XPathEvaluator();
    this.templates = [];
    this.keys = {};
    this.globalVariables = {};
    this.globalParameters = {};
    this.outputSettings = {
      method: 'xml',
      encoding: 'UTF-8',
      indent: 'no',
      omitXmlDeclaration: 'no',
      doctypePublic: null,
      doctypeSystem: null,
      mediaType: null,
      cdataSectionElements: []
    };
    this.namespaces = {};
    this.decimalFormats = {};
    this.stylesheetDoc = null;
    this.attributeSets = {};
    this.namespaceAliases = {};
    this.stripSpace = [];
    this.preserveSpace = [];

    // Import/Include support
    this.stylesheetLoader = options.stylesheetLoader || null;
    this.currentImportPrecedence = 0;
    this.processedStylesheets = new Set();
    this.baseUri = options.baseUri || '';
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
   */
  resolveUri(href, baseUri) {
    if (!baseUri || href.startsWith('http://') || href.startsWith('https://') || href.startsWith('/')) {
      return href;
    }

    // Remove filename from baseUri to get directory
    const lastSlash = baseUri.lastIndexOf('/');
    const baseDir = lastSlash >= 0 ? baseUri.substring(0, lastSlash + 1) : '';

    return baseDir + href;
  }

  /**
   * Load an external stylesheet document
   */
  loadStylesheet(href, baseUri) {
    if (!this.stylesheetLoader) {
      throw new Error(`Cannot load stylesheet "${href}": no stylesheetLoader configured. ` +
        'Use engine.setStylesheetLoader(fn) to provide a loader function.');
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
    if (typeof DOMParser !== 'undefined') {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlString, 'application/xml');
      const parseError = doc.querySelector('parsererror');
      if (parseError) {
        throw new Error(`XML parse error: ${parseError.textContent}`);
      }
      return doc;
    }
    throw new Error('XML parsing not available in this environment');
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
      if (stylesheetUri) {
        this.baseUri = stylesheetUri;
        this.processedStylesheets.add(stylesheetUri);
      }
    }

    const root = stylesheetNode.documentElement || stylesheetNode;

    // Validate stylesheet
    if (!this.isXsltElement(root, 'stylesheet') && !this.isXsltElement(root, 'transform')) {
      // Check for literal result element (simplified stylesheet)
      if (root.getAttribute && root.getAttribute('xsl:version')) {
        this.processLiteralResultStylesheet(root);
        return;
      }
      throw new Error('Invalid XSLT stylesheet: root element must be xsl:stylesheet or xsl:transform');
    }

    // Collect namespaces from root
    this.collectNamespaces(root);

    // XSLT 1.0: xsl:import elements MUST come first and are processed with lower precedence
    // Process imports first (they have lower precedence than the importing stylesheet)
    const imports = [];
    const otherElements = [];

    for (const child of root.childNodes) {
      if (child.nodeType !== 1) continue;

      if (this.isXsltElement(child, 'import')) {
        imports.push(child);
      } else {
        otherElements.push(child);
      }
    }

    // Process imports (lower precedence - process before current stylesheet)
    for (const importNode of imports) {
      this.processImport(importNode, stylesheetUri || this.baseUri);
    }

    // Process other top-level elements (including includes)
    for (const child of otherElements) {
      if (this.isXsltElement(child, 'template')) {
        this.registerTemplate(child);
      } else if (this.isXsltElement(child, 'output')) {
        this.processOutput(child);
      } else if (this.isXsltElement(child, 'variable')) {
        this.processGlobalVariable(child);
      } else if (this.isXsltElement(child, 'param')) {
        this.processGlobalParam(child);
      } else if (this.isXsltElement(child, 'key')) {
        this.processKey(child);
      } else if (this.isXsltElement(child, 'decimal-format')) {
        this.processDecimalFormat(child);
      } else if (this.isXsltElement(child, 'namespace-alias')) {
        this.processNamespaceAlias(child);
      } else if (this.isXsltElement(child, 'attribute-set')) {
        this.processAttributeSet(child);
      } else if (this.isXsltElement(child, 'strip-space')) {
        this.processStripSpace(child);
      } else if (this.isXsltElement(child, 'preserve-space')) {
        this.processPreserveSpace(child);
      } else if (this.isXsltElement(child, 'include')) {
        this.processInclude(child, stylesheetUri || this.baseUri);
      }
    }

    // Increment import precedence after processing this stylesheet
    if (isMainStylesheet) {
      this.currentImportPrecedence++;
    }
  }

  /**
   * Process xsl:include element
   * Includes are merged at the same import precedence level
   */
  processInclude(node, baseUri) {
    const href = node.getAttribute('href');
    if (!href) {
      throw new Error('xsl:include requires an href attribute');
    }

    const resolvedUri = this.resolveUri(href, baseUri);

    // Check for circular includes
    if (this.processedStylesheets.has(resolvedUri)) {
      throw new Error(`Circular stylesheet reference detected: ${resolvedUri}`);
    }

    this.processedStylesheets.add(resolvedUri);

    try {
      const { document: stylesheetDoc } = this.loadStylesheet(href, baseUri);

      // Parse if string
      let doc = stylesheetDoc;
      if (typeof stylesheetDoc === 'string') {
        doc = this.parseXmlString(stylesheetDoc);
      }

      // Process the included stylesheet at the same import precedence
      const savedPrecedence = this.currentImportPrecedence;
      this.processIncludedStylesheet(doc, resolvedUri);
      this.currentImportPrecedence = savedPrecedence;
    } catch (error) {
      throw new Error(`Failed to include stylesheet "${href}": ${error.message}`);
    }
  }

  /**
   * Process xsl:import element
   * Imports have lower precedence than the importing stylesheet
   */
  processImport(node, baseUri) {
    const href = node.getAttribute('href');
    if (!href) {
      throw new Error('xsl:import requires an href attribute');
    }

    const resolvedUri = this.resolveUri(href, baseUri);

    // Check for circular imports
    if (this.processedStylesheets.has(resolvedUri)) {
      throw new Error(`Circular stylesheet reference detected: ${resolvedUri}`);
    }

    this.processedStylesheets.add(resolvedUri);

    try {
      const { document: stylesheetDoc } = this.loadStylesheet(href, baseUri);

      // Parse if string
      let doc = stylesheetDoc;
      if (typeof stylesheetDoc === 'string') {
        doc = this.parseXmlString(stylesheetDoc);
      }

      // Process the imported stylesheet (imports have lower precedence)
      // Don't increment precedence yet - imported templates get current (lower) precedence
      this.processIncludedStylesheet(doc, resolvedUri);

      // After processing import, increment precedence for next imports and main stylesheet
      this.currentImportPrecedence++;
    } catch (error) {
      throw new Error(`Failed to import stylesheet "${href}": ${error.message}`);
    }
  }

  /**
   * Process an included/imported stylesheet document
   */
  processIncludedStylesheet(stylesheetDoc, stylesheetUri) {
    const root = stylesheetDoc.documentElement || stylesheetDoc;

    // Validate stylesheet
    if (!this.isXsltElement(root, 'stylesheet') && !this.isXsltElement(root, 'transform')) {
      throw new Error('Included/imported document is not a valid XSLT stylesheet');
    }

    // Collect namespaces
    this.collectNamespaces(root);

    // Process imports first (they have lower precedence)
    const imports = [];
    const otherElements = [];

    for (const child of root.childNodes) {
      if (child.nodeType !== 1) continue;

      if (this.isXsltElement(child, 'import')) {
        imports.push(child);
      } else {
        otherElements.push(child);
      }
    }

    // Process nested imports
    for (const importNode of imports) {
      this.processImport(importNode, stylesheetUri);
    }

    // Process other elements
    for (const child of otherElements) {
      if (this.isXsltElement(child, 'template')) {
        this.registerTemplate(child);
      } else if (this.isXsltElement(child, 'output')) {
        this.processOutput(child);
      } else if (this.isXsltElement(child, 'variable')) {
        this.processGlobalVariable(child);
      } else if (this.isXsltElement(child, 'param')) {
        this.processGlobalParam(child);
      } else if (this.isXsltElement(child, 'key')) {
        this.processKey(child);
      } else if (this.isXsltElement(child, 'decimal-format')) {
        this.processDecimalFormat(child);
      } else if (this.isXsltElement(child, 'namespace-alias')) {
        this.processNamespaceAlias(child);
      } else if (this.isXsltElement(child, 'attribute-set')) {
        this.processAttributeSet(child);
      } else if (this.isXsltElement(child, 'strip-space')) {
        this.processStripSpace(child);
      } else if (this.isXsltElement(child, 'preserve-space')) {
        this.processPreserveSpace(child);
      } else if (this.isXsltElement(child, 'include')) {
        this.processInclude(child, stylesheetUri);
      }
    }
  }

  processLiteralResultStylesheet(root) {
    // Simplified stylesheet - entire document is one template matching /
    this.templates.push({
      match: '/',
      name: null,
      mode: null,
      priority: 0.5,
      node: root
    });
  }

  collectNamespaces(node) {
    if (!node.attributes) return;

    for (const attr of node.attributes) {
      if (attr.name.startsWith('xmlns:')) {
        const prefix = attr.name.substring(6);
        if (attr.value !== XSLT_NS) {
          this.namespaces[prefix] = attr.value;
        }
      } else if (attr.name === 'xmlns' && attr.value !== XSLT_NS) {
        this.namespaces[''] = attr.value;
      }
    }
  }

  registerTemplate(node) {
    const match = node.getAttribute('match');
    const name = node.getAttribute('name');
    const mode = node.getAttribute('mode') || null;
    const priorityAttr = node.getAttribute('priority');
    const priority = priorityAttr ? parseFloat(priorityAttr) : this.calculatePriority(match);

    this.templates.push({
      match,
      name,
      mode,
      priority,
      importPrecedence: this.currentImportPrecedence,
      node
    });
  }

  calculatePriority(matchPattern) {
    if (!matchPattern) return 0.5;

    // Simplified priority calculation based on XPath 1.0 spec
    // - NodeType or * have priority -0.5
    // - NCName:* has priority -0.25
    // - QName has priority 0
    // - Other patterns have priority 0.5

    if (matchPattern === '*' || matchPattern === 'node()' ||
      matchPattern === 'text()' || matchPattern === 'comment()' ||
      matchPattern === 'processing-instruction()') {
      return -0.5;
    }

    if (matchPattern.includes(':*')) {
      return -0.25;
    }

    if (/^[a-zA-Z_][\w.-]*$/.test(matchPattern)) {
      return 0;
    }

    return 0.5;
  }

  processOutput(node) {
    const method = node.getAttribute('method');
    if (method) this.outputSettings.method = method;

    const encoding = node.getAttribute('encoding');
    if (encoding) this.outputSettings.encoding = encoding;

    const indent = node.getAttribute('indent');
    if (indent) this.outputSettings.indent = indent;

    const omit = node.getAttribute('omit-xml-declaration');
    if (omit) this.outputSettings.omitXmlDeclaration = omit;

    const doctypePublic = node.getAttribute('doctype-public');
    if (doctypePublic) this.outputSettings.doctypePublic = doctypePublic;

    const doctypeSystem = node.getAttribute('doctype-system');
    if (doctypeSystem) this.outputSettings.doctypeSystem = doctypeSystem;

    const mediaType = node.getAttribute('media-type');
    if (mediaType) this.outputSettings.mediaType = mediaType;

    const cdataElements = node.getAttribute('cdata-section-elements');
    if (cdataElements) {
      this.outputSettings.cdataSectionElements = cdataElements.split(/\s+/).filter(Boolean);
    }
  }

  processGlobalVariable(node) {
    const name = node.getAttribute('name');
    const select = node.getAttribute('select');

    this.globalVariables[name] = { node, select };
  }

  processGlobalParam(node) {
    const name = node.getAttribute('name');
    const select = node.getAttribute('select');

    this.globalParameters[name] = { node, select };
  }

  processKey(node) {
    const name = node.getAttribute('name');
    const match = node.getAttribute('match');
    const use = node.getAttribute('use');

    this.keys[name] = { match, use };
  }

  processDecimalFormat(node) {
    const name = node.getAttribute('name') || '';

    this.decimalFormats[name] = {
      decimalSeparator: node.getAttribute('decimal-separator') || '.',
      groupingSeparator: node.getAttribute('grouping-separator') || ',',
      percent: node.getAttribute('percent') || '%',
      perMille: node.getAttribute('per-mille') || '\u2030',
      zeroDigit: node.getAttribute('zero-digit') || '0',
      digit: node.getAttribute('digit') || '#',
      patternSeparator: node.getAttribute('pattern-separator') || ';',
      infinity: node.getAttribute('infinity') || 'Infinity',
      nan: node.getAttribute('NaN') || 'NaN',
      minusSign: node.getAttribute('minus-sign') || '-'
    };
  }

  processNamespaceAlias(node) {
    const stylesheet = node.getAttribute('stylesheet-prefix');
    const result = node.getAttribute('result-prefix');
    this.namespaceAliases[stylesheet] = result;
  }

  processAttributeSet(node) {
    const name = node.getAttribute('name');
    const useAttributeSets = node.getAttribute('use-attribute-sets');

    this.attributeSets[name] = {
      node,
      useAttributeSets: useAttributeSets ? useAttributeSets.split(/\s+/).filter(Boolean) : []
    };
  }

  processStripSpace(node) {
    const elements = node.getAttribute('elements');
    if (elements) {
      this.stripSpace.push(...elements.split(/\s+/).filter(Boolean));
    }
  }

  processPreserveSpace(node) {
    const elements = node.getAttribute('elements');
    if (elements) {
      this.preserveSpace.push(...elements.split(/\s+/).filter(Boolean));
    }
  }

  /**
   * Transform a source document
   */
  transform(sourceNode, ownerDocument) {
    const doc = ownerDocument || (typeof document !== 'undefined' ? document : null);

    if (!doc) {
      throw new Error('No output document available');
    }

    // Create context
    const context = new XsltContext({
      currentNode: sourceNode.documentElement || sourceNode,
      currentNodeList: [sourceNode.documentElement || sourceNode],
      position: 1,
      outputDocument: doc,
      stylesheet: this.stylesheetDoc,
      namespaces: { ...this.namespaces },
      templates: this.templates,
      keys: this.keys,
      decimalFormats: this.decimalFormats,
      outputMethod: this.outputSettings.method,
      xpathEvaluator: this.xpathEvaluator
    });

    // Evaluate global variables
    for (const [name, def] of Object.entries(this.globalParameters)) {
      if (!(name in context.parameters)) {
        context.parameters[name] = this.evaluateVariable(def, context);
      }
    }

    for (const [name, def] of Object.entries(this.globalVariables)) {
      context.variables[name] = this.evaluateVariable(def, context);
    }

    // Create result document fragment
    const fragment = doc.createDocumentFragment();

    // Apply templates to root
    this.applyTemplates([sourceNode.documentElement || sourceNode], null, context, fragment);

    return fragment;
  }

  /**
   * Transform to a complete document
   */
  transformToDocument(sourceNode) {
    // For Node.js environments, we need a document implementation
    const doc = this.createDocument();
    const fragment = this.transform(sourceNode, doc);

    // Move fragment contents to document
    while (fragment.firstChild) {
      doc.appendChild(fragment.firstChild);
    }

    return doc;
  }

  createDocument() {
    if (typeof document !== 'undefined') {
      return document.implementation.createDocument(null, null, null);
    }

    // For Node.js - would need JSDOM or similar
    throw new Error('Document creation not available in this environment');
  }

  evaluateVariable(def, context) {
    if (def.select) {
      return this.evaluateXPath(def.select, context);
    }

    // If no select, evaluate content as result tree fragment
    const fragment = context.outputDocument.createDocumentFragment();
    this.processChildren(def.node, context, fragment);
    return fragment;
  }

  /**
   * Apply templates to a node list
   */
  applyTemplates(nodes, mode, context, output) {
    const nodeList = Array.isArray(nodes) ? nodes : [nodes];

    for (let i = 0; i < nodeList.length; i++) {
      const node = nodeList[i];
      const template = this.findMatchingTemplate(node, mode, context);

      if (template) {
        const newContext = context.clone({
          currentNode: node,
          currentNodeList: nodeList,
          position: i + 1
        });

        this.processTemplate(template.node, newContext, output);
      } else {
        // Built-in templates
        this.applyBuiltinTemplate(node, mode, context, output);
      }
    }
  }

  /**
   * Find the best matching template for a node
   */
  findMatchingTemplate(node, mode, context) {
    let bestMatch = null;
    let bestPriority = -Infinity;
    let bestImportPrecedence = -Infinity;

    for (const template of this.templates) {
      if (template.mode !== mode) continue;
      if (!template.match) continue;

      if (this.matchesPattern(node, template.match, context)) {
        const priority = template.priority;
        const importPrecedence = template.importPrecedence || 0;

        if (importPrecedence > bestImportPrecedence ||
          (importPrecedence === bestImportPrecedence && priority > bestPriority)) {
          bestMatch = template;
          bestPriority = priority;
          bestImportPrecedence = importPrecedence;
        }
      }
    }

    return bestMatch;
  }

  /**
   * Check if a node matches an XSLT pattern
   */
  matchesPattern(node, pattern, context) {
    // Split union patterns
    const patterns = this.splitUnionPattern(pattern);

    for (const p of patterns) {
      if (this.matchesSinglePattern(node, p.trim(), context)) {
        return true;
      }
    }

    return false;
  }

  splitUnionPattern(pattern) {
    // Simple split on | not inside predicates or strings
    const parts = [];
    let current = '';
    let depth = 0;
    let inString = false;
    let stringChar = '';

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
      } else if (char === '[') {
        depth++;
        current += char;
      } else if (char === ']') {
        depth--;
        current += char;
      } else if (char === '|' && depth === 0) {
        parts.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    if (current) {
      parts.push(current);
    }

    return parts;
  }

  matchesSinglePattern(node, pattern, context) {
    try {
      // Handle root pattern
      if (pattern === '/') {
        return node.nodeType === 9 || node === (node.ownerDocument?.documentElement);
      }

      // Handle patterns like "item" (child match)
      // Need to check if node would be selected by pattern from parent
      const ast = parseXPath(pattern);

      // For patterns starting with /, evaluate from root
      if (pattern.startsWith('/')) {
        const doc = node.ownerDocument || node;
        const xpathContext = new XPathContext(
          doc,
          1,
          1,
          { ...context.variables, ...context.parameters },
          context.namespaces
        );
        const result = this.xpathEvaluator.evaluate(ast, xpathContext);
        const nodes = Array.isArray(result) ? result : [result];
        return nodes.includes(node);
      }

      // For relative patterns, check if this node matches when evaluated from parent
      if (node.parentNode) {
        const xpathContext = new XPathContext(
          node.parentNode,
          1,
          1,
          { ...context.variables, ...context.parameters },
          context.namespaces
        );
        const result = this.xpathEvaluator.evaluate(ast, xpathContext);
        const nodes = Array.isArray(result) ? result : [result];
        return nodes.includes(node);
      }

      // For document node without parent
      const xpathContext = new XPathContext(
        node,
        1,
        1,
        { ...context.variables, ...context.parameters },
        context.namespaces
      );
      const result = this.xpathEvaluator.evaluate(ast, xpathContext);
      const nodes = Array.isArray(result) ? result : [result];
      return nodes.includes(node);
    } catch {
      return false;
    }
  }

  /**
   * Apply built-in template rules
   */
  applyBuiltinTemplate(node, mode, context, output) {
    switch (node.nodeType) {
      case 1: // Element
      case 9: // Document
      case 11: // Document Fragment
        // Process children
        this.applyTemplates(Array.from(node.childNodes), mode, context, output);
        break;

      case 3: // Text
      case 4: // CDATA
        // Copy text value
        const text = context.outputDocument.createTextNode(node.nodeValue || '');
        output.appendChild(text);
        break;

      case 2: // Attribute
        // Copy attribute value as text
        const attrText = context.outputDocument.createTextNode(node.nodeValue || '');
        output.appendChild(attrText);
        break;

      // Comments and PIs have no built-in template
    }
  }

  /**
   * Process template content
   */
  processTemplate(templateNode, context, output) {
    // Process template parameters first
    const localContext = context.clone();

    for (const child of templateNode.childNodes) {
      if (child.nodeType === 1 && this.isXsltElement(child, 'param')) {
        const name = child.getAttribute('name');
        if (!(name in localContext.parameters)) {
          localContext.parameters[name] = this.evaluateVariable(
            { node: child, select: child.getAttribute('select') },
            localContext
          );
        }
      }
    }

    this.processChildren(templateNode, localContext, output);
  }

  /**
   * Process child nodes of an XSLT element
   */
  processChildren(node, context, output) {
    for (const child of node.childNodes) {
      this.processNode(child, context, output);
    }
  }

  /**
   * Process a single node in the stylesheet
   */
  processNode(node, context, output) {
    switch (node.nodeType) {
      case 1: // Element
        this.processElement(node, context, output);
        break;

      case 3: // Text
      case 4: // CDATA
        // Output text if not whitespace only (or if preserving space)
        const text = node.nodeValue;
        if (text && (text.trim() || this.shouldPreserveSpace(node))) {
          const textNode = context.outputDocument.createTextNode(text);
          output.appendChild(textNode);
        }
        break;
    }
  }

  shouldPreserveSpace(node) {
    // Check xml:space attribute on ancestors
    let current = node.parentNode;
    while (current && current.nodeType === 1) {
      const space = current.getAttribute('xml:space');
      if (space === 'preserve') return true;
      if (space === 'default') return false;
      current = current.parentNode;
    }
    return false;
  }

  /**
   * Process an element in the stylesheet
   */
  processElement(node, context, output) {
    // Check if XSLT element
    if (this.isXsltNamespace(node)) {
      this.processXsltElement(node, context, output);
    } else {
      // Literal result element
      this.processLiteralResultElement(node, context, output);
    }
  }

  /**
   * Process an XSLT instruction element
   */
  processXsltElement(node, context, output) {
    const localName = node.localName || node.nodeName.replace(/^xsl:/, '');

    switch (localName) {
      case 'apply-templates':
        this.xslApplyTemplates(node, context, output);
        break;

      case 'call-template':
        this.xslCallTemplate(node, context, output);
        break;

      case 'value-of':
        this.xslValueOf(node, context, output);
        break;

      case 'text':
        this.xslText(node, context, output);
        break;

      case 'element':
        this.xslElement(node, context, output);
        break;

      case 'attribute':
        this.xslAttribute(node, context, output);
        break;

      case 'if':
        this.xslIf(node, context, output);
        break;

      case 'choose':
        this.xslChoose(node, context, output);
        break;

      case 'for-each':
        this.xslForEach(node, context, output);
        break;

      case 'copy':
        this.xslCopy(node, context, output);
        break;

      case 'copy-of':
        this.xslCopyOf(node, context, output);
        break;

      case 'variable':
        this.xslVariable(node, context, output);
        break;

      case 'param':
        // Params are processed at template start
        break;

      case 'comment':
        this.xslComment(node, context, output);
        break;

      case 'processing-instruction':
        this.xslProcessingInstruction(node, context, output);
        break;

      case 'number':
        this.xslNumber(node, context, output);
        break;

      case 'sort':
        // Handled by apply-templates and for-each
        break;

      case 'with-param':
        // Handled by call-template and apply-templates
        break;

      case 'message':
        this.xslMessage(node, context, output);
        break;

      case 'fallback':
        // Used for forward compatibility
        break;

      default:
        console.warn(`Unknown XSLT element: ${localName}`);
    }
  }

  /**
   * Process a literal result element (non-XSLT)
   */
  processLiteralResultElement(node, context, output) {
    // Create element in output
    let outputElement;
    const namespaceURI = node.namespaceURI;
    const nodeName = node.nodeName;

    // Apply namespace aliases
    let resolvedNS = namespaceURI;
    if (namespaceURI) {
      for (const [from, to] of Object.entries(this.namespaceAliases)) {
        if (this.namespaces[from] === namespaceURI) {
          resolvedNS = this.namespaces[to] || to;
          break;
        }
      }
    }

    if (resolvedNS && context.outputDocument.createElementNS) {
      outputElement = context.outputDocument.createElementNS(resolvedNS, nodeName);
    } else {
      outputElement = context.outputDocument.createElement(nodeName);
    }

    // Copy attributes (except XSLT namespace)
    if (node.attributes) {
      for (const attr of node.attributes) {
        if (attr.namespaceURI === XSLT_NS) continue;
        if (attr.name.startsWith('xmlns')) continue;

        // Process attribute value templates
        const value = this.processAttributeValueTemplate(attr.value, context);
        outputElement.setAttribute(attr.name, value);
      }
    }

    // Process children
    this.processChildren(node, context, outputElement);

    output.appendChild(outputElement);
  }

  /**
   * Process attribute value templates (expressions in curly braces)
   */
  processAttributeValueTemplate(value, context) {
    if (!value.includes('{')) return value;

    let result = '';
    let i = 0;

    while (i < value.length) {
      if (value[i] === '{') {
        if (value[i + 1] === '{') {
          // Escaped brace
          result += '{';
          i += 2;
        } else {
          // Find closing brace
          let depth = 1;
          let j = i + 1;
          while (j < value.length && depth > 0) {
            if (value[j] === '{') depth++;
            else if (value[j] === '}') depth--;
            j++;
          }

          const expr = value.substring(i + 1, j - 1);
          const evalResult = this.evaluateXPath(expr, context);
          result += this.xpathEvaluator.toString(evalResult);
          i = j;
        }
      } else if (value[i] === '}') {
        if (value[i + 1] === '}') {
          // Escaped brace
          result += '}';
          i += 2;
        } else {
          throw new Error('Unmatched } in attribute value template');
        }
      } else {
        result += value[i];
        i++;
      }
    }

    return result;
  }

  // XSLT Instructions
  xslApplyTemplates(node, context, output) {
    const select = node.getAttribute('select') || 'node()';
    const mode = node.getAttribute('mode') || null;

    // Evaluate select expression
    let nodes = this.evaluateXPath(select, context);
    if (!Array.isArray(nodes)) {
      nodes = nodes ? [nodes] : [];
    }

    // Collect sort specifications
    const sortSpecs = [];
    for (const child of node.childNodes) {
      if (child.nodeType === 1 && this.isXsltElement(child, 'sort')) {
        sortSpecs.push({
          select: child.getAttribute('select') || '.',
          order: child.getAttribute('order') || 'ascending',
          dataType: child.getAttribute('data-type') || 'text',
          caseOrder: child.getAttribute('case-order') || 'upper-first',
          lang: child.getAttribute('lang')
        });
      }
    }

    // Apply sorting
    if (sortSpecs.length > 0) {
      nodes = this.sortNodes(nodes, sortSpecs, context);
    }

    // Collect with-param values
    const params = {};
    for (const child of node.childNodes) {
      if (child.nodeType === 1 && this.isXsltElement(child, 'with-param')) {
        const name = child.getAttribute('name');
        const selectAttr = child.getAttribute('select');
        if (selectAttr) {
          params[name] = this.evaluateXPath(selectAttr, context);
        } else {
          const fragment = context.outputDocument.createDocumentFragment();
          this.processChildren(child, context, fragment);
          params[name] = fragment;
        }
      }
    }

    // Apply templates with new context including params
    const newContext = context.clone({ parameters: { ...context.parameters, ...params } });
    this.applyTemplates(nodes, mode, newContext, output);
  }

  xslCallTemplate(node, context, output) {
    const name = node.getAttribute('name');

    // Find named template
    const template = this.templates.find((t) => t.name === name);
    if (!template) {
      throw new Error(`Template not found: ${name}`);
    }

    // Collect with-param values
    const params = {};
    for (const child of node.childNodes) {
      if (child.nodeType === 1 && this.isXsltElement(child, 'with-param')) {
        const paramName = child.getAttribute('name');
        const selectAttr = child.getAttribute('select');
        if (selectAttr) {
          params[paramName] = this.evaluateXPath(selectAttr, context);
        } else {
          const fragment = context.outputDocument.createDocumentFragment();
          this.processChildren(child, context, fragment);
          params[paramName] = fragment;
        }
      }
    }

    // Call template with params
    const newContext = context.clone({ parameters: { ...context.parameters, ...params } });
    this.processTemplate(template.node, newContext, output);
  }

  xslValueOf(node, context, output) {
    const select = node.getAttribute('select');
    const disableOutputEscaping = node.getAttribute('disable-output-escaping') === 'yes';

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
    const disableOutputEscaping = node.getAttribute('disable-output-escaping') === 'yes';
    let text = '';

    for (const child of node.childNodes) {
      if (child.nodeType === 3 || child.nodeType === 4) {
        text += child.nodeValue || '';
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

  xslElement(node, context, output) {
    const name = this.processAttributeValueTemplate(node.getAttribute('name'), context);
    const namespace = node.getAttribute('namespace');
    const useAttributeSets = node.getAttribute('use-attribute-sets');

    let element;
    if (namespace) {
      const ns = this.processAttributeValueTemplate(namespace, context);
      element = context.outputDocument.createElementNS(ns, name);
    } else {
      element = context.outputDocument.createElement(name);
    }

    // Apply attribute sets
    if (useAttributeSets) {
      this.applyAttributeSets(useAttributeSets, context, element);
    }

    this.processChildren(node, context, element);
    output.appendChild(element);
  }

  xslAttribute(node, context, output) {
    const name = this.processAttributeValueTemplate(node.getAttribute('name'), context);
    const namespace = node.getAttribute('namespace');

    // Collect content
    const fragment = context.outputDocument.createDocumentFragment();
    this.processChildren(node, context, fragment);

    // Get text content
    let value = '';
    const getText = (n) => {
      if (n.nodeType === 3 || n.nodeType === 4) {
        value += n.nodeValue || '';
      } else if (n.childNodes) {
        for (const child of n.childNodes) {
          getText(child);
        }
      }
    };
    getText(fragment);

    // Add attribute to parent element
    if (output.nodeType === 1) {
      if (namespace) {
        const ns = this.processAttributeValueTemplate(namespace, context);
        output.setAttributeNS(ns, name, value);
      } else {
        output.setAttribute(name, value);
      }
    }
  }

  xslIf(node, context, output) {
    const test = node.getAttribute('test');
    const result = this.evaluateXPath(test, context);

    if (this.xpathEvaluator.toBoolean(result)) {
      this.processChildren(node, context, output);
    }
  }

  xslChoose(node, context, output) {
    for (const child of node.childNodes) {
      if (child.nodeType !== 1) continue;

      if (this.isXsltElement(child, 'when')) {
        const test = child.getAttribute('test');
        const result = this.evaluateXPath(test, context);

        if (this.xpathEvaluator.toBoolean(result)) {
          this.processChildren(child, context, output);
          return;
        }
      } else if (this.isXsltElement(child, 'otherwise')) {
        this.processChildren(child, context, output);
        return;
      }
    }
  }

  xslForEach(node, context, output) {
    const select = node.getAttribute('select');

    let nodes = this.evaluateXPath(select, context);
    if (!Array.isArray(nodes)) {
      nodes = nodes ? [nodes] : [];
    }

    // Collect sort specifications
    const sortSpecs = [];
    for (const child of node.childNodes) {
      if (child.nodeType === 1 && this.isXsltElement(child, 'sort')) {
        sortSpecs.push({
          select: child.getAttribute('select') || '.',
          order: child.getAttribute('order') || 'ascending',
          dataType: child.getAttribute('data-type') || 'text',
          caseOrder: child.getAttribute('case-order') || 'upper-first',
          lang: child.getAttribute('lang')
        });
      }
    }

    // Apply sorting
    if (sortSpecs.length > 0) {
      nodes = this.sortNodes(nodes, sortSpecs, context);
    }

    // Process each node
    for (let i = 0; i < nodes.length; i++) {
      const newContext = context.clone({
        currentNode: nodes[i],
        currentNodeList: nodes,
        position: i + 1
      });

      this.processChildren(node, newContext, output);
    }
  }

  xslCopy(node, context, output) {
    const currentNode = context.currentNode;
    const useAttributeSets = node.getAttribute('use-attribute-sets');

    switch (currentNode.nodeType) {
      case 1: // Element
        let copy;
        if (currentNode.namespaceURI) {
          copy = context.outputDocument.createElementNS(
            currentNode.namespaceURI,
            currentNode.nodeName
          );
        } else {
          copy = context.outputDocument.createElement(currentNode.nodeName);
        }

        if (useAttributeSets) {
          this.applyAttributeSets(useAttributeSets, context, copy);
        }

        this.processChildren(node, context, copy);
        output.appendChild(copy);
        break;

      case 2: // Attribute
        if (output.nodeType === 1) {
          output.setAttribute(currentNode.name, currentNode.value);
        }
        break;

      case 3: // Text
      case 4: // CDATA
        const textCopy = context.outputDocument.createTextNode(currentNode.nodeValue || '');
        output.appendChild(textCopy);
        break;

      case 7: // Processing Instruction
        const piCopy = context.outputDocument.createProcessingInstruction(
          currentNode.target,
          currentNode.data
        );
        output.appendChild(piCopy);
        break;

      case 8: // Comment
        const commentCopy = context.outputDocument.createComment(currentNode.nodeValue || '');
        output.appendChild(commentCopy);
        break;

      case 9: // Document
      case 11: // Document Fragment
        this.processChildren(node, context, output);
        break;
    }
  }

  xslCopyOf(node, context, output) {
    const select = node.getAttribute('select');
    const result = this.evaluateXPath(select, context);

    this.copyToOutput(result, context, output);
  }

  copyToOutput(value, context, output) {
    if (Array.isArray(value)) {
      for (const item of value) {
        this.copyToOutput(item, context, output);
      }
      return;
    }

    if (value && value.nodeType) {
      // Deep copy node
      const clone = this.deepCloneNode(value, context.outputDocument);
      output.appendChild(clone);
    } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      const text = context.outputDocument.createTextNode(String(value));
      output.appendChild(text);
    }
  }

  deepCloneNode(node, targetDoc) {
    switch (node.nodeType) {
      case 1: { // Element
        let clone;
        if (node.namespaceURI && targetDoc.createElementNS) {
          clone = targetDoc.createElementNS(node.namespaceURI, node.nodeName);
        } else {
          clone = targetDoc.createElement(node.nodeName);
        }

        if (node.attributes) {
          for (const attr of node.attributes) {
            clone.setAttribute(attr.name, attr.value);
          }
        }

        for (const child of node.childNodes) {
          clone.appendChild(this.deepCloneNode(child, targetDoc));
        }

        return clone;
      }

      case 3: // Text
      case 4: // CDATA
        return targetDoc.createTextNode(node.nodeValue || '');

      case 7: // Processing Instruction
        return targetDoc.createProcessingInstruction(node.target, node.data);

      case 8: // Comment
        return targetDoc.createComment(node.nodeValue || '');

      case 11: { // Document Fragment
        const frag = targetDoc.createDocumentFragment();
        for (const child of node.childNodes) {
          frag.appendChild(this.deepCloneNode(child, targetDoc));
        }
        return frag;
      }

      default:
        return targetDoc.createTextNode('');
    }
  }

  xslVariable(node, context, output) {
    const name = node.getAttribute('name');
    const select = node.getAttribute('select');

    let value;
    if (select) {
      value = this.evaluateXPath(select, context);
    } else {
      const fragment = context.outputDocument.createDocumentFragment();
      this.processChildren(node, context, fragment);
      value = fragment;
    }

    context.setVariable(name, value);
  }

  xslComment(node, context, output) {
    const fragment = context.outputDocument.createDocumentFragment();
    this.processChildren(node, context, fragment);

    let text = '';
    const getText = (n) => {
      if (n.nodeType === 3 || n.nodeType === 4) {
        text += n.nodeValue || '';
      } else if (n.childNodes) {
        for (const child of n.childNodes) {
          getText(child);
        }
      }
    };
    getText(fragment);

    const comment = context.outputDocument.createComment(text);
    output.appendChild(comment);
  }

  xslProcessingInstruction(node, context, output) {
    const name = this.processAttributeValueTemplate(node.getAttribute('name'), context);

    const fragment = context.outputDocument.createDocumentFragment();
    this.processChildren(node, context, fragment);

    let data = '';
    const getText = (n) => {
      if (n.nodeType === 3 || n.nodeType === 4) {
        data += n.nodeValue || '';
      } else if (n.childNodes) {
        for (const child of n.childNodes) {
          getText(child);
        }
      }
    };
    getText(fragment);

    const pi = context.outputDocument.createProcessingInstruction(name, data);
    output.appendChild(pi);
  }

  xslNumber(node, context, output) {
    const value = node.getAttribute('value');
    const format = node.getAttribute('format') || '1';
    const level = node.getAttribute('level') || 'single';

    let number;
    if (value) {
      number = Math.round(this.xpathEvaluator.toNumber(this.evaluateXPath(value, context)));
    } else {
      // Count based on level
      number = this.countNumber(context.currentNode, level, node, context);
    }

    const formatted = this.formatNumber(number, format);
    const text = context.outputDocument.createTextNode(formatted);
    output.appendChild(text);
  }

  countNumber(node, level, spec, context) {
    const count = spec.getAttribute('count');
    const from = spec.getAttribute('from');

    // Simplified implementation
    if (level === 'single') {
      // Count preceding siblings matching pattern
      let n = 1;
      let sibling = node.previousSibling;
      while (sibling) {
        if (sibling.nodeType === 1) {
          if (!count || this.matchesPattern(sibling, count, context)) {
            n++;
          }
        }
        sibling = sibling.previousSibling;
      }
      return n;
    }

    return 1;
  }

  formatNumber(number, format) {
    // Simple format implementation
    if (/^[0-9]+$/.test(format)) {
      return String(number).padStart(format.length, '0');
    }

    if (format === 'a') {
      return String.fromCharCode(96 + ((number - 1) % 26) + 1);
    }

    if (format === 'A') {
      return String.fromCharCode(64 + ((number - 1) % 26) + 1);
    }

    if (format === 'i') {
      return this.toRoman(number).toLowerCase();
    }

    if (format === 'I') {
      return this.toRoman(number);
    }

    return String(number);
  }

  toRoman(num) {
    const romanNumerals = [
      ['M', 1000], ['CM', 900], ['D', 500], ['CD', 400],
      ['C', 100], ['XC', 90], ['L', 50], ['XL', 40],
      ['X', 10], ['IX', 9], ['V', 5], ['IV', 4], ['I', 1]
    ];

    let result = '';
    for (const [numeral, value] of romanNumerals) {
      while (num >= value) {
        result += numeral;
        num -= value;
      }
    }
    return result;
  }

  xslMessage(node, context, output) {
    const terminate = node.getAttribute('terminate') === 'yes';

    const fragment = context.outputDocument.createDocumentFragment();
    this.processChildren(node, context, fragment);

    let text = '';
    const getText = (n) => {
      if (n.nodeType === 3 || n.nodeType === 4) {
        text += n.nodeValue || '';
      } else if (n.childNodes) {
        for (const child of n.childNodes) {
          getText(child);
        }
      }
    };
    getText(fragment);

    console.log('XSLT Message:', text);

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
          this.applyAttributeSets(attrSet.useAttributeSets.join(' '), context, element);
        }

        // Apply attributes from this set
        for (const child of attrSet.node.childNodes) {
          if (child.nodeType === 1 && this.isXsltElement(child, 'attribute')) {
            this.xslAttribute(child, context, element);
          }
        }
      }
    }
  }

  sortNodes(nodes, sortSpecs, context) {
    return [...nodes].sort((a, b) => {
      for (const spec of sortSpecs) {
        const contextA = context.clone({ currentNode: a });
        const contextB = context.clone({ currentNode: b });

        let valueA = this.evaluateXPath(spec.select, contextA);
        let valueB = this.evaluateXPath(spec.select, contextB);

        // Convert to string for comparison (ensure non-null values)
        valueA = this.xpathEvaluator.toString(valueA) || '';
        valueB = this.xpathEvaluator.toString(valueB) || '';

        if (spec.dataType === 'number') {
          valueA = parseFloat(valueA) || 0;
          valueB = parseFloat(valueB) || 0;
        } else {
          // Text comparison
          if (spec.caseOrder === 'lower-first') {
            valueA = valueA.toLowerCase();
            valueB = valueB.toLowerCase();
          } else {
            valueA = valueA.toUpperCase();
            valueB = valueB.toUpperCase();
          }
        }

        let cmp;
        if (typeof valueA === 'number') {
          cmp = valueA - valueB;
        } else {
          cmp = valueA.localeCompare(valueB, spec.lang || undefined);
        }

        if (spec.order === 'descending') {
          cmp = -cmp;
        }

        if (cmp !== 0) return cmp;
      }

      return 0;
    });
  }

  evaluateXPath(expr, context) {
    const ast = parseXPath(expr);
    const xpathContext = new XPathContext(
      context.currentNode,
      context.position,
      context.currentNodeList.length,
      { ...context.variables, ...context.parameters },
      context.namespaces
    );
    return this.xpathEvaluator.evaluate(ast, xpathContext);
  }

  isXsltNamespace(node) {
    return node.namespaceURI === XSLT_NS ||
      (node.nodeName && node.nodeName.startsWith('xsl:'));
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
