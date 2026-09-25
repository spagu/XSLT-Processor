/**
 * Attribute value templates (XSLT 1.0 section 7.6.2).
 *
 * An AVT is literal text with XPath expressions in curly braces. A brace
 * inside a string literal of an expression is part of the literal, so the
 * template is split with a small scanner that knows '...' and "..." literals;
 * `{{` and `}}` outside expressions stand for single braces. A lone `}` in the
 * literal text is an error in the recommendation; it is kept as a character
 * instead, like browsers do. Parsed templates are cached per string.
 *
 * @module xslt/avt
 */

"use strict";

/**
 * @typedef {string | {expr: string}} AvtPart
 * A literal text part, or an expression part.
 */

const cache = new Map();

/**
 * Find the `}` closing an expression that starts at `start`.
 *
 * @param {string} value - The whole template
 * @param {number} start - Index just after the opening `{`
 * @returns {number} Index of the closing `}`
 * @throws {Error} When the expression is not closed
 */
function closingBrace(value, start) {
  let quote = null;
  for (let i = start; i < value.length; i++) {
    const char = value[i];
    if (quote) {
      if (char === quote) quote = null;
    } else if (char === "'" || char === '"') {
      quote = char;
    } else if (char === "}") {
      return i;
    }
  }
  throw new Error(`Unclosed expression in attribute value template: ${value}`);
}

/**
 * Split an attribute value template into literal and expression parts.
 *
 * @param {string} value - The attribute value
 * @returns {AvtPart[]} The parts, adjacent literals merged
 * @throws {Error} When an expression is not closed
 *
 * @example
 * parseAvt("a{@b}c"); // ["a", { expr: "@b" }, "c"]
 */
export function parseAvt(value) {
  let parts = cache.get(value);
  if (parts) return parts;

  parts = [];
  let text = "";
  let i = 0;
  while (i < value.length) {
    const char = value[i];
    if ((char === "{" || char === "}") && value[i + 1] === char) {
      text += char;
      i += 2;
    } else if (char === "{") {
      const end = closingBrace(value, i + 1);
      if (text) parts.push(text);
      text = "";
      parts.push({ expr: value.slice(i + 1, end) });
      i = end + 1;
    } else {
      text += char;
      i++;
    }
  }
  if (text) parts.push(text);

  cache.set(value, parts);
  return parts;
}

/**
 * Evaluate an attribute value template.
 *
 * @param {string} value - The attribute value
 * @param {(expr: string) => string} evaluate - Evaluates one expression to a string
 * @returns {string} The resulting text
 *
 * @example
 * evaluateAvt("{1+1}px", (e) => String(eval(e))); // "2px"
 */
export function evaluateAvt(value, evaluate) {
  if (!value.includes("{") && !value.includes("}")) return value;

  let result = "";
  for (const part of parseAvt(value)) {
    result += typeof part === "string" ? part : evaluate(part.expr);
  }
  return result;
}
