/**
 * Pure helpers of the assertions: error code matching, string values,
 * XPath regular expressions and the XPath expressions that the
 * value-checking assertions are evaluated as.
 *
 * @module test-suites/lib/assertionText
 */

/**
 * Local part of an error code given as an EQName, a lexical QName or an
 * NCName: `Q{http://www.w3.org/2005/xqt-errors}FOER0000`, `err:FOER0000`
 * and `FOER0000` are all `FOER0000`.
 *
 * @param {string|undefined} code - Error code
 * @returns {string} The local part, "" when absent
 */
export function errorLocalName(code) {
  if (!code) return "";
  return code.replace(/^Q\{[^}]*\}/, "").replace(/^[^:]*:/, "");
}

/**
 * Whether an error code matches an expected one (`*` matches any error).
 *
 * @param {string} expected - Expected code or "*"
 * @param {string|undefined} actual - Code of the raised error
 * @returns {boolean} True on a match
 */
export function errorCodeMatches(expected, actual) {
  return (
    expected === "*" || errorLocalName(expected) === errorLocalName(actual)
  );
}

/**
 * Compare a string value with the expected one of `assert-string-value`.
 *
 * @param {string} actual - String value of the result
 * @param {string} expected - Expected text
 * @param {boolean} normalizeSpace - Whether to normalize whitespace first
 * @returns {boolean} True when equal
 */
export function stringValueMatches(actual, expected, normalizeSpace) {
  const normalize = (text) =>
    normalizeSpace ? text.replace(/[ \t\r\n]+/g, " ").trim() : text;
  return normalize(actual) === normalize(expected);
}

/**
 * Translate an XPath regular expression and its flags to a JavaScript one:
 * `q` quotes the pattern, `x` removes whitespace outside character classes,
 * `s`, `m` and `i` keep their meaning.
 *
 * @param {string} pattern - XPath regular expression
 * @param {string} [flags] - XPath flags
 * @returns {RegExp} The equivalent JavaScript regular expression
 * @throws {SyntaxError} When the pattern is invalid
 */
export function toRegExp(pattern, flags = "") {
  let source = pattern;
  if (flags.includes("q")) {
    source = source.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&");
  } else if (flags.includes("x")) {
    source = source.replace(/\[[^\]]*\]|\s+/g, (match) =>
      match.startsWith("[") ? match : "",
    );
  }
  const jsFlags = [...new Set(flags.replace(/[^smi]/g, ""))].join("") + "u";
  return new RegExp(source, jsFlags);
}

/**
 * Whether serialized output matches `serialization-matches`.
 *
 * @param {string} serialized - Serialized result
 * @param {string} pattern - XPath regular expression
 * @param {string} [flags] - XPath flags
 * @returns {boolean} True when the pattern matches somewhere in the output
 */
export function serializationMatches(serialized, pattern, flags) {
  return toRegExp(pattern, flags).test(serialized);
}

/**
 * Whether serialized output equals the expected text of
 * `assert-serialization` (line endings normalized, outer whitespace ignored,
 * and an XML declaration the expected text does not show: a difference a
 * conformant serializer may produce).
 *
 * @param {string} serialized - Serialized result
 * @param {string} expected - Expected text
 * @returns {boolean} True when equal
 */
export function serializationEquals(serialized, expected) {
  const normalize = (text) => text.replace(/\r\n?/g, "\n").trim();
  const wanted = normalize(expected);
  let actual = normalize(serialized);
  if (!wanted.startsWith("<?xml ")) {
    actual = actual.replace(/^<\?xml [^?]*\?>\s*/, "");
  }
  return actual === wanted;
}

/**
 * The XPath expression, with the result bound to `$result`, that decides a
 * value-checking assertion; it returns a single xs:boolean.
 *
 * @param {import('./assertionModel.mjs').Assertion} assertion - Assertion
 * @returns {string|null} The expression, null for other kinds
 */
export function assertionExpression({ kind, value }) {
  const expr = value.trim();
  switch (kind) {
    case "assert":
      return `boolean(${expr})`;
    case "assert-eq":
      return (
        `count($result) eq 1 and $result instance of xs:anyAtomicType ` +
        `and deep-equal($result, (${expr}))`
      );
    case "assert-deep-eq":
      return `deep-equal($result, (${expr}))`;
    case "assert-permutation":
      return (
        `let $expected := (${expr}) return count($result) eq count($expected) ` +
        `and (every $item in $result satisfies ` +
        `count($result[deep-equal(., $item)]) eq count($expected[deep-equal(., $item)]))`
      );
    case "assert-type":
      return `$result instance of ${expr}`;
    case "assert-true":
      return `$result instance of xs:boolean and $result`;
    case "assert-false":
      return `$result instance of xs:boolean and not($result)`;
    case "assert-empty":
      return `empty($result)`;
    case "assert-count":
      return `count($result) eq ${Number.parseInt(expr, 10)}`;
    default:
      return null;
  }
}
