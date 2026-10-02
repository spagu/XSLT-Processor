/**
 * XSLT 3.0 mode of the playground: compile a stylesheet with @tradik/xslt3,
 * run it on an XML document and serialize the principal result and every
 * xsl:result-document as their xsl:output asks, collecting xsl:message
 * output and errors with their W3C code.
 *
 * It has no DOM wiring of its own and gets the library and DOMParser from
 * its caller, so it runs unchanged in the page and under Node.js with jsdom
 * (site/scripts/xslt3.test.mjs).
 *
 * @module xslt3-core
 */

import { parseError } from "./playground-core.js";

/**
 * @typedef {object} Xslt3Message
 * @property {string} level - "message" (xsl:message) or "error"
 * @property {string} text - The text
 * @property {string} [code] - W3C error code of an error (XTSE0010...)
 */

/**
 * @typedef {object} SecondaryResult
 * @property {string} href - The href of xsl:result-document
 * @property {string} method - Its output method
 * @property {string} output - Its serialized content
 */

/**
 * @typedef {object} Xslt3Result
 * @property {string|null} output - The serialized principal result, null on failure
 * @property {string} method - Its output method (html, xhtml, xml, text, json...)
 * @property {boolean} declared - Whether the stylesheet declared that method
 * @property {SecondaryResult[]} secondary - Results of xsl:result-document,
 *   in the order they were written
 * @property {Xslt3Message[]} messages - xsl:message output, then the error
 * @property {number} ms - Duration of compilation and transformation in ms
 */

/**
 * The text of an xsl:message: a document node, or (when the message could not
 * become a document) a sequence of nodes and atomic values.
 *
 * @param {Node|Array} message - One entry of transform().messages
 * @returns {string} Its string value
 */
export function messageText(message) {
  const items = Array.isArray(message) ? message : [message];
  return items.map(itemText).join(" ");
}

/**
 * The string value of a node or an atomic value. A document node's
 * textContent is null in the DOM, so its children are read instead.
 *
 * @param {Node|{ value: * }} item - The item
 * @returns {string} Its text
 */
function itemText(item) {
  if (item.nodeType === 9) {
    return [...item.childNodes].map((child) => child.textContent).join("");
  }
  return item.nodeType ? item.textContent : String(item.value);
}

/**
 * The stylesheet line an error message most likely points at. The engine
 * reports no source locations, so this looks for what the message quotes
 * (an expression in quotes, an xsl: instruction, a $variable) and answers
 * only when it occurs on exactly one line.
 *
 * @param {string} message - Error message without its code
 * @param {string} xsl - Stylesheet text
 * @returns {number|null} 1-based line number
 */
export function lineHint(message, xsl) {
  const candidates = [
    ...[...message.matchAll(/"([^"]{3,})"/g)].map((m) =>
      m[1].replace(/\^/g, "").trim(),
    ),
    ...[...message.matchAll(/\bxsl:[\w-]+/g)].map((m) => `<${m[0]}`),
    ...[...message.matchAll(/\$[\w:-]+/g)].map((m) => m[0]),
  ];
  const lines = xsl.split(/\r?\n/);
  for (const candidate of candidates) {
    const found = lines.flatMap((line, i) =>
      candidate && line.includes(candidate) ? [i + 1] : [],
    );
    if (found.length === 1) return found[0];
  }
  return null;
}

/**
 * Describe an error from the engine: its code, its message without the code
 * and, when one can be found, the stylesheet line.
 *
 * @param {Error & { code?: string }} error - The error
 * @param {string} xsl - Stylesheet text
 * @returns {Xslt3Message} The message to show
 */
export function errorMessage(error, xsl) {
  const code = error.code ?? undefined;
  const text = code ? error.message.replace(`${code}: `, "") : error.message;
  const line = code ? lineHint(text, xsl) : null;
  return {
    level: "error",
    code,
    text: line ? `${text} (near stylesheet line ${line})` : text,
  };
}

/**
 * Parameter values for transform(): every value becomes xs:untypedAtomic,
 * as on a command line, so it converts to the type an xsl:param declares
 * with `as` ("0.08" to xs:decimal, "3" to xs:integer).
 *
 * @param {{ name: string, value: string }[]} params - Parameter rows
 * @param {object} lib - @tradik/xslt3
 * @returns {object} Values by name; rows without a name are skipped
 */
export function untypedParams(params, lib) {
  const entries = params
    .filter(({ name }) => name.trim())
    .map(({ name, value }) => [
      name.trim(),
      lib.evaluateXPath("xs:untypedAtomic($v)", null, {
        variables: { v: value },
      }),
    ]);
  return Object.fromEntries(entries);
}

/**
 * Compile a stylesheet, run it on an XML document and serialize the results.
 *
 * @param {object} input - Transformation input
 * @param {string} input.xml - XML source document
 * @param {string} input.xsl - XSLT 3.0, 2.0 or 1.0 stylesheet
 * @param {{ name: string, value: string }[]} [input.params] - Stylesheet parameters
 * @param {object} env - Environment
 * @param {object} env.lib - @tradik/xslt3
 * @param {typeof DOMParser} env.DOMParser - DOMParser constructor
 * @param {() => number} [env.now] - Clock in milliseconds
 * @returns {Xslt3Result} The result
 */
export function transform3({ xml, xsl, params = [] }, env) {
  const { lib } = env;
  const now = env.now ?? (() => Date.now());
  const parseXml = (text) =>
    new env.DOMParser().parseFromString(text, "application/xml");
  const messages = [];
  const result = {
    output: null,
    method: "xml",
    declared: false,
    secondary: [],
    messages,
    ms: 0,
  };
  const source = parseXml(xml);
  const xmlError = parseError(source);
  if (xmlError) {
    messages.push({ level: "error", text: `XML source: ${xmlError}` });
    return result;
  }
  const xslError = parseError(parseXml(xsl));
  if (xslError) {
    messages.push({ level: "error", text: `XSLT stylesheet: ${xslError}` });
    return result;
  }

  const started = now();
  try {
    const stylesheet = lib.compileStylesheet(xsl, { parseXml });
    const run = stylesheet.transform({
      source,
      params: untypedParams(params, lib),
      onMessage: (message) =>
        messages.push({ level: "message", text: messageText(message) }),
    });
    result.output = lib.serialize([run.principal].flat(), run.output);
    result.method = run.output.method;
    result.declared = Boolean(stylesheet.output.method);
    result.secondary = [...run.secondary].map(
      ([href, { document, output }]) => ({
        href,
        method: output.method,
        output: lib.serialize([document].flat(), output),
      }),
    );
  } catch (error) {
    messages.push(errorMessage(error, xsl));
  }
  result.ms = now() - started;
  return result;
}
