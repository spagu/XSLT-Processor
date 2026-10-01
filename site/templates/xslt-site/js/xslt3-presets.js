/**
 * Example stylesheets of the playground's XSLT 3.0 mode: grouping and a
 * Muenchian 1.0 stylesheet rewritten here, the others in
 * xslt3-presets-text.js and xslt3-presets-more.js. site/scripts/xslt3.test.mjs
 * runs every example and checks its output.
 *
 * @module xslt3-presets
 */

import { presets as xslt1Presets } from "./presets.js";
import { moreXslt3Presets, stylesheetStart } from "./xslt3-presets-more.js";
import { textXslt3Presets } from "./xslt3-presets-text.js";

const salesXml = `<?xml version="1.0" encoding="UTF-8"?>
<sales>
  <sale city="Kraków" product="Green tea" amount="38.00"/>
  <sale city="Gdańsk" product="Teapot" amount="64.90"/>
  <sale city="Kraków" product="Green tea" amount="19.00"/>
  <sale city="Wrocław" product="Oolong" amount="31.50"/>
  <sale city="Kraków" product="Ceramic cup" amount="18.00"/>
  <sale city="Gdańsk" product="Green tea" amount="28.50"/>
</sales>`;

const groupByXsl = `${stylesheetStart()}
  <xsl:output method="html" html-version="5" indent="yes"/>

  <xsl:template match="/sales">
    <html>
      <body style="font-family: system-ui, sans-serif">
        <h1>Sales by city</h1>
        <!-- One group per distinct @city; no keys, no generate-id(). -->
        <xsl:for-each-group select="sale" group-by="@city">
          <xsl:sort select="current-grouping-key()"/>
          <h2>{current-grouping-key()}: {format-number(sum(current-group()/@amount), '0.00')}</h2>
          <ul>
            <xsl:for-each-group select="current-group()" group-by="@product">
              <li>{current-grouping-key()} × {count(current-group())}</li>
            </xsl:for-each-group>
          </ul>
        </xsl:for-each-group>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>`;

const articleXml = `<?xml version="1.0" encoding="UTF-8"?>
<article>
  <para>Brewing green tea takes three things:</para>
  <item>water at 75 °C,</item>
  <item>two grams of leaves per cup,</item>
  <item>two minutes.</item>
  <para>Black tea is less delicate:</para>
  <item>boiling water,</item>
  <item>four minutes.</item>
  <para>Either way, warm the pot first.</para>
</article>`;

const groupAdjacentXsl = `${stylesheetStart()}
  <xsl:output method="html" html-version="5" indent="yes"/>

  <xsl:template match="/article">
    <html>
      <body style="font-family: system-ui, sans-serif">
        <!-- Runs of neighbouring <item> elements become one list. -->
        <xsl:for-each-group select="*" group-adjacent="exists(self::item)">
          <xsl:choose>
            <xsl:when test="current-grouping-key()">
              <ul>
                <xsl:for-each select="current-group()"><li>{.}</li></xsl:for-each>
              </ul>
            </xsl:when>
            <xsl:otherwise>
              <xsl:for-each select="current-group()"><p>{.}</p></xsl:for-each>
            </xsl:otherwise>
          </xsl:choose>
        </xsl:for-each-group>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>`;

const muenchianXsl = `${stylesheetStart()}
  <xsl:output method="html" html-version="5" indent="yes"/>

  <!-- The XSLT 1.0 example "Grouping with xsl:key" needs a key and
       generate-id() to find the first person of each department:

         <xsl:key name="by-dept" match="person" use="@dept"/>
         <xsl:for-each select="person[generate-id() =
             generate-id(key('by-dept', @dept)[1])]">

       In XSLT 3.0 one instruction does it. -->
  <xsl:template match="/staff">
    <html>
      <body style="font-family: system-ui, sans-serif">
        <h1>Staff by department</h1>
        <xsl:for-each-group select="person" group-by="@dept">
          <xsl:sort select="current-grouping-key()"/>
          <h2>{current-grouping-key()} ({count(current-group())})</h2>
          <ul>
            <xsl:for-each select="current-group()">
              <xsl:sort select="since" data-type="number"/>
              <li>{name}, since {since}</li>
            </xsl:for-each>
          </ul>
        </xsl:for-each-group>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>`;

/** The staff document of the XSLT 1.0 grouping example. */
const staffXml = xslt1Presets.find((p) => p.id === "grouping").xml;

/**
 * The examples, in menu order.
 *
 * @type {{ id: string, label: string, xml: string, xsl: string, params: { name: string, value: string }[] }[]}
 */
export const xslt3Presets = [
  {
    id: "group-by",
    label: "for-each-group group-by: totals per city",
    xml: salesXml,
    xsl: groupByXsl,
    params: [],
  },
  {
    id: "group-adjacent",
    label: "for-each-group group-adjacent: lists from runs of items",
    xml: articleXml,
    xsl: groupAdjacentXsl,
    params: [],
  },
  ...textXslt3Presets,
  ...moreXslt3Presets,
  {
    id: "muenchian",
    label: "1.0 stylesheet in 3.0: Muenchian grouping rewritten",
    xml: staffXml,
    xsl: muenchianXsl,
    params: [],
  },
];
