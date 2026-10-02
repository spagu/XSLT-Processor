/**
 * The XSLT 1.0 benchmark tasks (inputs.mjs) written idiomatically in XSLT
 * 2.0/3.0 for @tradik/xslt3: the same source document, the same expected
 * output, a different stylesheet. Each rewrite replaces the 1.0 workaround
 * with the construct made for it:
 *
 * - Muenchian grouping (keys + generate-id) → `xsl:for-each-group`;
 * - `xsl:number level="any"` → a running count in `xsl:iterate`;
 * - recursive `xsl:call-template` → `xsl:iterate`;
 * - two `xsl:sort` keys → `sort()` with a key function;
 * - the identity template → `xsl:mode on-no-match="shallow-copy"`.
 *
 * @module scripts/benchmark/xsltRewrites
 */

import { catalogStylesheet } from "./catalog.mjs";
import { INPUTS } from "./inputs.mjs";

/** Namespaces every 3.0 stylesheet of the benchmark declares. */
const NAMESPACES =
  'xmlns:xsl="http://www.w3.org/1999/XSL/Transform" ' +
  'xmlns:xs="http://www.w3.org/2001/XMLSchema" ' +
  'xmlns:map="http://www.w3.org/2005/xpath-functions/map" ' +
  'xmlns:array="http://www.w3.org/2005/xpath-functions/array" ' +
  'xmlns:fn="http://www.w3.org/2005/xpath-functions" ' +
  'exclude-result-prefixes="#all"';

/**
 * Wrap top-level elements in an XSLT 3.0 stylesheet.
 *
 * @param {string} body - Top-level elements
 * @param {string} [method="xml"] - Output method
 * @returns {string} The stylesheet
 */
export function stylesheet3(body, method = "xml") {
  return (
    `<xsl:stylesheet version="3.0" ${NAMESPACES}>` +
    `<xsl:output method="${method}"/>${body}</xsl:stylesheet>`
  );
}

/**
 * Replace every listed fragment of a text, failing when one is missing
 * (so a change of the 1.0 stylesheet cannot silently break a rewrite).
 *
 * @param {string} text - Text
 * @param {Array<[string, string]>} pairs - [from, to] pairs
 * @returns {string} The text with every fragment replaced
 * @throws {Error} When a fragment does not occur
 */
export function replaceAll(text, pairs) {
  return pairs.reduce((result, [from, to]) => {
    if (!result.includes(from)) throw new Error(`Missing fragment: ${from}`);
    return result.replaceAll(from, to);
  }, text);
}

/** The issue #9 catalogue grouped with xsl:for-each-group. */
function catalog() {
  const xsl = replaceAll(catalogStylesheet(), [
    ['version="1.0"', 'version="3.0"'],
    ['<xsl:key name="byCategory" match="course" use="@category"/>', ""],
    [
      "<xsl:for-each select=\"course[generate-id() = generate-id(key('byCategory', @category)[1])]\">",
      '<xsl:for-each-group select="course" group-by="@category">',
    ],
    ["key('byCategory', @category)", "current-group()"],
    ["</xsl:for-each></body>", "</xsl:for-each-group></body>"],
  ]);
  return { xml: INPUTS.catalog().xml, xsl };
}

/** Muenchian grouping as xsl:for-each-group. */
function muenchian() {
  return {
    xml: INPUTS.muenchian().xml,
    xsl: stylesheet3(
      '<xsl:template match="/"><groups><xsl:for-each-group select="list/item" group-by="@group">' +
        '<g name="{current-grouping-key()}" count="{count(current-group())}" sum="{sum(current-group()/@v)}"/>' +
        "</xsl:for-each-group></groups></xsl:template>",
    ),
  };
}

/** xsl:number level="any" as a running count in xsl:iterate. */
function numberAny() {
  return {
    xml: INPUTS.numberAny().xml,
    xsl: stylesheet3(
      '<xsl:template match="/"><xsl:iterate select="r/i"><xsl:param name="n" select="0"/>' +
        '<xsl:variable name="m" select="if (@k = \'1\') then $n + 1 else $n"/>' +
        '<xsl:value-of select="$m"/><xsl:text> </xsl:text>' +
        '<xsl:next-iteration><xsl:with-param name="n" select="$m"/></xsl:next-iteration>' +
        "</xsl:iterate></xsl:template>",
      "text",
    ),
  };
}

/** Two sort keys as sort() with a key function (descending by negation). */
function sortTwoKeys() {
  return {
    xml: INPUTS.sortTwoKeys().xml,
    xsl: stylesheet3(
      '<xsl:template match="/"><xsl:for-each select="sort(list/item, (), function($i) { string($i/@cat), -number($i/@price) })">' +
        '<xsl:value-of select="@cat, @price"/><xsl:text>&#10;</xsl:text>' +
        "</xsl:for-each></xsl:template>",
      "text",
    ),
  };
}

/** The identity transform as a mode that copies what no template matches. */
function identity() {
  return {
    xml: INPUTS.identity().xml,
    xsl: stylesheet3('<xsl:mode on-no-match="shallow-copy"/>'),
  };
}

/** call-template recursion 3,000 deep as xsl:iterate. */
function recursion3000() {
  return {
    xml: INPUTS.recursion3000().xml,
    xsl: stylesheet3(
      '<xsl:template match="/"><xsl:iterate select="reverse(1 to 2998)">' +
        '<xsl:value-of select="."/><xsl:text> </xsl:text>' +
        "</xsl:iterate></xsl:template>",
      "text",
    ),
  };
}

/**
 * Rewrite generators by input set name (the same names as the 1.0 inputs).
 *
 * @type {Readonly<Record<string, () => {xml: string, xsl: string}>>}
 */
export const REWRITES = Object.freeze({
  catalog,
  muenchian,
  numberAny,
  sortTwoKeys,
  identity,
  recursion3000,
});
