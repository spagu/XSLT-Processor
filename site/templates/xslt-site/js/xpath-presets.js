/**
 * Example expressions of the playground's XPath 3.1 mode. Each one shows a
 * part of XPath 3.1 that XPath 1.0 does not have; site/scripts/xpath.test.mjs
 * runs every one of them and checks its result.
 *
 * @module xpath-presets
 */

const ordersXml = `<?xml version="1.0" encoding="UTF-8"?>
<orders>
  <order id="1001" customer="Ana Silva" date="2026-03-14" tags="priority, gift">
    <item sku="TEA-GRN-100" qty="2" price="9.50">Green tea, 100 g</item>
    <item sku="CUP-CER-02" qty="1" price="18.00">Ceramic cup</item>
  </order>
  <order id="1002" customer="Ben Okafor" date="2026-04-02" tags="wholesale">
    <item sku="TEA-BLK-500" qty="6" price="21.00">Black tea, 500 g</item>
  </order>
  <order id="1003" customer="Ana Silva" date="2026-05-20" tags="gift">
    <item sku="POT-IRN-08" qty="1" price="64.90">Cast iron teapot</item>
    <item sku="TEA-GRN-100" qty="3" price="9.50">Green tea, 100 g</item>
  </order>
  <order id="1004" customer="Chen Wei" date="2026-06-07" tags="priority">
    <item sku="TEA-OOL-250" qty="2" price="15.75">Oolong, 250 g</item>
  </order>
</orders>
`;

const feedXml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Release notes</title>
  <entry>
    <title>1.2.0: xsl:number and EXSLT dates</title>
    <updated>2026-09-30T10:00:00Z</updated>
  </entry>
  <entry>
    <title>1.1.0: command line tool</title>
    <updated>2026-08-12T08:30:00Z</updated>
  </entry>
</feed>
`;

/**
 * The amount of one order, used by several examples. Attributes are
 * untyped, so they are cast to xs:decimal for exact money arithmetic.
 */
const orderTotal = "sum($order/item/(xs:decimal(@qty) * xs:decimal(@price)))";

/**
 * @typedef {object} XPathPreset
 * @property {string} id - Stable id
 * @property {string} label - Menu label
 * @property {string} xml - XML document (the context item)
 * @property {string} expression - XPath 3.1 expression
 * @property {string} variables - name=value lines
 * @property {string} namespaces - prefix=uri lines
 */

/** @type {XPathPreset[]} */
export const xpathPresets = [
  {
    id: "flwor",
    label: "for and let: revenue per customer",
    xml: ordersXml,
    expression: `(: XPath has for and let; where and order by are XQuery :)
for $customer in distinct-values(//order/@customer)
return
  let $orders := //order[@customer = $customer],
      $revenue := sum(for $order in $orders return ${orderTotal})
  return $customer || ": " || $revenue || " from " || count($orders)
    || (if (count($orders) = 1) then " order" else " orders")`,
    variables: "",
    namespaces: "",
  },
  {
    id: "sort",
    label: "sort() with a key function",
    xml: ordersXml,
    expression: `(: The $top largest orders, largest first :)
let $total := function($order) { ${orderTotal} }
return subsequence(
  sort(//order, (), function($order) { -$total($order) }),
  1, $top
)`,
    variables: "top=2",
    namespaces: "",
  },
  {
    id: "maps",
    label: "Maps and lookups",
    xml: ordersXml,
    expression: `let $skus := map:merge(
  for $order in //order
  return map { string($order/@customer): $order/item/string(@sku) },
  map { "duplicates": "combine" }
)
return (
  $skus,
  $skus?("Ana Silva"),
  map:size($skus),
  [ "first", "second", "third" ]?2
)`,
    variables: "",
    namespaces: "",
  },
  {
    id: "strings",
    label: "string-join() and tokenize()",
    xml: ordersXml,
    expression: `for $order in //order
return
  let $tags := tokenize($order/@tags, ",\\s*")
  return $order/@id || ": " || string-join($tags ! upper-case(.), " | ")`,
    variables: "",
    namespaces: "",
  },
  {
    id: "regex",
    label: "Regular expressions: matches() and replace()",
    xml: ordersXml,
    expression: `for $sku in distinct-values(//item/@sku)[matches(., "^TEA-")]
return $sku || " = " || replace($sku, "^TEA-([A-Z]{3})-(\\d+)$", "$2 g of tea $1")`,
    variables: "",
    namespaces: "",
  },
  {
    id: "format",
    label: "format-date() and format-number()",
    xml: ordersXml,
    expression: `for $order in //order
return format-date(xs:date($order/@date), "[FNn], [D1o] [MNn] [Y]")
  || ": " || format-number(${orderTotal}, "#,##0.00")`,
    variables: "",
    namespaces: "",
  },
  {
    id: "arrow",
    label: "Arrow chains with =>",
    xml: ordersXml,
    expression: `(: Product families: the part of each SKU before the first hyphen :)
//item/@sku
  => for-each(function($sku) { substring-before($sku, "-") })
  => distinct-values()
  => sort()
  => string-join(", ")`,
    variables: "",
    namespaces: "",
  },
  {
    id: "fold",
    label: "Higher-order: fold-left()",
    xml: ordersXml,
    expression: `fold-left(//order, map {}, function($totals, $order) {
  let $customer := string($order/@customer)
  return map:put($totals, $customer,
    ($totals($customer), 0)[1] + ${orderTotal})
})`,
    variables: "",
    namespaces: "",
  },
  {
    id: "namespaces",
    label: "Namespaces and variables",
    xml: feedXml,
    expression: `//atom:entry[xs:dateTime(atom:updated) >= xs:dateTime($since)]
  ! map {
      "title": string(atom:title),
      "updated": xs:dateTime(atom:updated)
    }`,
    variables:
      '# Quotes are optional: unquoted text is a string too\nsince="2026-09-01T00:00:00Z"',
    namespaces: "atom=http://www.w3.org/2005/Atom",
  },
];
