/**
 * Names and arities of the functions of XPath and XQuery Functions and
 * Operators 3.1 (fn:, math:, map:, array:), used by static analysis to tell
 * a known function from an unknown one (XPST0017) before every function
 * has an implementation registered. A function listed here but missing from
 * the function library compiles, and raises XPST0017 "not implemented" when
 * it is called.
 *
 * @module @tradik/xslt3/functions/signatures
 */

/** Namespace URIs of the function libraries. */
export const NS = Object.freeze({
  fn: "http://www.w3.org/2005/xpath-functions",
  math: "http://www.w3.org/2005/xpath-functions/math",
  map: "http://www.w3.org/2005/xpath-functions/map",
  array: "http://www.w3.org/2005/xpath-functions/array",
});

/**
 * Per namespace: "name arities" entries; arities are "1", "0-2", "2,5" or
 * "2+" (variadic).
 */
const CATALOG = {
  fn: `abs 1|adjust-date-to-timezone 1-2|adjust-dateTime-to-timezone 1-2|
adjust-time-to-timezone 1-2|analyze-string 2-3|apply 2|
available-environment-variables 0|avg 1|base-uri 0-1|boolean 1|ceiling 1|
codepoint-equal 2|codepoints-to-string 1|collation-key 1-2|collection 0-1|
compare 2-3|concat 2+|contains 2-3|contains-token 2-3|count 1|current-date 0|
current-dateTime 0|current-time 0|data 0-1|dateTime 2|day-from-date 1|
day-from-dateTime 1|days-from-duration 1|deep-equal 2-3|default-collation 0|
default-language 0|distinct-values 1-2|doc 1|doc-available 1|document-uri 0-1|
element-with-id 1-2|empty 1|encode-for-uri 1|ends-with 2-3|
environment-variable 1|error 0-3|escape-html-uri 1|exactly-one 1|exists 1|
false 0|filter 2|floor 1|fold-left 3|fold-right 3|for-each 2|for-each-pair 3|
format-date 2,5|format-dateTime 2,5|format-integer 2-3|format-number 2-3|
format-time 2,5|function-arity 1|function-lookup 2|function-name 1|
generate-id 0-1|has-children 0-1|head 1|hours-from-dateTime 1|
hours-from-duration 1|hours-from-time 1|id 1-2|idref 1-2|implicit-timezone 0|
in-scope-prefixes 1|index-of 2-3|innermost 1|insert-before 3|iri-to-uri 1|
json-doc 1-2|json-to-xml 1-2|lang 1-2|last 0|load-xquery-module 1-2|
local-name 0-1|local-name-from-QName 1|lower-case 1|matches 2-3|max 1-2|
min 1-2|minutes-from-dateTime 1|minutes-from-duration 1|minutes-from-time 1|
month-from-date 1|month-from-dateTime 1|months-from-duration 1|name 0-1|
namespace-uri 0-1|namespace-uri-for-prefix 2|namespace-uri-from-QName 1|
nilled 0-1|node-name 0-1|normalize-space 0-1|normalize-unicode 1-2|not 1|
number 0-1|one-or-more 1|outermost 1|parse-ietf-date 1|parse-json 1-2|
parse-xml 1|parse-xml-fragment 1|path 0-1|position 0|prefix-from-QName 1|
QName 2|random-number-generator 0-1|remove 2|replace 3-4|resolve-QName 2|
resolve-uri 1-2|reverse 1|root 0-1|round 1-2|round-half-to-even 1-2|
seconds-from-dateTime 1|seconds-from-duration 1|seconds-from-time 1|
serialize 1-2|sort 1-3|starts-with 2-3|static-base-uri 0|string 0-1|
string-join 1-2|string-length 0-1|string-to-codepoints 1|subsequence 2-3|
substring 2-3|substring-after 2-3|substring-before 2-3|sum 1-2|tail 1|
timezone-from-date 1|timezone-from-dateTime 1|timezone-from-time 1|
tokenize 1-3|trace 1-2|transform 1|translate 3|true 0|unordered 1|
unparsed-text 1-2|unparsed-text-available 1-2|unparsed-text-lines 1-2|
upper-case 1|uri-collection 0-1|xml-to-json 1-2|year-from-date 1|
year-from-dateTime 1|years-from-duration 1|zero-or-one 1`,
  math: `acos 1|asin 1|atan 1|atan2 2|cos 1|exp 1|exp10 1|log 1|log10 1|pi 0|
pow 2|sin 1|sqrt 1|tan 1`,
  map: `contains 2|entry 2|find 2|for-each 2|get 2|keys 1|merge 1-2|put 3|
remove 2|size 1`,
  array: `append 2|filter 2|flatten 1|fold-left 3|fold-right 3|for-each 2|
for-each-pair 3|get 2|head 1|insert-before 3|join 1|put 3|remove 2|reverse 1|
size 1|sort 1-3|subarray 2-3|tail 1`,
};

/**
 * Parses an arity specification.
 * @param {string} spec - "1", "0-2", "2,5" or "2+"
 * @returns {(arity: number) => boolean} membership test
 */
function aritySet(spec) {
  if (spec.endsWith("+")) {
    const min = Number(spec.slice(0, -1));
    return (arity) => arity >= min;
  }
  const allowed = new Set();
  for (const part of spec.split(",")) {
    const [low, high = low] = part.split("-").map(Number);
    for (let n = low; n <= high; n++) allowed.add(n);
  }
  return (arity) => allowed.has(arity);
}

/** @type {Map<string, (arity: number) => boolean>} by Clark name */
const known = new Map();
for (const [prefix, text] of Object.entries(CATALOG)) {
  for (const entry of text.replace(/\n/g, "").split("|")) {
    const [name, spec] = entry.split(" ");
    known.set(`{${NS[prefix]}}${name}`, aritySet(spec));
  }
}

/**
 * Whether F&O 3.1 defines a function with this name and arity.
 * @param {string} namespace - Namespace URI
 * @param {string} local - Local name
 * @param {number} arity - Number of arguments
 * @returns {boolean}
 */
export function isStandardFunction(namespace, local, arity) {
  return known.get(`{${namespace}}${local}`)?.(arity) ?? false;
}
