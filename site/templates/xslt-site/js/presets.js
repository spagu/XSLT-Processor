/**
 * Example transformations offered by the playground. Each one shows a
 * different part of XSLT 1.0 and a different output method.
 *
 * @module presets
 */

const catalogXml = `<?xml version="1.0" encoding="UTF-8"?>
<catalog>
  <cd>
    <title>Empire Burlesque</title>
    <artist>Bob Dylan</artist>
    <country>USA</country>
    <price>10.90</price>
    <year>1985</year>
  </cd>
  <cd>
    <title>Hide your heart</title>
    <artist>Bonnie Tyler</artist>
    <country>UK</country>
    <price>9.90</price>
    <year>1988</year>
  </cd>
  <cd>
    <title>Greatest Hits</title>
    <artist>Dolly Parton</artist>
    <country>USA</country>
    <price>9.90</price>
    <year>1982</year>
  </cd>
  <cd>
    <title>Still got the blues</title>
    <artist>Gary Moore</artist>
    <country>UK</country>
    <price>10.20</price>
    <year>1990</year>
  </cd>
  <cd>
    <title>Eros</title>
    <artist>Eros Ramazzotti</artist>
    <country>EU</country>
    <price>9.90</price>
    <year>1997</year>
  </cd>
</catalog>`;

const catalogXsl = `<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:output method="html" indent="yes"/>

  <!-- Change these in the Parameters section. -->
  <xsl:param name="heading" select="'My CD collection'"/>
  <xsl:param name="max-price" select="100"/>

  <xsl:template match="/catalog">
    <html>
      <head><title><xsl:value-of select="$heading"/></title></head>
      <body style="font-family: system-ui, sans-serif">
        <h1><xsl:value-of select="$heading"/></h1>
        <table border="1" cellpadding="6">
          <tr><th>Title</th><th>Artist</th><th>Year</th><th>Price</th></tr>
          <xsl:apply-templates select="cd[price &lt;= $max-price]">
            <xsl:sort select="year" data-type="number"/>
          </xsl:apply-templates>
        </table>
        <p>
          <xsl:value-of select="count(cd[price &lt;= $max-price])"/> of
          <xsl:value-of select="count(cd)"/> albums, total
          <xsl:value-of select="format-number(sum(cd[price &lt;= $max-price]/price), '#,##0.00')"/>
        </p>
      </body>
    </html>
  </xsl:template>

  <xsl:template match="cd">
    <tr>
      <td><xsl:value-of select="title"/></td>
      <td><xsl:value-of select="artist"/></td>
      <td><xsl:value-of select="year"/></td>
      <td><xsl:value-of select="price"/></td>
    </tr>
  </xsl:template>
</xsl:stylesheet>`;

const staffXml = `<?xml version="1.0" encoding="UTF-8"?>
<staff>
  <person dept="Engineering"><name>Ada</name><since>2019</since></person>
  <person dept="Sales"><name>Grace</name><since>2021</since></person>
  <person dept="Engineering"><name>Linus</name><since>2020</since></person>
  <person dept="Support"><name>Margaret</name><since>2018</since></person>
  <person dept="Sales"><name>Alan</name><since>2022</since></person>
  <person dept="Engineering"><name>Barbara</name><since>2023</since></person>
</staff>`;

const groupingXsl = `<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:output method="html" indent="yes"/>

  <!-- Muenchian grouping: index people by department, then visit the
       first person of each department only. -->
  <xsl:key name="by-dept" match="person" use="@dept"/>

  <xsl:template match="/staff">
    <html>
      <body style="font-family: system-ui, sans-serif">
        <h1>Staff by department</h1>
        <xsl:for-each select="person[generate-id() = generate-id(key('by-dept', @dept)[1])]">
          <xsl:sort select="@dept"/>
          <h2>
            <xsl:value-of select="@dept"/>
            (<xsl:value-of select="count(key('by-dept', @dept))"/>)
          </h2>
          <ul>
            <xsl:for-each select="key('by-dept', @dept)">
              <xsl:sort select="since" data-type="number"/>
              <li><xsl:value-of select="name"/>, since <xsl:value-of select="since"/></li>
            </xsl:for-each>
          </ul>
        </xsl:for-each>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>`;

const ordersXml = `<?xml version="1.0" encoding="UTF-8"?>
<orders>
  <order id="A-17" tags="books, gifts, sale" total="42.50"/>
  <order id="A-18" tags="music, sale" total="17.00"/>
  <order id="A-19" tags="books, music" total="63.20"/>
</orders>`;

const exsltXsl = `<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0"
    xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
    xmlns:exsl="http://exslt.org/common"
    xmlns:str="http://exslt.org/strings"
    xmlns:set="http://exslt.org/sets"
    xmlns:math="http://exslt.org/math"
    extension-element-prefixes="exsl"
    exclude-result-prefixes="exsl str set math">
  <xsl:output method="xml" indent="yes"/>

  <xsl:template match="/orders">
    <!-- str:tokenize splits the comma separated tags into <token> nodes. -->
    <xsl:variable name="tags-rtf">
      <xsl:for-each select="order">
        <xsl:copy-of select="str:tokenize(@tags, ', ')"/>
      </xsl:for-each>
    </xsl:variable>
    <!-- exsl:node-set turns the result tree fragment back into nodes. -->
    <xsl:variable name="tags" select="exsl:node-set($tags-rtf)/token"/>

    <report largest="{math:max(order/@total)}" orders="{count(order)}">
      <xsl:for-each select="set:distinct($tags)">
        <xsl:sort select="."/>
        <tag name="{.}" uses="{count($tags[. = current()])}"/>
      </xsl:for-each>
    </report>
  </xsl:template>
</xsl:stylesheet>`;

const csvXsl = `<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <!-- method="text" writes the text nodes only, without escaping. -->
  <xsl:output method="text"/>
  <xsl:param name="separator" select="';'"/>

  <xsl:template match="/catalog">
    <xsl:text>title</xsl:text><xsl:value-of select="$separator"/>
    <xsl:text>artist</xsl:text><xsl:value-of select="$separator"/>
    <xsl:text>price&#10;</xsl:text>
    <xsl:for-each select="cd">
      <xsl:value-of select="title"/><xsl:value-of select="$separator"/>
      <xsl:value-of select="artist"/><xsl:value-of select="$separator"/>
      <xsl:value-of select="price"/><xsl:text>&#10;</xsl:text>
    </xsl:for-each>
  </xsl:template>
</xsl:stylesheet>`;

/**
 * The examples, in menu order.
 *
 * @type {{ id: string, label: string, xml: string, xsl: string, params: { name: string, value: string }[] }[]}
 */
export const presets = [
  {
    id: "catalog",
    label: "CD catalog: sorting, parameters, HTML output",
    xml: catalogXml,
    xsl: catalogXsl,
    params: [
      { name: "heading", value: "Albums under 10.00" },
      { name: "max-price", value: "10" },
    ],
  },
  {
    id: "grouping",
    label: "Grouping with xsl:key (Muenchian method)",
    xml: staffXml,
    xsl: groupingXsl,
    params: [],
  },
  {
    id: "exslt",
    label: "EXSLT: str:tokenize, exsl:node-set, set:distinct, math:max",
    xml: ordersXml,
    xsl: exsltXsl,
    params: [],
  },
  {
    id: "csv",
    label: "CSV export: text output method",
    xml: catalogXml,
    xsl: csvXsl,
    params: [{ name: "separator", value: "," }],
  },
];
