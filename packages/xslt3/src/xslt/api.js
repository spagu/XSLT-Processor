/**
 * XSLT 3.0 and 2.0 (and 1.0 in backwards-compatible mode): compile a
 * stylesheet once, run it on many documents.
 *
 * ```js
 * import { compileStylesheet } from "@tradik/xslt3";
 * const stylesheet = compileStylesheet(xslDocument, { baseUri });
 * const { principal, secondary, messages } = stylesheet.transform({
 *   source: xmlDocument,
 *   params: { title: "Report" },
 * });
 * ```
 *
 * @module @tradik/xslt3/xslt
 */

import { StylesheetCompiler } from "./compiler/stylesheet.js";
import { normalizeParams } from "./runtime/params.js";
import { runTransformation } from "./runtime/transformation.js";
import { xsltError } from "./names.js";

/**
 * Parses XML text with the given parser or the global DOMParser.
 * @param {string} text
 * @param {string|undefined} uri
 * @param {((text: string, uri?: string) => Document)|undefined} parseXml
 * @returns {Document}
 */
function parse(text, uri, parseXml) {
  if (parseXml) return parseXml(text, uri);
  const Parser = globalThis.DOMParser;
  if (!Parser) {
    throw xsltError("XTSE0165", "No XML parser: pass the parseXml option");
  }
  return new Parser().parseFromString(text, "application/xml");
}

/** A compiled stylesheet. */
export class CompiledStylesheet {
  /** @param {StylesheetCompiler} compiled */
  constructor(compiled) {
    this.compiled = compiled;
    /** @type {Map<string, object>} xsl:output parameters by Clark name ("" unnamed) */
    this.outputs = compiled.outputs;
  }

  /**
   * The parameters of the unnamed output definition, with
   * `use-character-maps` expanded to a Map of characters to strings.
   * @returns {object}
   */
  get output() {
    return this.compiled.outputFor(null);
  }

  /**
   * Runs the stylesheet.
   * @param {object} [options]
   * @param {Node} [options.source] - Source document (global context item
   *   and initial match selection)
   * @param {string} [options.initialTemplate] - Name of the initial
   *   template (`local`, `Q{uri}local`)
   * @param {string} [options.initialMode] - Clark name of the initial mode
   * @param {Array} [options.initialMatchSelection] - Items to apply
   *   templates to (default: the source)
   * @param {object|Map} [options.params] - Stylesheet parameters by name
   * @param {object|Map} [options.templateParams] - Parameters of the
   *   initial template or mode
   * @param {object|Map} [options.tunnelParams] - Tunnel parameters
   * @param {(uri: string) => Document} [options.documentLoader] - Loads
   *   documents for doc() and document()
   * @param {() => Document} [options.createDocument] - Creates documents
   * @param {(message: Node) => void} [options.onMessage] - xsl:message
   * @param {string} [options.baseOutputUri] - Base of result-document URIs
   * @param {{name: string, args: Array}} [options.initialFunction] - A
   *   stylesheet function to call instead (its result is the principal
   *   result)
   * @param {*} [options.globalContextItem] - Default: the source
   * @param {number} [options.implicitTimezone] - Minutes, default 0
   * @param {Date} [options.currentDateTime] - Default: now
   * @param {number} [options.maxDepth] - Deepest nesting of instructions
   *   (default 1,000,000; deeper is reported as an infinite recursion)
   * @returns {{principal: Node|Array, secondary: Map<string, {document:
   *   Node, output: object}>, messages: Array, output: object}} the
   *   results; `output` holds the serialization parameters of the
   *   principal result: those of the xsl:result-document that wrote it,
   *   else those of the `output` getter
   */
  transform(options = {}) {
    const { principalOutput, ...result } = runTransformation(
      this.compiled,
      options,
    );
    return { ...result, output: principalOutput ?? this.output };
  }
}

/**
 * Compiles a stylesheet.
 * @param {Document|Element|string} stylesheet - The principal module
 * @param {object} [options]
 * @param {string} [options.baseUri] - URI of the principal module
 * @param {(uri: string) => Document|string} [options.loadStylesheet] -
 *   Loads included and imported modules
 * @param {(text: string, uri?: string) => Document} [options.parseXml] -
 *   XML parser (default: the global DOMParser)
 * @param {object|Map} [options.staticParams] - Values of static
 *   parameters (XSLT 3.0) by name
 * @returns {CompiledStylesheet}
 * @throws {import("../errors.js").XPathError} the static errors (XTSE...)
 */
export function compileStylesheet(stylesheet, options = {}) {
  const parseXml = (text, uri) => parse(text, uri, options.parseXml);
  const source =
    typeof stylesheet === "string"
      ? parseXml(stylesheet, options.baseUri)
      : stylesheet;
  const compiler = new StylesheetCompiler({
    ...options,
    parse: parseXml,
    staticParams: normalizeParams(options.staticParams),
  });
  const uri = options.baseUri ?? (source.documentURI || undefined);
  return new CompiledStylesheet(compiler.compile(source, uri));
}
