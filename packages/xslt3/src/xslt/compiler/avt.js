/**
 * Attribute value templates (XSLT 3.0 section 5.6.1): literal text with
 * XPath expressions in curly brackets, `{{` and `}}` standing for single
 * brackets. Also used for text value templates.
 *
 * @module @tradik/xslt3/xslt/compiler/avt
 */

import { xsltError } from "../names.js";

/**
 * Finds the end of an expression in curly brackets, skipping string
 * literals, comments and nested brackets (map constructors).
 * @param {string} text
 * @param {number} start - Offset after the opening bracket
 * @returns {number} offset of the closing bracket
 * @throws {import("../../errors.js").XPathError} XTSE0350 when unclosed
 */
function closingBracket(text, start) {
  let depth = 0;
  let i = start;
  while (i < text.length) {
    const c = text[i];
    if (c === "'" || c === '"') {
      const end = text.indexOf(c, i + 1);
      if (end < 0) break;
      i = end + 1;
      continue;
    }
    if (c === "(" && text[i + 1] === ":") {
      let level = 0;
      while (i < text.length) {
        if (text.startsWith("(:", i)) (level++, (i += 2));
        else if (text.startsWith(":)", i)) {
          i += 2;
          if (--level === 0) break;
        } else i++;
      }
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      if (depth === 0) return i;
      depth--;
    }
    i++;
  }
  throw xsltError("XTSE0350", `Unclosed expression in "${text}"`);
}

/**
 * Removes the XPath comments (which nest) from a text.
 * @param {string} text
 * @returns {string}
 */
export function withoutComments(text) {
  let result = text;
  for (let previous = ""; previous !== result;) {
    previous = result;
    result = result.replace(/\(:(?:(?!\(:|:\))[^])*:\)/g, "");
  }
  return result;
}

/**
 * Splits an attribute value template.
 * @param {string} text
 * @returns {Array<string|{expr: string}>} literal parts and expressions
 * @throws {import("../../errors.js").XPathError} XTSE0350 for an unclosed
 *   expression, XTSE0370 for a lone closing bracket
 */
export function parseAvt(text) {
  const parts = [];
  let literal = "";
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === "{" && text[i + 1] === "{") {
      literal += "{";
      i += 2;
    } else if (c === "}" && text[i + 1] === "}") {
      literal += "}";
      i += 2;
    } else if (c === "}") {
      throw xsltError("XTSE0370", `Unescaped "}" in "${text}"`);
    } else if (c === "{") {
      const end = closingBracket(text, i + 1);
      const expr = text.slice(i + 1, end);
      // an empty expression (or only comments) stands for ""
      if (withoutComments(expr).trim() !== "") {
        if (literal) parts.push(literal);
        literal = "";
        parts.push({ expr });
      }
      i = end + 1;
    } else {
      literal += c;
      i++;
    }
  }
  if (literal || parts.length === 0) parts.push(literal);
  return parts;
}
