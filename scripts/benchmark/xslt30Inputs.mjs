/**
 * Inputs of the XSLT 3.0-only benchmark scenarios: tasks that XSLT 1.0
 * cannot express directly (grouping of adjacent items, regular
 * expressions, iteration with state, JSON, maps, higher-order functions,
 * accumulators, merging). Generated deterministically like inputs.mjs;
 * a scenario may pass string parameters (`params`) to the stylesheet.
 *
 * @module scripts/benchmark/xslt30Inputs
 */

import { INPUTS } from "./inputs.mjs";
import { random, repeat } from "./xml.mjs";
import { JSON_INPUTS } from "./xsltJson.mjs";
import { stylesheet3 } from "./xsltRewrites.mjs";

/** The 1.0 identity input: 29,000 records, about 5 MB. */
const records = () => INPUTS.identity().xml;

/** 50,000 entries in runs of 1 to 10 of the same type, grouped by run. */
function groupAdjacent() {
  const next = random(17);
  let type = 0;
  let left = 0;
  const entries = repeat(50000, (i) => {
    if (left-- <= 0) {
      type = (type + 1 + Math.floor(next() * 3)) % 4;
      left = Math.floor(next() * 10);
    }
    return `<e t="t${type}" n="${i}"/>`;
  });
  return {
    xml: `<log>${entries}</log>`,
    xsl: stylesheet3(
      '<xsl:template match="/"><runs><xsl:for-each-group select="log/e" group-adjacent="@t">' +
        '<run t="{current-grouping-key()}" n="{count(current-group())}" first="{current-group()[1]/@n}"/>' +
        "</xsl:for-each-group></runs></xsl:template>",
    ),
  };
}

/** A log of about 5 MB: one line per event, a level and a message. */
function logText() {
  const next = random(19);
  const levels = ["INFO", "INFO", "INFO", "DEBUG", "WARN", "ERROR"];
  return repeat(75000, (i) => {
    const level = levels[Math.floor(next() * levels.length)];
    const time = `2026-09-${String(1 + (i % 30)).padStart(2, "0")}T${String(i % 24).padStart(2, "0")}:00:${String(i % 60).padStart(2, "0")}Z`;
    return `${time} ${level} svc-${Math.floor(next() * 40)} request ${i} took ${Math.floor(next() * 900)} ms\n`;
  });
}

/** xsl:analyze-string picking the WARN and ERROR lines of the log. */
function analyzeString() {
  return {
    xml: `<log>${logText()}</log>`,
    xsl: stylesheet3(
      '<xsl:template match="/"><events><xsl:analyze-string select="log" regex="^(\\S+) (WARN|ERROR) (\\S+) (.*)$" flags="m">' +
        '<xsl:matching-substring><e at="{regex-group(1)}" level="{regex-group(2)}" svc="{regex-group(3)}">' +
        '<xsl:value-of select="regex-group(4)"/></e></xsl:matching-substring>' +
        "</xsl:analyze-string></events></xsl:template>",
    ),
  };
}

/** xsl:iterate printing an exact decimal running total of 100,000 amounts. */
function iterateTotals() {
  const next = random(23);
  const items = repeat(
    100000,
    () => `<item amount="${(next() * 200 - 50).toFixed(2)}"/>`,
  );
  return {
    xml: `<list>${items}</list>`,
    xsl: stylesheet3(
      '<xsl:template match="/"><xsl:iterate select="list/item">' +
        '<xsl:param name="total" select="0" as="xs:decimal"/>' +
        '<xsl:variable name="t" select="$total + xs:decimal(@amount)"/>' +
        '<xsl:value-of select="$t"/><xsl:text>&#10;</xsl:text>' +
        '<xsl:next-iteration><xsl:with-param name="total" select="$t"/></xsl:next-iteration>' +
        "</xsl:iterate></xsl:template>",
      "text",
    ),
  };
}

/**
 * Generators by input set name; `params` are string stylesheet parameters.
 *
 * @type {Readonly<Record<string, () => {xml: string, xsl: string, params?: Record<string, string>}>>}
 */
export const XSLT30_INPUTS = Object.freeze({
  groupAdjacent,
  analyzeString,
  iterateTotals,
  ...JSON_INPUTS,
  maps: () => ({
    xml: "<r/>",
    xsl: stylesheet3(
      '<xsl:template match="/"><xsl:variable name="m" select="map:merge(for $i in 1 to 100000 return map { \'k\' || $i: $i * 2 })"/>' +
        '<result size="{map:size($m)}" sum="{sum(for $i in 1 to 100000 return $m(\'k\' || ($i * 7919 mod 100000 + 1)))}"/></xsl:template>',
    ),
  }),
  ...higherOrder(),
  accumulators: () => ({
    xml: records(),
    xsl: stylesheet3(
      '<xsl:mode use-accumulators="#all"/>' +
        '<xsl:accumulator name="count" as="xs:integer" initial-value="0"><xsl:accumulator-rule match="record" select="$value + 1"/></xsl:accumulator>' +
        '<xsl:accumulator name="kg" as="xs:decimal" initial-value="0"><xsl:accumulator-rule match="value" phase="end" select="$value + xs:decimal(.)"/></xsl:accumulator>' +
        '<xsl:template match="/"><totals><xsl:for-each select="records/record[@type = \'t0\']">' +
        '<t id="{@id}" n="{accumulator-before(\'count\')}" kg="{accumulator-after(\'kg\')}"/>' +
        "</xsl:for-each></totals></xsl:template>",
    ),
  }),
  merge,
});

/** Higher-order functions: sort() with a key, fold-left into a map. */
function higherOrder() {
  const xml = () => INPUTS.sortTwoKeys().xml;
  return {
    hofSort: () => ({
      xml: xml(),
      xsl: stylesheet3(
        '<xsl:template match="/"><xsl:value-of select="sort(list/item, (), function($i) { number($i/@price) }) ! string(@price)"/></xsl:template>',
        "text",
      ),
    }),
    foldLeft: () => ({
      xml: xml(),
      xsl: stylesheet3(
        '<xsl:template match="/"><xsl:variable name="totals" select="fold-left(list/item, map {}, ' +
          'function($m, $i) { map:put($m, string($i/@cat), ($m(string($i/@cat)), 0)[1] + xs:decimal($i/@price)) })"/>' +
          '<xsl:for-each select="sort(map:keys($totals))"><c name="{.}" total="{$totals(.)}"/></xsl:for-each></xsl:template>',
      ),
    }),
  };
}

/** xsl:merge of two sources of 50,000 items each, sorted by an integer key. */
function merge() {
  const next = random(31);
  const side = () => {
    let key = 0;
    return repeat(50000, () => {
      key += Math.floor(next() * 3);
      return `<item k="${key}"/>`;
    });
  };
  return {
    xml: `<r><a>${side()}</a><b>${side()}</b></r>`,
    xsl: stylesheet3(
      '<xsl:template match="/"><xsl:merge>' +
        '<xsl:merge-source name="a" select="r/a/item"><xsl:merge-key select="xs:integer(@k)"/></xsl:merge-source>' +
        '<xsl:merge-source name="b" select="r/b/item"><xsl:merge-key select="xs:integer(@k)"/></xsl:merge-source>' +
        "<xsl:merge-action><xsl:value-of select=\"current-merge-key(), count(current-merge-group('a')), count(current-merge-group('b'))\"/>" +
        "<xsl:text>&#10;</xsl:text></xsl:merge-action></xsl:merge></xsl:template>",
      "text",
    ),
  };
}
