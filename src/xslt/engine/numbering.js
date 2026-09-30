/**
 * xsl:number (XSLT 1.0 section 7.7) and the number formatting helpers.
 *
 * Methods installed on XsltEngine.prototype (`this` is the engine).
 */

import { countXsltNumber, isMemoizable } from "../number.js";
import { formatXsltNumber, toRoman } from "../numberFormat.js";

/**
 * The numbers an xsl:number instruction formats: its rounded `value`, else
 * the position of the current node counted by level, count and from.
 *
 * @param {object} engine - The engine
 * @param {Element} node - The xsl:number instruction
 * @param {XsltContext} context - The current context
 * @returns {number[]} The numbers
 */
function numberValues(engine, node, context) {
  const value = node.getAttribute("value");
  if (value) {
    const number = Math.round(
      engine.xpathEvaluator.toNumber(engine.evaluateXPath(value, context)),
    );
    // An error that libxslt reports and recovers from by numbering 0
    if (number < 0) {
      engine.warnOnce("xsl:number: negative value, 0 is used");
    }
    return [number];
  }

  const count = node.getAttribute("count");
  const from = node.getAttribute("from");
  return countXsltNumber(
    context.currentNode,
    { level: node.getAttribute("level") || "single", count, from },
    (candidate, pattern) => engine.matchesPattern(candidate, pattern, context),
    isMemoizable(count, from) ? engine.numberMemo(node) : null,
  );
}

export const numberingMethods = {
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
    const format = this.optionalAvt(node, "format", context) || "1";
    const grouping = {
      separator: this.optionalAvt(node, "grouping-separator", context),
      size: Number(this.optionalAvt(node, "grouping-size", context)),
    };
    const numbers = numberValues(this, node, context);

    const text = context.outputDocument.createTextNode(
      formatXsltNumber(numbers, format, grouping),
    );
    output.appendChild(text);
  },

  /**
   * The memo of an xsl:number instruction for the current transformation
   * (see number.js), so numbering a long list stays linear.
   *
   * @param {Element} node - The xsl:number instruction
   * @returns {Map} The instruction's memo
   */
  numberMemo(node) {
    this.numberMemos ??= new WeakMap();
    let memo = this.numberMemos.get(node);
    if (!memo) {
      memo = new Map();
      this.numberMemos.set(node, memo);
    }
    return memo;
  },

  /**
   * Format a single number with an `xsl:number` format token.
   *
   * @param {number} number - The number to format
   * @param {string} format - The format token, e.g. `1`, `01`, `a`, `I`
   * @returns {string} The formatted number
   */
  formatNumber(number, format) {
    return formatXsltNumber([number], format);
  },

  /**
   * Convert a number to an upper case Roman numeral.
   *
   * @param {number} num - The number to convert
   * @returns {string} The Roman numeral
   */
  toRoman(num) {
    return toRoman(num);
  },
};
