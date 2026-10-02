/**
 * JSON inputs of the XSLT 3.0-only benchmark scenarios: about 5 MB of
 * JSON read with json-to-xml() and parse-json(), and written with
 * xml-to-json() and the json output method.
 *
 * @module scripts/benchmark/xsltJson
 */

import { INPUTS } from "./inputs.mjs";
import { random } from "./xml.mjs";
import { stylesheet3 } from "./xsltRewrites.mjs";

/**
 * About 5 MB of JSON: 37,500 orders with a customer, a total and lines.
 *
 * @returns {string} JSON text
 */
export function ordersJson() {
  const next = random(29);
  const orders = Array.from({ length: 37500 }, (_, i) => ({
    id: `o${i}`,
    customer: `Customer ${Math.floor(next() * 5000)}`,
    paid: next() < 0.8,
    total: Math.round(next() * 100000) / 100,
    lines: Array.from({ length: 1 + Math.floor(next() * 3) }, () => ({
      sku: `SKU-${Math.floor(next() * 9000) + 1000}`,
      qty: 1 + Math.floor(next() * 5),
    })),
  }));
  return JSON.stringify({ shop: "bench", orders });
}

/**
 * The XML representation of JSON (XPath 3.1 section 17.5) of a value, as
 * json-to-xml() would return it.
 *
 * @param {*} value - A parsed JSON value
 * @param {string} [extra=""] - Attributes of the outermost element
 * @param {string} [key] - Its key in the enclosing object
 * @returns {string} XML
 */
export function jsonAsXml(value, extra = "", key) {
  const keyAttr = key === undefined ? "" : ` key="${key}"`;
  const element = (name, content) =>
    `<${name}${keyAttr}${extra}>${content}</${name}>`;
  if (value === null) return `<null${keyAttr}${extra}/>`;
  if (Array.isArray(value)) {
    return element("array", value.map((item) => jsonAsXml(item)).join(""));
  }
  if (typeof value === "object") {
    const entries = Object.entries(value);
    return element(
      "map",
      entries.map(([k, v]) => jsonAsXml(v, "", k)).join(""),
    );
  }
  if (typeof value === "string") return element("string", value);
  return element(typeof value === "number" ? "number" : "boolean", value);
}

/** Summary of the orders in the XML form of JSON (json-to-xml). */
const JSON_TO_XML =
  '<xsl:param name="json" as="xs:string"/><xsl:template match="/">' +
  '<xsl:variable name="orders" select="json-to-xml($json)/fn:map/fn:array/fn:map"/>' +
  "<summary orders=\"{count($orders)}\" paid=\"{count($orders[fn:boolean[@key = 'paid'] = 'true'])}\" " +
  'lines="{count($orders/fn:array/fn:map)}" total="{sum($orders/fn:number[@key = \'total\'])}"/></xsl:template>';

/** The same summary from maps and arrays (parse-json). */
const PARSE_JSON =
  '<xsl:param name="json" as="xs:string"/><xsl:template match="/">' +
  '<xsl:variable name="orders" select="parse-json($json)?orders?*"/>' +
  '<summary orders="{count($orders)}" paid="{count($orders[?paid])}" ' +
  'lines="{count($orders?lines?*)}" total="{sum($orders?total)}"/></xsl:template>';

/**
 * JSON scenarios by input set name (see xslt30Inputs.mjs).
 *
 * @type {Readonly<Record<string, () => {xml: string, xsl: string, params?: Record<string, string>}>>}
 */
export const JSON_INPUTS = Object.freeze({
  jsonToXml: () => ({
    xml: "<r/>",
    xsl: stylesheet3(JSON_TO_XML),
    params: { json: ordersJson() },
  }),
  parseJson: () => ({
    xml: "<r/>",
    xsl: stylesheet3(PARSE_JSON),
    params: { json: ordersJson() },
  }),
  xmlToJson: () => ({
    xml: jsonAsXml(
      JSON.parse(ordersJson()),
      ' xmlns="http://www.w3.org/2005/xpath-functions"',
    ),
    xsl: stylesheet3(
      '<xsl:template match="/"><xsl:value-of select="xml-to-json(.)"/></xsl:template>',
      "text",
    ),
  }),
  // serialize() with the json method inside a text result: a principal
  // result that is a map or array (xsl:output method="json", a raw result)
  // is not supported by @tradik/xslt3 yet (XTDE0450).
  jsonOutput: () => ({
    xml: INPUTS.identity().xml,
    xsl: stylesheet3(
      '<xsl:template match="/"><xsl:value-of select="serialize(array { records/record ! map { ' +
        "'id': string(@id), 'type': string(@type), 'name': string(name), 'value': number(value) } }, map { 'method': 'json' })\"/></xsl:template>",
      "text",
    ),
  }),
});
