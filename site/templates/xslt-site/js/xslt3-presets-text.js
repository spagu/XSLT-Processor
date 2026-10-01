/**
 * Example stylesheets of the playground's XSLT 3.0 mode that work on text
 * and values: xsl:analyze-string, xsl:function, text value templates and
 * xsl:iterate. The menu is assembled in xslt3-presets.js.
 *
 * @module xslt3-presets-text
 */

import { stylesheetStart } from "./xslt3-presets-more.js";

const logXml = `<?xml version="1.0" encoding="UTF-8"?>
<log>
  <line>2026-09-30 10:15:02 INFO [cart] Order 1001 created</line>
  <line>2026-09-30 10:15:09 ERROR [payment] Card declined for order 1001</line>
  <line>2026-09-30 10:16:44 WARN [stock] Green tea below 10 packs</line>
  <line>malformed entry</line>
</log>`;

const analyzeXsl = `${stylesheetStart()}
  <xsl:output method="html" html-version="5" indent="yes"/>

  <xsl:template match="/log">
    <table border="1" cellpadding="6" style="font-family: system-ui, sans-serif">
      <tr><th>Time</th><th>Level</th><th>Component</th><th>Message</th></tr>
      <xsl:apply-templates select="line"/>
    </table>
  </xsl:template>

  <xsl:template match="line">
    <!-- regex is an attribute value template: {{2}} stands for {2}. -->
    <xsl:analyze-string select="."
        regex="^\\d{{4}}-\\d{{2}}-\\d{{2}} (\\d{{2}}:\\d{{2}}):\\d{{2}} (\\w+) \\[(\\w+)\\] (.+)$">
      <xsl:matching-substring>
        <tr>
          <td>{regex-group(1)}</td>
          <td>{regex-group(2)}</td>
          <td>{regex-group(3)}</td>
          <td>{regex-group(4)}</td>
        </tr>
      </xsl:matching-substring>
      <xsl:non-matching-substring>
        <tr><td colspan="4">Not a log line: {.}</td></tr>
      </xsl:non-matching-substring>
    </xsl:analyze-string>
  </xsl:template>
</xsl:stylesheet>`;

const basketXml = `<?xml version="1.0" encoding="UTF-8"?>
<basket>
  <item sku="TEA-GRN-100" qty="2" net="9.50"/>
  <item sku="CUP-CER-02" qty="1" net="18.00"/>
  <item sku="POT-IRN-08" qty="1" net="64.90"/>
</basket>`;

const functionXsl = `${stylesheetStart(`
    xmlns:shop="urn:example:shop"`)}
  <xsl:output method="xml" indent="yes"/>

  <!-- Parameter values are typed: "0.08" becomes the xs:decimal 0.08. -->
  <xsl:param name="vat-rate" as="xs:decimal" select="0.23"/>

  <!-- A function with typed parameters and a typed result. -->
  <xsl:function name="shop:gross" as="xs:decimal">
    <xsl:param name="net" as="xs:decimal"/>
    <xsl:param name="qty" as="xs:integer"/>
    <xsl:sequence select="round($net * $qty * (1 + $vat-rate), 2)"/>
  </xsl:function>

  <xsl:template match="/basket">
    <invoice vat-rate="{$vat-rate}">
      <xsl:for-each select="item">
        <line sku="{@sku}" gross="{shop:gross(@net, @qty)}"/>
      </xsl:for-each>
      <total>{sum(item ! shop:gross(@net, @qty))}</total>
    </invoice>
  </xsl:template>
</xsl:stylesheet>`;

const letterXml = `<?xml version="1.0" encoding="UTF-8"?>
<order id="1002" date="2026-04-02">
  <customer>Ben Okafor</customer>
  <item qty="6" price="21.00">Black tea, 500 g</item>
</order>`;

const tvtXsl = `${stylesheetStart()}
  <xsl:output method="text"/>

  <!-- expand-text="yes" turns {...} in text into expressions;
       {{ and }} are literal braces. -->
  <xsl:template match="/order">
Dear {customer},

thank you for order {@id} of {format-date(xs:date(@date), '[D1o] [MNn] [Y]')}.
{item/@qty} × {item} = {format-number(item/@qty * item/@price, '0.00')} EUR
It ships within {if (item/@qty > 5) then 3 else 1} working days.

Template syntax: {{expression}}
</xsl:template>
</xsl:stylesheet>`;

const accountXml = `<?xml version="1.0" encoding="UTF-8"?>
<account opening="120.00">
  <tx date="2026-09-01" amount="-45.20">Groceries</tx>
  <tx date="2026-09-03" amount="1500.00">Salary</tx>
  <tx date="2026-09-07" amount="-820.00">Rent</tx>
  <tx date="2026-09-12" amount="-64.90">Teapot</tx>
</account>`;

const iterateXsl = `${stylesheetStart()}
  <xsl:output method="html" html-version="5" indent="yes"/>

  <xsl:template match="/account">
    <table border="1" cellpadding="6" style="font-family: system-ui, sans-serif">
      <tr><th>Date</th><th>Entry</th><th>Amount</th><th>Balance</th></tr>
      <!-- xsl:iterate carries $balance from one item to the next,
           which xsl:for-each cannot do. -->
      <xsl:iterate select="tx">
        <xsl:param name="balance" as="xs:decimal" select="xs:decimal(@opening)"/>
        <xsl:on-completion>
          <tr><th colspan="3">Closing balance</th><th>{format-number($balance, '0.00')}</th></tr>
        </xsl:on-completion>
        <xsl:variable name="next" select="$balance + xs:decimal(@amount)"/>
        <tr>
          <td>{@date}</td><td>{.}</td><td>{@amount}</td><td>{format-number($next, '0.00')}</td>
        </tr>
        <xsl:next-iteration>
          <xsl:with-param name="balance" select="$next"/>
        </xsl:next-iteration>
      </xsl:iterate>
    </table>
  </xsl:template>
</xsl:stylesheet>`;

/** The examples of this part, in menu order. */
export const textXslt3Presets = [
  {
    id: "analyze-string",
    label: "xsl:analyze-string and regex-group(): parse a log",
    xml: logXml,
    xsl: analyzeXsl,
    params: [],
  },
  {
    id: "function",
    label: "xsl:function with typed parameters",
    xml: basketXml,
    xsl: functionXsl,
    params: [{ name: "vat-rate", value: "0.08" }],
  },
  {
    id: "tvt",
    label: "Text value templates (expand-text), text output",
    xml: letterXml,
    xsl: tvtXsl,
    params: [],
  },
  {
    id: "iterate",
    label: "xsl:iterate: a running balance",
    xml: accountXml,
    xsl: iterateXsl,
    params: [],
  },
];
