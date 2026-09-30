/**
 * Deterministic benchmark inputs: every XML document and stylesheet is
 * generated from a fixed seed, so both versions (and every machine)
 * transform exactly the same bytes. No network access, no fixtures.
 *
 * @module scripts/benchmark/inputs
 */

import { catalogStylesheet, catalogXml } from "./catalog.mjs";
import { random, repeat, stylesheet } from "./xml.mjs";

/** 8,000 items, every second one with an id, matched by `item[@id]`. */
function applyTemplates() {
  const items = repeat(8000, (i) =>
    i % 2 ? `<item id="i${i}">${i}</item>` : `<item>${i}</item>`,
  );
  return {
    xml: `<list>${items}</list>`,
    xsl: stylesheet(
      '<xsl:template match="/"><out><xsl:apply-templates select="list/item"/></out></xsl:template>' +
        '<xsl:template match="item[@id]"><a n="{@id}"><xsl:value-of select="."/></a></xsl:template>' +
        '<xsl:template match="item"><b><xsl:value-of select="."/></b></xsl:template>',
    ),
  };
}

/** 8,000 items in 200 groups, grouped with a key (Muenchian method). */
function muenchian() {
  const next = random(7);
  const items = repeat(
    8000,
    (i) => `<item group="g${Math.floor(next() * 200)}" v="${i % 97}"/>`,
  );
  return {
    xml: `<list>${items}</list>`,
    xsl: stylesheet(
      '<xsl:key name="g" match="item" use="@group"/>' +
        '<xsl:template match="/"><groups><xsl:for-each select="list/item[generate-id() = generate-id(key(\'g\', @group)[1])]">' +
        '<g name="{@group}" count="{count(key(\'g\', @group))}" sum="{sum(key(\'g\', @group)/@v)}"/>' +
        "</xsl:for-each></groups></xsl:template>",
    ),
  };
}

/** 8,000 `i` elements numbered with `level="any"` and a predicate count. */
function numberAny() {
  const items = repeat(8000, (i) => `<i k="${i % 3 === 0 ? 1 : 0}"/>`);
  return {
    xml: `<r>${items}</r>`,
    xsl: stylesheet(
      '<xsl:template match="/"><xsl:for-each select="r/i">' +
        '<xsl:number level="any" count="i[@k=\'1\']"/><xsl:text> </xsl:text>' +
        "</xsl:for-each></xsl:template>",
      "text",
    ),
  };
}

/** A loop reading `following-sibling::x[1]` of 8,000 siblings. */
function followingSibling() {
  return {
    xml: `<r>${repeat(8000, (i) => `<x n="${i}"/>`)}</r>`,
    xsl: stylesheet(
      '<xsl:template match="/"><xsl:for-each select="r/x">' +
        '<xsl:value-of select="following-sibling::x[1]/@n"/><xsl:text> </xsl:text>' +
        "</xsl:for-each></xsl:template>",
      "text",
    ),
  };
}

/** 20,000 items sorted by category (text) and price (number, descending). */
function sortTwoKeys() {
  const next = random(11);
  const items = repeat(20000, () => {
    const cat = `c${String(Math.floor(next() * 50)).padStart(2, "0")}`;
    return `<item cat="${cat}" price="${(next() * 1000).toFixed(2)}"/>`;
  });
  return {
    xml: `<list>${items}</list>`,
    xsl: stylesheet(
      '<xsl:template match="/"><xsl:for-each select="list/item">' +
        '<xsl:sort select="@cat"/><xsl:sort select="@price" data-type="number" order="descending"/>' +
        "<xsl:value-of select=\"concat(@cat, ' ', @price)\"/><xsl:text>&#10;</xsl:text>" +
        "</xsl:for-each></xsl:template>",
      "text",
    ),
  };
}

/** An identity transform of a document of about 5 MB. */
function identity() {
  const next = random(13);
  const records = repeat(
    29000,
    (i) =>
      `<record id="r${i}" type="t${i % 7}"><name>Record ${i}</name>` +
      `<value unit="kg">${(next() * 1e4).toFixed(3)}</value>` +
      `<note>Deterministic note text number ${i} for the identity benchmark.</note></record>`,
  );
  return {
    xml: `<records>${records}</records>`,
    xsl: stylesheet(
      '<xsl:template match="@*|node()"><xsl:copy><xsl:apply-templates select="@*|node()"/></xsl:copy></xsl:template>',
    ),
  };
}

/**
 * Recursive `xsl:call-template` reaching `depth` nested template
 * instantiations: the root template, then the named template with
 * n = depth - 2, ..., 0 (libxslt's and 1.2.0's limit is 3,000).
 *
 * @param {number} depth - Nested template instantiations
 */
function recursion(depth) {
  return {
    xml: "<r/>",
    xsl: stylesheet(
      `<xsl:template match="/"><xsl:call-template name="down"><xsl:with-param name="n" select="${depth - 2}"/></xsl:call-template></xsl:template>` +
        '<xsl:template name="down"><xsl:param name="n"/><xsl:if test="$n &gt; 0">' +
        '<xsl:value-of select="$n"/><xsl:text> </xsl:text><xsl:call-template name="down">' +
        '<xsl:with-param name="n" select="$n - 1"/></xsl:call-template></xsl:if></xsl:template>',
      "text",
    ),
  };
}

/**
 * A text result of `megabytes` MB: 1,000 × (megabytes × 10) lines of 100
 * characters, from a tiny source document.
 *
 * @param {number} megabytes - Result size in millions of characters
 */
function largeText(megabytes) {
  const line = `${"0123456789".repeat(9)}abcdefghi&#10;`;
  return {
    xml: `<r>${repeat(1000, () => "<a/>")}${repeat(megabytes * 10, () => "<b/>")}</r>`,
    xsl: stylesheet(
      `<xsl:variable name="line">${line}</xsl:variable>` +
        '<xsl:variable name="bs" select="/r/b"/>' +
        '<xsl:template match="/"><xsl:for-each select="r/a"><xsl:for-each select="$bs">' +
        '<xsl:value-of select="$line"/></xsl:for-each></xsl:for-each></xsl:template>',
      "text",
    ),
  };
}

/** Size of the large text result in MB (the largest both versions handle). */
export const LARGE_TEXT_MB = 100;

/**
 * Input generators by input set name.
 *
 * @type {Record<string, () => {xml: string, xsl: string}>}
 */
export const INPUTS = Object.freeze({
  catalog: () => ({ xml: catalogXml(), xsl: catalogStylesheet() }),
  applyTemplates,
  muenchian,
  numberAny,
  followingSibling,
  sortTwoKeys,
  identity,
  recursion900: () => recursion(900),
  recursion3000: () => recursion(3000),
  largeText: () => largeText(LARGE_TEXT_MB),
});
