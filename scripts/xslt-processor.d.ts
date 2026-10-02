/**
 * @tradik/xslt-processor - TypeScript Declarations
 *
 * Source of dist/xslt-processor.d.ts and dist/xslt-processor.d.cts, copied
 * by scripts/build.js. Keep it in step with the exports of src/index.js.
 */

/**
 * Loader used to resolve xsl:import and xsl:include references.
 *
 * The loader is synchronous: it must return the external stylesheet as a
 * Document or as an XML string (which is parsed automatically).
 *
 * @param href - The resolved URI of the referenced stylesheet
 * @param baseUri - The URI of the importing/including stylesheet, if known
 */
export type StylesheetLoader = (
  href: string,
  baseUri?: string,
) => Document | string;

/**
 * Loader used by the XSLT document() function.
 *
 * The loader is synchronous: it must return the document as a Document, as an
 * XML string (which is parsed automatically) or null when it is unavailable
 * (document() then evaluates to an empty node-set).
 *
 * @param uri - The resolved URI of the requested document
 * @param baseUri - The base URI the reference was resolved against, if known
 */
export type DocumentLoader = (
  uri: string,
  baseUri?: string,
) => Document | string | null;

/**
 * Anything with a DOMParser-like parseFromString method (a browser, jsdom or
 * xmldom DOMParser instance).
 */
export interface DomParserLike {
  parseFromString(text: string, type: string): Document;
}

/**
 * What an asynchronous loader may resolve to: a Document, markup, bytes
 * (decoded from the byte order mark or XML declaration, else UTF-8), a fetch
 * Response, or null when the resource is unavailable.
 */
export type AsyncLoaderResult =
  Document | string | Uint8Array | ArrayBuffer | Response | null;

/**
 * Asynchronous loader of stylesheet modules and document() documents.
 * @param uri - The resolved URI
 * @param baseUri - The URI it was resolved against, if known
 * @param init - Holds the AbortSignal of the call
 */
export type AsyncLoader = (
  uri: string,
  baseUri: string | undefined,
  init: { signal?: AbortSignal },
) => AsyncLoaderResult | Promise<AsyncLoaderResult>;

/**
 * Input of the asynchronous API: a node, markup, bytes, or a stream of
 * markup/bytes. Streams are read to their end before parsing (XSLT 1.0 needs
 * the whole source tree).
 */
export type AsyncSource =
  | Node
  | string
  | Uint8Array
  | ArrayBuffer
  | ReadableStream<string | Uint8Array | ArrayBuffer>
  | AsyncIterable<string | Uint8Array | ArrayBuffer>;

/** Options of transformToStream. */
export interface StreamOptions {
  /** Cancels: the stream is errored with the abort reason. */
  signal?: AbortSignal;
  /** Chunk size in UTF-16 code units (default 16384); Infinity for one chunk. */
  chunkSize?: number;
}

/** Options of importStylesheetAsync. */
export interface ImportAsyncOptions {
  /** Loader of xsl:import/xsl:include modules; the global fetch by default. */
  loader?: AsyncLoader;
  /** Loader of literal document() documents; `loader` by default. */
  documentLoader?: AsyncLoader;
  /** Cancels loading. */
  signal?: AbortSignal;
}

/** Options of transformAsync. */
export interface TransformAsyncOptions {
  /** Cancels loading and reading. */
  signal?: AbortSignal;
  /** A stylesheet to import first with importStylesheetAsync. */
  stylesheet?: AsyncSource;
  /** The URI of that stylesheet. */
  stylesheetUri?: string;
  /** Loader of its xsl:import/xsl:include modules (fetch by default). */
  fetchStylesheet?: AsyncLoader;
  /** Loader of the literal document() documents of the stylesheet. */
  fetchDocument?: AsyncLoader;
}

/** The `xsltVersion` option of XSLTProcessor. */
export type XsltVersionMode = "1.0" | "auto";

/**
 * XSLTProcessor - Applies XSLT stylesheet transformations to XML documents.
 */
export class XSLTProcessor {
  constructor(options?: {
    /**
     * @deprecated Let unprefixed name tests (`item`, `@a`) also match nodes
     * in a namespace, as before 1.2.0. XPath 1.0 and Chrome match only nodes
     * in no namespace.
     */
    legacyNameTests?: boolean;
    /**
     * Deprecated: `transformToFragment` turns xml output into XHTML elements
     * of an HTML owner document, as 1.2.0 to 1.3.0 did. Chrome and Firefox
     * keep such elements in no namespace, the default since 1.3.1.
     */
    legacyXhtmlFragments?: boolean;
    /** Allow EXSLT `dyn:evaluate()`; it evaluates XPath built from data. */
    enableDynamicEvaluate?: boolean;
    /** Clock for EXSLT current-time functions (reproducible output). */
    clock?: () => Date;
    /**
     * Deepest nesting of template instantiations; deeper recursion throws
     * "Template recursion too deep" (default 3000, as in libxslt).
     */
    maxTemplateDepth?: number;
    /**
     * "1.0" (default): every stylesheet runs with the XSLT 1.0 engine, a
     * version="2.0" one in forwards-compatible mode (as in Chrome).
     * "auto": a stylesheet whose version is 2.0 or more runs with the
     * optional peer dependency @tradik/xslt3, loaded with import() by the
     * asynchronous API or by {@link XSLTProcessor.preload}.
     * @throws RangeError for any other value
     */
    xsltVersion?: XsltVersionMode;
  });

  /**
   * Load @tradik/xslt3 so that the synchronous API of processors created
   * with `xsltVersion: "auto"` can run XSLT 2.0/3.0 stylesheets (non-W3C).
   * Rejects with "Cannot load @tradik/xslt3: install @tradik/xslt3 to run
   * XSLT 2.0/3.0 stylesheets" when the package is missing.
   * @param version - "3.0" (default) or "2.0"
   */
  static preload(version?: "2.0" | "3.0"): Promise<void>;

  /**
   * The underlying XSLT engine (advanced usage).
   * Null until a stylesheet has been imported. With `xsltVersion: "auto"`
   * and an XSLT 2.0/3.0 stylesheet it is the @tradik/xslt3 bridge engine,
   * which has `outputSettings` but not the other XsltEngine members.
   */
  readonly engine: XsltEngine | null;

  /**
   * Sets the loader used to resolve xsl:import and xsl:include references.
   * Call it before importStylesheet() so the loader is available while the
   * stylesheet is compiled; calling it afterwards updates the live engine.
   * @param loader - The loader function, or null to remove it
   * @returns This processor, to allow chaining
   */
  setStylesheetLoader(loader: StylesheetLoader | null): this;

  /**
   * Sets the loader used by the XSLT document() function. It may be set
   * before or after importStylesheet(); a live engine is kept in sync.
   * @param loader - The loader function, or null to remove it
   * @returns This processor, to allow chaining
   */
  setDocumentLoader(loader: DocumentLoader | null): this;

  /**
   * Imports the XSLT stylesheet.
   * Throws when the stylesheet is malformed or invalid (for example when a
   * pattern is invalid); the processor then keeps its previous stylesheet.
   * @param style - The XSLT stylesheet to import (Document or Element)
   * @param stylesheetUri - Optional base URI used to resolve relative
   *   xsl:import/xsl:include hrefs
   */
  importStylesheet(style: Node, stylesheetUri?: string): void;

  /**
   * Transforms the node source and returns a document fragment.
   * @param source - The XML document to transform
   * @param output - The document that will own the generated fragment
   * @returns The transformed result as a DocumentFragment
   */
  transformToFragment(source: Node, output: Document): DocumentFragment | null;

  /**
   * Transforms the node source and returns a full XML document.
   * @param source - The XML document to transform
   * @returns The transformed result as an XMLDocument
   */
  transformToDocument(source: Node): XMLDocument | null;

  /**
   * Transforms the node source and serializes the result to a string,
   * honoring the stylesheet xsl:output settings (non-W3C convenience method).
   * @param source - The XML document to transform
   * @returns The serialized result, or null on a transformation error
   */
  transformToString(source: Node): string | null;

  /**
   * Imports a stylesheet after loading its xsl:import/xsl:include tree and
   * its literal document() documents asynchronously (non-W3C). Rejects on a
   * load failure or an import cycle; the previous stylesheet is then kept.
   * @param style - The stylesheet, as a node or as markup/stream to parse
   * @param stylesheetUri - Base URI of relative hrefs and document() URIs
   * @param options - Loaders and AbortSignal
   */
  importStylesheetAsync(
    style: AsyncSource,
    stylesheetUri?: string,
    options?: ImportAsyncOptions,
  ): Promise<void>;

  /**
   * Transforms asynchronously and resolves with the serialized result
   * (non-W3C). Unlike transformToString, failures reject.
   * @param source - Node, markup, bytes or stream of the source document
   * @param options - AbortSignal, optional stylesheet and loaders
   */
  transformAsync(
    source: AsyncSource,
    options?: TransformAsyncOptions,
  ): Promise<string>;

  /**
   * Transforms and streams the serialized result in chunks (non-W3C). The
   * result tree is built in memory on the first read; the output string is
   * produced chunk by chunk on demand. Failures error the stream.
   * @param source - Node, markup, bytes or stream of the source document
   * @param options - AbortSignal and chunk size
   */
  transformToStream(
    source: AsyncSource,
    options?: StreamOptions,
  ): ReadableStream<string>;

  /**
   * Sets a parameter in the XSLT stylesheet.
   * @param namespaceURI - The namespace URI (use null for no namespace)
   * @param localName - The local name of the parameter
   * @param value - The value to set
   */
  setParameter(
    namespaceURI: string | null,
    localName: string,
    value: unknown,
  ): void;

  /**
   * Gets the value of a parameter from the XSLT stylesheet.
   * @param namespaceURI - The namespace URI
   * @param localName - The local name of the parameter
   * @returns The parameter value, or empty string if not set
   */
  getParameter(namespaceURI: string | null, localName: string): unknown;

  /**
   * Removes a parameter from the XSLT processor.
   * @param namespaceURI - The namespace URI
   * @param localName - The local name of the parameter
   */
  removeParameter(namespaceURI: string | null, localName: string): void;

  /**
   * Removes all set parameters from the XSLTProcessor.
   */
  clearParameters(): void;

  /**
   * Removes all parameters and stylesheets from the XSLTProcessor.
   * The loaders are configuration, not stylesheet state, and are preserved.
   */
  reset(): void;
}

/**
 * Check if native XSLTProcessor is available and functional. After
 * installGlobal() replaced it, the original native implementation is probed.
 */
export function isNativeXSLTSupported(): boolean;

/**
 * Install as global XSLTProcessor replacement if native is not functional.
 * @param force - Force installation even if native is available
 * @returns True if installed as global
 */
export function installGlobal(force?: boolean): boolean;

/**
 * The first `xml-stylesheet` processing instruction of a document that names
 * an XSLT stylesheet, or null.
 */
export function findXmlStylesheet(
  doc: Document,
): { href: string; type: string } | null;

/**
 * Whether a document is XML left unstyled with an XSLT processing instruction
 * the browser did not apply (not HTML, not already an XHTML page).
 */
export function needsXmlStylesheet(doc: Document | null | undefined): boolean;

/**
 * Apply the document's `<?xml-stylesheet?>` with this library: fetch the
 * stylesheet relative to the document, transform, replace the document
 * element with the result. Resolves to false when the document needs none.
 */
export function applyXmlStylesheet(
  doc?: Document,
  options?: { fetch?: typeof fetch; Processor?: typeof XSLTProcessor },
): Promise<boolean>;

/**
 * Apply the processing instruction of the current document once parsed, when
 * the browser did not (the browser bundle calls it next to installGlobal()).
 */
export function autoApplyXmlStylesheet(doc?: Document): void;

/**
 * XPath evaluation result types.
 */
export const XPathResultType: {
  ANY_TYPE: 0;
  NUMBER_TYPE: 1;
  STRING_TYPE: 2;
  BOOLEAN_TYPE: 3;
  UNORDERED_NODE_ITERATOR_TYPE: 4;
  ORDERED_NODE_ITERATOR_TYPE: 5;
  UNORDERED_NODE_SNAPSHOT_TYPE: 6;
  ORDERED_NODE_SNAPSHOT_TYPE: 7;
  ANY_UNORDERED_NODE_TYPE: 8;
  FIRST_ORDERED_NODE_TYPE: 9;
};

/**
 * Default limits of the standalone XPath evaluator, guarding against
 * untrusted expressions.
 */
export const XPathLimits: {
  MAX_RECURSION_DEPTH: number;
  MAX_RESULT_SIZE: number;
  MAX_STRING_LENGTH: number;
};

/**
 * XPath evaluation context.
 */
export class XPathContext {
  constructor(
    node: Node,
    position?: number,
    size?: number,
    variables?: Record<string, unknown>,
    namespaces?: Record<string, string>,
    hostContext?: unknown,
  );

  node: Node;
  position: number;
  size: number;
  variables: Record<string, unknown>;
  namespaces: Record<string, string>;
  /** Opaque context of the host language (XSLT), for host defined functions. */
  hostContext: unknown;

  clone(overrides?: Partial<XPathContext>): XPathContext;
}

/**
 * An extension function: called with the argument expressions (unevaluated
 * ASTs) and the evaluation context, with the evaluator as `this`.
 */
export type XPathFunction = (
  this: XPathEvaluator,
  args: unknown[],
  context: XPathContext,
) => unknown;

/**
 * XPath evaluator.
 */
export class XPathEvaluator {
  constructor(options?: {
    /** Deepest expression nesting (default XPathLimits.MAX_RECURSION_DEPTH). */
    maxRecursionDepth?: number;
    /** Largest node-set one step may produce (default XPathLimits.MAX_RESULT_SIZE). */
    maxResultSize?: number;
    /** Longest string a function may produce (default XPathLimits.MAX_STRING_LENGTH). */
    maxStringLength?: number;
    /**
     * @deprecated Let unprefixed name tests (`item`, `@a`) also match nodes
     * in a namespace, as before 1.2.0. XPath 1.0 and Chrome match only nodes
     * in no namespace.
     */
    legacyNameTests?: boolean;
  });

  evaluate(ast: unknown, context: XPathContext): unknown;
  /**
   * Register extension functions by name, `{namespace-uri}local-name` for
   * namespaced ones.
   * @returns This evaluator, to allow chaining
   */
  registerFunctions(functions: Record<string, XPathFunction>): this;
  toBoolean(value: unknown): boolean;
  toNumber(value: unknown): number;
  toString(value: unknown): string;
  getStringValue(node: Node): string;
}

/**
 * Evaluate an XPath expression against a node.
 */
export function evaluateXPath(
  expression: string,
  contextNode: Node,
  options?: {
    variables?: Record<string, unknown>;
    namespaces?: Record<string, string>;
  },
): unknown;

/**
 * Select nodes matching an XPath expression.
 */
export function selectXPath(
  expression: string,
  contextNode: Node,
  options?: {
    variables?: Record<string, unknown>;
    namespaces?: Record<string, string>;
  },
): Node[];

/**
 * Select first node matching an XPath expression.
 */
export function selectFirstXPath(
  expression: string,
  contextNode: Node,
  options?: {
    variables?: Record<string, unknown>;
    namespaces?: Record<string, string>;
  },
): Node | null;

/**
 * Parse an XPath expression into an AST.
 */
export function parseXPath(expression: string): unknown;

/**
 * XSLT processing context.
 */
export class XsltContext {
  constructor(options?: {
    currentNode?: Node;
    currentNodeList?: Node[];
    position?: number;
    variables?: Record<string, unknown>;
    parameters?: Record<string, unknown>;
    /** Global variables and parameters of the transformation. */
    globals?: unknown;
    outputDocument?: Document;
    stylesheet?: Document;
    namespaces?: Record<string, string>;
    templates?: unknown[];
    keys?: Record<string, unknown>;
    decimalFormats?: Record<string, unknown>;
    outputMethod?: string;
    xpathEvaluator?: XPathEvaluator;
    /** The template rule being instantiated (for xsl:apply-imports). */
    currentTemplate?: unknown;
    /** The current mode, null for the default mode. */
    currentMode?: string | null;
  });

  clone(overrides?: Partial<XsltContext>): XsltContext;
  getVariable(name: string): unknown;
  setVariable(name: string, value: unknown): void;
}

/**
 * Default node-set limit of an XSLT transformation (5,000,000).
 */
export const XSLT_MAX_RESULT_SIZE: number;

/**
 * Default XPath expression depth limit of an XSLT transformation (1000).
 */
export const XSLT_MAX_EXPRESSION_DEPTH: number;

/**
 * Default limit of nested template instantiations in a transformation
 * (3000, libxslt's `xsltMaxDepth`).
 */
export const XSLT_MAX_TEMPLATE_DEPTH: number;

/**
 * XSLT processing engine.
 */
export class XsltEngine {
  constructor(options?: {
    stylesheetLoader?: StylesheetLoader | null;
    documentLoader?: DocumentLoader | null;
    baseUri?: string;
    /**
     * Parser for the XML strings returned by the loaders; defaults to the
     * global DOMParser, then to the DOMParser of the stylesheet's window.
     */
    domParser?: DomParserLike | null;
    /** Largest node-set one XPath step may produce (default XSLT_MAX_RESULT_SIZE). */
    maxResultSize?: number;
    /** Deepest XPath expression nesting (default XSLT_MAX_EXPRESSION_DEPTH). */
    maxRecursionDepth?: number;
    /**
     * Deepest nesting of template instantiations; deeper recursion throws
     * "Template recursion too deep" (default XSLT_MAX_TEMPLATE_DEPTH).
     */
    maxTemplateDepth?: number;
    /**
     * @deprecated Let unprefixed name tests (`item`, `@a`) also match nodes
     * in a namespace, as before 1.2.0. XPath 1.0 and Chrome match only nodes
     * in no namespace.
     */
    legacyNameTests?: boolean;
    /**
     * Deprecated: `transformToFragment` turns xml output into XHTML elements
     * of an HTML owner document, as 1.2.0 to 1.3.0 did. Chrome and Firefox
     * keep such elements in no namespace, the default since 1.3.1.
     */
    legacyXhtmlFragments?: boolean;
    /** Allow EXSLT `dyn:evaluate()`; it evaluates XPath built from data. */
    enableDynamicEvaluate?: boolean;
    /** Clock for EXSLT current-time functions (reproducible output). */
    clock?: () => Date;
  });

  /** Whether EXSLT `dyn:evaluate()` is allowed. */
  enableDynamicEvaluate: boolean;
  /** Clock for EXSLT current-time functions, or null for the system clock. */
  clock: (() => Date) | null;

  setStylesheetLoader(loader: StylesheetLoader | null): this;
  setDocumentLoader(loader: DocumentLoader | null): this;
  importStylesheet(stylesheetNode: Node, stylesheetUri?: string): void;
  transform(sourceNode: Node, ownerDocument: Document): DocumentFragment;
  /**
   * Like transform(), but html output into an HTML document is parsed as
   * HTML (real HTMLElements), as Chrome's transformToFragment does.
   */
  transformToFragment(
    sourceNode: Node,
    ownerDocument: Document,
  ): DocumentFragment;
  /**
   * Register the implementation of an extension element (XSLT 1.0 section
   * 14.1), used instead of its xsl:fallback children.
   * @returns This engine, to allow chaining
   */
  registerExtensionElement(
    namespaceUri: string,
    localName: string,
    handler: (
      node: Element,
      context: XsltContext,
      output: Node,
      engine: XsltEngine,
    ) => void,
  ): this;
  transformToDocument(sourceNode: Node): Document;
  transformToString(sourceNode: Node): string;

  outputSettings: OutputSettings;
}

/**
 * xsl:output settings driving the result serialization
 * (XSLT 1.0 section 16). Accepts the raw stylesheet values, so the yes/no
 * attributes are strings and cdata-section-elements may be a name list.
 * A null method means "not declared": html or xml is picked from the result.
 */
export interface OutputSettings {
  method?: "xml" | "html" | "xhtml" | "text" | "auto" | (string & {}) | null;
  version?: string;
  encoding?: string;
  standalone?: "yes" | "no" | string | null;
  indent?: "yes" | "no" | boolean;
  omitXmlDeclaration?: "yes" | "no" | boolean;
  doctypePublic?: string | null;
  doctypeSystem?: string | null;
  mediaType?: string | null;
  /**
   * QNames (whitespace separated or as an array), or expanded names as the
   * engine resolves them from xsl:output.
   */
  cdataSectionElements?:
    string | Array<string | { namespaceUri: string | null; localName: string }>;
}

/**
 * Serialize a transformation result honoring the xsl:output settings.
 * @param node - Result document, fragment or element
 * @param outputSettings - xsl:output settings
 * @returns The serialized result, or an empty string for a null node
 */
export function serializeResult(
  node: Node | null,
  outputSettings?: OutputSettings,
): string;

/** Default chunk size of the streaming serializer (16384 code units). */
export const DEFAULT_CHUNK_SIZE: number;

/**
 * Serialize a transformation result in chunks of at most `chunkSize` UTF-16
 * code units (one more when a surrogate pair straddles the boundary); joined,
 * they equal serializeResult().
 * @throws RangeError When chunkSize is not a positive integer or Infinity
 */
export function serializeChunks(
  node: Node | null,
  outputSettings?: OutputSettings,
  options?: { chunkSize?: number },
): Iterator<string> & Iterable<string>;

/**
 * Transform with an engine and serialize the result in chunks: the result
 * tree is built by this call, serialization runs as the chunks are read.
 */
export function transformToChunks(
  engine: XsltEngine,
  sourceNode: Node,
  options?: { chunkSize?: number },
): Iterator<string> & Iterable<string>;

/**
 * Transform with an engine and stream the serialized result.
 */
export function transformToStream(
  engine: XsltEngine,
  sourceNode: Node,
  options?: StreamOptions,
): ReadableStream<string>;

/**
 * Mark a text node as produced with disable-output-escaping="yes".
 */
export function markRawText<T extends Node | null>(node: T): T;

/**
 * Check whether a node must be serialized without output escaping.
 */
export function isRawText(node: Node | null): boolean;

/**
 * Normalize raw xsl:output settings for the serializers.
 */
export function resolveOutputSettings(
  outputSettings: OutputSettings | null,
  node: Node | null,
): Required<OutputSettings> & {
  indent: boolean;
  omitXmlDeclaration: boolean;
  cdataSectionElements: Set<string>;
};

/**
 * Version information.
 */
export const VERSION: string;

/**
 * Check if running in a browser environment.
 */
export const isBrowser: boolean;

/**
 * Check if running in Node.js.
 */
export const isNode: boolean;

export default XSLTProcessor;
