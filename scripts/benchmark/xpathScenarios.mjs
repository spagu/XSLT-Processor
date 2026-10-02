/**
 * Scenarios of the XPath benchmark (`npm run bench -- --suite xpath`):
 * XPath 1.0 of the root package against XPath 3.1 of @tradik/xslt3 on the
 * same generated document.
 *
 * A scenario evaluates its expression once with the document node as the
 * context item, or, with `contexts`, once per element of that name (a loop
 * in JavaScript, 20,000 or 1,000 evaluations per run). `SHARED_SCENARIOS`
 * mean the same in XPath 1.0 and 3.1 and run on both engines;
 * `XPATH31_SCENARIOS` use 3.1-only syntax or functions and run on xslt3.
 *
 * @module scripts/benchmark/xpathScenarios
 */

import { random, repeat } from "./xml.mjs";

/** Items in the benchmark document. */
export const XPATH_ITEMS = 20000;

/** Every DEEP_EVERY-th item holds a chain of DEEP_LEVELS nested elements. */
const DEEP_EVERY = 20;
const DEEP_LEVELS = 12;

/**
 * The benchmark document: `catalog/items/item` × 20,000, each with an `id`
 * (i0 ... i19999), a category `cat` (c00 ... c49), a `price` (0.00 to
 * 99.99) and a `name` (six letters a to f and a digit); every second item
 * has an `a` child, every third a `b` child, and every 20th a chain of 12
 * nested `d` elements ending in a `leaf`.
 *
 * @returns {string} The XML (about 2.4 MB)
 */
export function xpathDocument() {
  const next = random(31);
  const letter = () => "abcdef"[Math.floor(next() * 6)];
  const chain = `${"<d>".repeat(DEEP_LEVELS)}<leaf/>${"</d>".repeat(DEEP_LEVELS)}`;
  const items = repeat(XPATH_ITEMS, (i) => {
    const cat = `c${String(Math.floor(next() * 50)).padStart(2, "0")}`;
    const price = (next() * 100).toFixed(2);
    const name = `${repeat(6, letter)}${i % 10}`;
    return (
      `<item id="i${i}" cat="${cat}" price="${price}"><name>${name}</name>` +
      `${i % 2 ? "" : "<a/>"}${i % 3 ? "" : "<b/>"}` +
      `${i % DEEP_EVERY ? "" : chain}</item>`
    );
  });
  return `<catalog><items>${items}</items></catalog>`;
}

/**
 * @typedef {Object} XPathScenario
 * @property {string} id - Stable identifier (results-xpath.json key)
 * @property {string} label - Short label for charts and tables
 * @property {string} expression - The XPath expression
 * @property {string} [contexts] - Element name: evaluate once per element
 *   of that name instead of once on the document node
 */

/** @type {readonly XPathScenario[]} */
export const SHARED_SCENARIOS = Object.freeze([
  { id: "descendant", label: "//item", expression: "//item" },
  {
    id: "attributePredicate",
    label: "//item[@id = 'i10000']",
    expression: "//item[@id = 'i10000']",
  },
  { id: "last", label: "//item[last()]", expression: "//item[last()]" },
  { id: "position", label: "(//item)[1000]", expression: "(//item)[1000]" },
  {
    id: "countPredicate",
    label: "count(//item[@price > 50])",
    expression: "count(//item[@price > 50])",
  },
  {
    id: "sum",
    label: "sum(//item/@price)",
    expression: "sum(//item/@price)",
  },
  {
    id: "contains",
    label: "//item[contains(name, 'abc')]",
    expression: "//item[contains(name, 'abc')]",
  },
  { id: "union", label: "//a | //b", expression: "//a | //b" },
  {
    id: "followingSibling",
    label: "following-sibling::item[1] × 20,000",
    expression: "following-sibling::item[1]",
    contexts: "item",
  },
  {
    id: "ancestor",
    label: "ancestor::* from 1,000 deep nodes",
    expression: "ancestor::*",
    contexts: "leaf",
  },
  {
    id: "stringFunctions",
    label: "translate/concat/substring × 20,000",
    expression:
      "concat(translate(name, 'abcdef', 'ABCDEF'), '-', substring(@id, 2, 3))",
    contexts: "item",
  },
]);

/** @type {readonly XPathScenario[]} */
export const XPATH31_SCENARIOS = Object.freeze([
  {
    id: "flwor",
    label: "for + let over //item",
    expression:
      "for $x in //item return let $p := number($x/@price) return if ($p > 50) then string($x/@id) else ()",
  },
  {
    id: "groupSum",
    label: "distinct-values grouping + sum",
    expression:
      "for $c in distinct-values(//item/@cat) return sum(//item[@cat = $c]/@price)",
  },
  {
    id: "sortKey",
    label: "sort() with a key function",
    expression: "sort(//item, (), function($i) { number($i/@price) })",
  },
  {
    id: "mapMerge",
    label: "map:merge of 20,000 maps",
    expression: "map:merge(//item ! map { string(@id): number(@price) })",
  },
  {
    id: "stringJoin",
    label: "string-join(//item/@id)",
    expression: "string-join(//item/@id, ',')",
  },
  {
    id: "matches",
    label: "//item[matches(name, ...)]",
    expression: "//item[matches(name, '^[a-c]{3}')]",
  },
  {
    id: "tokenize",
    label: "tokenize(string-join(//name))",
    expression: "tokenize(string-join(//name, ' '), '\\s+')",
  },
  {
    id: "formatNumber",
    label: "format-number × 20,000",
    expression: "//item ! format-number(number(@price), '#,##0.00')",
  },
  {
    id: "foldLeft",
    label: "fold-left sum of //item/@price",
    expression: "fold-left(//item/@price, 0, function($a, $b) { $a + $b })",
  },
]);

/** Every scenario by id. */
export const XPATH_SCENARIOS = Object.freeze(
  Object.fromEntries(
    [...SHARED_SCENARIOS, ...XPATH31_SCENARIOS].map((s) => [s.id, s]),
  ),
);
