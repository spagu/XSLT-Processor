/**
 * XPath 3.1 syntax: the parser from expression text to an AST.
 *
 * ```js
 * import { parseXPath } from "./xpath/syntax/index.js";
 * parseXPath("for $x in 1 to 3 return $x * 2");
 * // { type: "ForExpr", bindings: [...], returnExpr: {...}, start: 0, end: 30 }
 * ```
 *
 * The node types are documented in ast.js and typeAst.js.
 *
 * @module @tradik/xslt3/xpath/syntax
 */

import { parseExpr } from "./expressions.js";
import { TokenStream } from "./tokenStream.js";

/** XPath versions the parser accepts as `xpathVersion`. */
const VERSIONS = new Set(["3.1"]);

/**
 * Parses an XPath 3.1 expression.
 *
 * @param {string} expression - The expression text
 * @param {object} [options] - Options
 * @param {"3.1"} [options.xpathVersion] - Language version, "3.1" (the only
 *   one so far). TODO: "2.0" / "3.0" could reject the newer constructs
 *   (maps, arrays, `=>`, `!`, `||`, let, inline functions) here.
 * @returns {import("./ast.js").Expr} The root of the AST
 * @throws {import("../../errors.js").XPathError} XPST0003 on a syntax error
 *   (the message gives the offset and an excerpt), XPTY0004 for a
 *   processing-instruction() test whose string is not an NCName
 * @throws {RangeError} For an unsupported `xpathVersion`
 */
export function parseXPath(expression, options = {}) {
  const { xpathVersion = "3.1" } = options;
  if (!VERSIONS.has(xpathVersion)) {
    throw new RangeError(`Unsupported XPath version: ${xpathVersion}`);
  }
  const p = new TokenStream(String(expression), { xpathVersion });
  const expr = parseExpr(p);
  if (p.peek().type !== "eof") p.fail("Unexpected token");
  return expr;
}
