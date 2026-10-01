/**
 * XPath 3.1 mode of the playground: parse the variable and namespace
 * lines, evaluate an expression with @tradik/xslt3 against an XML document
 * and describe every item of the result (its type and a readable value).
 *
 * It has no DOM wiring of its own and gets the library, DOMParser and
 * XMLSerializer from its caller, so it runs unchanged in the page and under
 * Node.js with jsdom (site/scripts/xpath.test.mjs).
 *
 * @module xpath-core
 */

import { parseError } from "./playground-core.js";
import { describeItem } from "./xpath-items.js";

/**
 * @typedef {object} XPathResult
 * @property {import("./xpath-items.js").ResultItem[]|null} items - The
 *   result sequence, null on failure
 * @property {{ code: string|null, message: string }|null} error - The
 *   failure: a W3C error code (XPST0003...) when the engine gave one
 * @property {number} ms - Duration of the evaluation in milliseconds
 */

/**
 * The value of a variable line: integers become xs:integer, other numbers
 * xs:double, text in single or double quotes and everything else xs:string.
 *
 * @param {string} text - The text after "="
 * @returns {string|number|bigint} The JavaScript value for @tradik/xslt3
 */
export function variableValue(text) {
  const quoted = /^(["'])(.*)\1$/s.exec(text);
  if (quoted) return quoted[2];
  if (/^[+-]?\d+$/.test(text)) return BigInt(text);
  if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(text)) return Number(text);
  return text;
}

/**
 * Parse "name=value" lines. Blank lines and lines starting with # are
 * skipped; spaces around the name and the value are dropped.
 *
 * @param {string} text - One binding per line
 * @param {string} label - Field name for error messages ("Variables")
 * @returns {{ bindings: { name: string, value: string }[], error: string|null }}
 *   The bindings in order, or the first malformed line
 */
export function parseBindings(text, label) {
  const bindings = [];
  const lines = text.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    const name = eq < 0 ? "" : trimmed.slice(0, eq).trim().replace(/^\$/, "");
    if (!name) {
      return {
        bindings: [],
        error: `${label}, line ${index + 1}: expected name=value`,
      };
    }
    bindings.push({ name, value: trimmed.slice(eq + 1).trim() });
  }
  return { bindings, error: null };
}

/**
 * Evaluate an XPath 3.1 expression against an XML document.
 *
 * @param {object} input - Evaluation input
 * @param {string} input.xml - XML document, the context item ("" for none)
 * @param {string} input.expression - XPath 3.1 expression
 * @param {string} [input.variables] - name=value lines
 * @param {string} [input.namespaces] - prefix=uri lines
 * @param {object} env - Environment
 * @param {object} env.lib - @tradik/xslt3
 * @param {typeof DOMParser} env.DOMParser - DOMParser constructor
 * @param {typeof XMLSerializer} env.XMLSerializer - XMLSerializer constructor
 * @param {() => number} [env.now] - Clock in milliseconds
 * @returns {XPathResult} The result
 */
export function evaluate(
  { xml, expression, variables = "", namespaces = "" },
  env,
) {
  const failed = (message, code = null) => ({
    items: null,
    error: { code, message },
    ms: 0,
  });
  let doc;
  if (xml.trim()) {
    doc = new env.DOMParser().parseFromString(xml, "application/xml");
    const xmlError = parseError(doc);
    if (xmlError) return failed(`XML source: ${xmlError}`);
  }
  const vars = parseBindings(variables, "Variables");
  if (vars.error) return failed(vars.error);
  const ns = parseBindings(namespaces, "Namespaces");
  if (ns.error) return failed(ns.error);

  const now = env.now ?? (() => Date.now());
  const started = now();
  try {
    const result = env.lib.evaluateXPath(expression, doc, {
      variables: Object.fromEntries(
        vars.bindings.map(({ name, value }) => [name, variableValue(value)]),
      ),
      namespaces: Object.fromEntries(
        ns.bindings.map(({ name, value }) => [name, value]),
      ),
    });
    const ms = now() - started;
    const describe = { lib: env.lib, serializer: new env.XMLSerializer() };
    return {
      items: result.map((item) => describeItem(item, describe)),
      error: null,
      ms,
    };
  } catch (error) {
    const code = error.code ?? null;
    const message = code
      ? error.message.replace(`${code}: `, "")
      : error.message;
    return failed(message, code);
  }
}
