/**
 * Shared harness of the EXSLT test suites: runs XPath expressions through a
 * real stylesheet with every EXSLT prefix declared, so functions are found
 * the way a stylesheet finds them.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { XsltEngine } from "../engine.js";
import { parseXML, stylesheet } from "../harness.test.js";

/** Namespace declarations of the conventional EXSLT prefixes. */
export const EXSLT_PREFIXES = [
  'xmlns:exsl="http://exslt.org/common"',
  'xmlns:math="http://exslt.org/math"',
  'xmlns:set="http://exslt.org/sets"',
  'xmlns:str="http://exslt.org/strings"',
  'xmlns:date="http://exslt.org/dates-and-times"',
  'xmlns:dyn="http://exslt.org/dynamic"',
].join(" ");

/**
 * Escape text for a double-quoted XML attribute.
 *
 * @param {string} text - Raw text
 * @returns {string} The escaped text
 */
export function escapeAttribute(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

/**
 * Run a root template body with text output.
 *
 * @param {string} body - Content of the root template
 * @param {object} [options] - Options
 * @param {string} [options.xml] - Source document markup
 * @param {(engine: XsltEngine) => void} [options.configure] - Engine setup
 * @param {string} [options.method] - Output method
 * @returns {string} The serialized result
 */
export function runTemplate(
  body,
  { xml = "<d/>", configure, method = "text" } = {},
) {
  const engine = new XsltEngine();
  configure?.(engine);
  const xsl = stylesheet(
    `<xsl:template match="/">${body}</xsl:template>`,
    method,
    EXSLT_PREFIXES,
  );
  engine.importStylesheet(parseXML(xsl));
  return engine.transformToString(parseXML(xml));
}

/**
 * The string value of an expression, as `xsl:value-of` outputs it.
 *
 * @param {string} expression - XPath expression
 * @param {object} [options] - See {@link runTemplate}
 * @returns {string} The output
 */
export function valueOf(expression, options) {
  return runTemplate(
    `<xsl:value-of select="${escapeAttribute(expression)}"/>`,
    options,
  );
}

/**
 * Assert the `xsl:value-of` output of each `[expression, expected]` row.
 *
 * @param {Array<[string, string]>} rows - Expressions and expected outputs
 * @param {object} [options] - See {@link runTemplate}
 */
export function assertValues(rows, options) {
  for (const [expression, expected] of rows) {
    assert.strictEqual(valueOf(expression, options), expected, expression);
  }
}

describe("EXSLT harness", () => {
  it("escapes attribute text", () => {
    assert.strictEqual(escapeAttribute(`a<"&`), "a&lt;&quot;&amp;");
  });

  it("evaluates with every EXSLT prefix declared", () => {
    assertValues([["math:abs(-2)", "2"]]);
  });
});
