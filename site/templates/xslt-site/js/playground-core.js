/**
 * Playground core: parse the two documents, run the transformation with
 * @tradik/xslt-processor and describe the result. It has no DOM wiring of its
 * own, so it runs unchanged in the page and under Node.js with jsdom
 * (site/scripts/playground.test.mjs).
 *
 * @module playground-core
 */

/**
 * @typedef {object} TransformResult
 * @property {string|null} output - transformToString() result, null on failure
 * @property {string} method - Output method: html, xhtml, xml or text
 * @property {boolean} declared - Whether xsl:output declared the method
 * @property {{ level: string, text: string }[]} messages - Parse errors,
 *   warnings and xsl:message output, in order
 * @property {number} ms - Duration of the transformation in milliseconds
 */

/**
 * The parse error of a document produced by DOMParser, or null. Browsers and
 * jsdom report errors as a <parsererror> element instead of throwing.
 *
 * @param {Document} doc - Parsed document
 * @returns {string|null} The error text
 */
export function parseError(doc) {
  const error = doc.getElementsByTagName("parsererror")[0];
  if (!error) return null;
  // Chrome wraps its message in "This page contains the following errors:"
  // and "Below is a rendering of the page up to the first error."
  const text = error.textContent
    .replace(/\s+/g, " ")
    .replace(/^\s*This page contains the following errors:\s*/, "")
    .replace(
      /\s*Below is a rendering of the page up to the first error\.?\s*$/,
      "",
    )
    .trim();
  return text || "Not well-formed XML";
}

/**
 * The output method of a result: the one xsl:output declares, otherwise the
 * XSLT 1.0 default rule (html when the result starts with an <html> element
 * in no namespace, xml otherwise).
 *
 * @param {object|undefined} settings - The engine's collected xsl:output settings
 * @param {string} output - Serialized result
 * @returns {{ method: string, declared: boolean }} The method
 */
export function outputMethod(settings, output) {
  const declared = settings && settings.method;
  if (declared && declared !== "auto") {
    return { method: String(declared), declared: true };
  }
  const start = output
    .replace(/^\s*(<\?[^>]*\?>\s*)?(<!DOCTYPE[^>]*>\s*)?/i, "")
    .slice(0, 6);
  const isHtml =
    /^<html[\s>/]/i.test(start) && !/xmlns=/.test(output.slice(0, 200));
  return { method: isHtml ? "html" : "xml", declared: false };
}

/**
 * Run console output produced by `fn` into a message list instead of the
 * console: xsl:message, recoverable stylesheet errors and transformation
 * failures are all reported that way by the library.
 *
 * @param {object} console - The console to intercept
 * @param {Function} fn - Work to run
 * @returns {{ value: *, messages: { level: string, text: string }[] }} Result
 */
export function captureConsole(console, fn) {
  const messages = [];
  const levels = { log: "message", warn: "warning", error: "error" };
  const original = {};
  for (const [name, level] of Object.entries(levels)) {
    original[name] = console[name];
    console[name] = (...args) => {
      const text = args
        .map((arg) => (arg instanceof Error ? arg.message : String(arg)))
        .join(" ")
        .replace(/^XSLT Message:\s*/, "");
      messages.push({ level, text });
    };
  }
  try {
    return { value: fn(), messages };
  } finally {
    Object.assign(console, original);
  }
}

/**
 * Transform an XML string with an XSLT string.
 *
 * @param {object} input - Transformation input
 * @param {string} input.xml - XML source document
 * @param {string} input.xsl - XSLT stylesheet
 * @param {{ name: string, value: string }[]} [input.params] - Top-level parameters
 * @param {object} env - Environment
 * @param {object} env.lib - The library (the XsltProcessorLib global)
 * @param {typeof DOMParser} env.DOMParser - DOMParser constructor
 * @param {() => number} [env.now] - Clock in milliseconds
 * @returns {TransformResult} The result
 */
export function transform({ xml, xsl, params = [] }, env) {
  const { lib, DOMParser } = env;
  const now = env.now ?? (() => Date.now());
  const parser = new DOMParser();
  const failed = (text) => ({
    output: null,
    method: "xml",
    declared: false,
    messages: [{ level: "error", text }],
    ms: 0,
  });

  const xmlDoc = parser.parseFromString(xml, "application/xml");
  const xmlError = parseError(xmlDoc);
  if (xmlError) return failed(`XML source: ${xmlError}`);
  const xslDoc = parser.parseFromString(xsl, "application/xml");
  const xslError = parseError(xslDoc);
  if (xslError) return failed(`XSLT stylesheet: ${xslError}`);

  const started = now();
  const { value, messages } = captureConsole(globalThis.console, () => {
    const processor = new lib.XSLTProcessor();
    try {
      // importStylesheet throws for a stylesheet that is not valid XSLT 1.0.
      processor.importStylesheet(xslDoc);
    } catch (error) {
      return { output: null, error: `XSLT stylesheet: ${error.message}` };
    }
    for (const { name, value: paramValue } of params) {
      if (name.trim()) processor.setParameter(null, name.trim(), paramValue);
    }
    const output = processor.transformToString(xmlDoc);
    return {
      output,
      settings: processor.engine && processor.engine.outputSettings,
    };
  });
  if (value.error) messages.push({ level: "error", text: value.error });
  const output = value.output;
  const { method, declared } = outputMethod(value.settings, output ?? "");
  if (output === null && !messages.some((m) => m.level === "error")) {
    messages.push({ level: "error", text: "The transformation failed." });
  }
  return { output, method, declared, messages, ms: now() - started };
}

/**
 * Wrap text output in a minimal HTML document for the preview frame, so XML
 * and text results are shown as source rather than rendered.
 *
 * @param {string} output - Serialized result
 * @param {string} method - Output method
 * @returns {string} HTML for the iframe srcdoc
 */
export function previewDocument(output, method) {
  if (method === "html" || method === "xhtml") return output;
  const escaped = output
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<!DOCTYPE html><meta charset="utf-8"><pre style="white-space:pre-wrap;font:14px/1.5 ui-monospace,monospace;margin:1rem">${escaped}</pre>`;
}
