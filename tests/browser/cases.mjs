/**
 * Representative stylesheets run in real browsers.
 *
 * Each case is run by the library (checked against `expect`) and, where the
 * browser still ships one, by the native XSLTProcessor (differential test).
 *
 * @typedef {Object} BrowserCase
 * @property {string} name - Short identifier, used in test titles
 * @property {string} xml - Source document
 * @property {string} xsl - Stylesheet
 * @property {Object<string, string|number>} [params] - setParameter values
 * @property {string[]} expect - Substrings the library's transformToString
 *   output must contain, in this order
 */

const XSL_NS = 'xmlns:xsl="http://www.w3.org/1999/XSL/Transform"';

/**
 * Wrap templates in an XSLT 1.0 stylesheet element.
 *
 * @param {string} body - Top-level elements
 * @param {string} [extra] - Extra attributes of xsl:stylesheet
 * @returns {string} Stylesheet source
 */
function stylesheet(body, extra = "") {
  return `<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" ${XSL_NS} ${extra}>${body}</xsl:stylesheet>`;
}

const BOOKS = `<books>
  <book id="b1" genre="poetry" price="12.50"><title>Pan Tadeusz</title><author>Mickiewicz</author></book>
  <book id="b2" genre="novel" price="8"><title>Lalka</title><author>Prus</author></book>
  <book id="b3" genre="poetry" price="30"><title>Dziady</title><author>Mickiewicz</author></book>
  <book id="b4" genre="drama" price="8"><title>Wesele</title><author>Wyspiański</author></book>
</books>`;

/** @type {BrowserCase[]} */
export const CASES = [
  {
    name: "sorting",
    xml: BOOKS,
    xsl: stylesheet(`
  <xsl:output method="xml" omit-xml-declaration="yes"/>
  <xsl:template match="/books">
    <list>
      <xsl:for-each select="book">
        <xsl:sort select="@price" data-type="number" order="descending"/>
        <xsl:sort select="title"/>
        <item price="{@price}"><xsl:value-of select="title"/></item>
      </xsl:for-each>
    </list>
  </xsl:template>`),
    expect: ["Dziady", "Pan Tadeusz", "Lalka", "Wesele"],
  },
  {
    name: "muenchian-grouping",
    xml: BOOKS,
    xsl: stylesheet(`
  <xsl:output method="xml" omit-xml-declaration="yes"/>
  <xsl:key name="byAuthor" match="book" use="author"/>
  <xsl:template match="/books">
    <authors>
      <xsl:for-each select="book[generate-id() = generate-id(key('byAuthor', author)[1])]">
        <xsl:sort select="author"/>
        <author name="{author}" count="{count(key('byAuthor', author))}">
          <xsl:for-each select="key('byAuthor', author)">
            <t><xsl:value-of select="title"/></t>
          </xsl:for-each>
        </author>
      </xsl:for-each>
    </authors>
  </xsl:template>`),
    expect: [
      '<author name="Mickiewicz" count="2">',
      '<author name="Prus" count="1">',
      '<author name="Wyspiański" count="1">',
    ],
  },
  {
    name: "xsl-number",
    xml: `<doc><chapter><title>A</title><section><title>A1</title></section><section><title>A2</title></section></chapter><chapter><title>B</title><section><title>B1</title></section></chapter></doc>`,
    xsl: stylesheet(`
  <xsl:output method="xml" omit-xml-declaration="yes"/>
  <xsl:template match="/doc">
    <toc>
      <xsl:for-each select="//section">
        <s any="{position()}">
          <xsl:number level="multiple" count="chapter|section" format="1.a "/>
          <xsl:number level="any" count="section" format="(i)"/>
          <xsl:value-of select="title"/>
        </s>
      </xsl:for-each>
      <xsl:number value="1999" format="I"/>
      <xsl:text> </xsl:text>
      <xsl:number value="1234567" grouping-separator="," grouping-size="3"/>
    </toc>
  </xsl:template>`),
    expect: ["1.a (i)A1", "1.b (ii)A2", "2.a (iii)B1", "MCMXCIX", "1,234,567"],
  },
  {
    name: "namespaces",
    xml: `<r:root xmlns:r="urn:example:in"><r:item code="x">one</r:item><r:item code="y">two</r:item></r:root>`,
    xsl: stylesheet(
      `
  <xsl:output method="xml" omit-xml-declaration="yes"/>
  <xsl:template match="/r:root">
    <out:list xmlns:out="urn:example:out">
      <xsl:apply-templates select="r:item"/>
      <xsl:element name="extra" namespace="urn:example:extra">
        <xsl:attribute name="ex:flag" namespace="urn:example:extra">on</xsl:attribute>
      </xsl:element>
    </out:list>
  </xsl:template>
  <xsl:template match="r:item">
    <out:entry xmlns:out="urn:example:out" code="{@code}"><xsl:value-of select="."/></out:entry>
  </xsl:template>`,
      'xmlns:r="urn:example:in" exclude-result-prefixes="r"',
    ),
    expect: [
      '<out:list xmlns:out="urn:example:out">',
      '<out:entry code="x">one</out:entry>',
      'xmlns="urn:example:extra"',
    ],
  },
  {
    name: "exslt-str-tokenize",
    xml: `<tags>xslt, xpath ,  dom</tags>`,
    xsl: stylesheet(
      `
  <xsl:output method="xml" omit-xml-declaration="yes"/>
  <xsl:template match="/tags">
    <tags>
      <xsl:for-each select="str:tokenize(., ', ')">
        <tag><xsl:value-of select="."/></tag>
      </xsl:for-each>
    </tags>
  </xsl:template>`,
      'xmlns:str="http://exslt.org/strings" extension-element-prefixes="str"',
    ),
    expect: ["<tag>xslt</tag><tag>xpath</tag><tag>dom</tag>"],
  },
  {
    name: "output-encoding-latin1",
    xml: `<p>Zażółć gęślą jaźń – café</p>`,
    xsl: stylesheet(`
  <xsl:output method="xml" encoding="ISO-8859-1"/>
  <xsl:template match="/p"><text><xsl:value-of select="."/></text></xsl:template>`),
    expect: ['encoding="ISO-8859-1"', "caf"],
  },
  {
    name: "html-output",
    xml: BOOKS,
    xsl: stylesheet(`
  <xsl:output method="html"/>
  <xsl:template match="/books">
    <div class="books">
      <xsl:for-each select="book[@genre = 'poetry']">
        <a href="/book/{@id}" title="{title}"><xsl:value-of select="title"/></a><br/>
      </xsl:for-each>
      <input type="checkbox" checked="checked"/>
    </div>
  </xsl:template>`),
    expect: ['<a href="/book/b1"', "<br>", "Dziady</a>"],
  },
  {
    name: "text-output",
    xml: BOOKS,
    xsl: stylesheet(`
  <xsl:output method="text"/>
  <xsl:template match="/books">
    <xsl:for-each select="book">
      <xsl:value-of select="concat(@id, '=', format-number(@price, '#,##0.00'), ';')"/>
    </xsl:for-each>
  </xsl:template>`),
    expect: ["b1=12.50;b2=8.00;b3=30.00;b4=8.00;"],
  },
  {
    name: "parameters",
    xml: BOOKS,
    params: { genre: "poetry", limit: 20 },
    xsl: stylesheet(`
  <xsl:output method="xml" omit-xml-declaration="yes"/>
  <xsl:param name="genre" select="'none'"/>
  <xsl:param name="limit" select="0"/>
  <xsl:template match="/books">
    <hits genre="{$genre}">
      <xsl:copy-of select="book[@genre = $genre and @price &lt; $limit]/title"/>
    </hits>
  </xsl:template>`),
    expect: ['<hits genre="poetry"><title>Pan Tadeusz</title></hits>'],
  },
  {
    // The built-in template copies the whitespace around <stuff>: the result
    // tree has text nodes next to its single element.
    name: "top-level-whitespace",
    xml: `<root>\n  <stuff name="A &amp; B"/>\n</root>`,
    xsl: stylesheet(`
  <xsl:template match="stuff"><xsl:copy-of select="."/></xsl:template>`),
    expect: ['<stuff name="A &amp; B"/>'],
  },
  {
    name: "modes-and-attribute-sets",
    xml: BOOKS,
    xsl: stylesheet(`
  <xsl:output method="xml" omit-xml-declaration="yes"/>
  <xsl:attribute-set name="cell"><xsl:attribute name="class">c</xsl:attribute></xsl:attribute-set>
  <xsl:template match="/books">
    <table><xsl:apply-templates select="book" mode="row"/></table>
  </xsl:template>
  <xsl:template match="book" mode="row">
    <tr xsl:use-attribute-sets="cell">
      <xsl:choose>
        <xsl:when test="@price &gt; 10"><xsl:attribute name="data-expensive">yes</xsl:attribute></xsl:when>
        <xsl:otherwise><xsl:comment>cheap</xsl:comment></xsl:otherwise>
      </xsl:choose>
      <xsl:value-of select="translate(title, 'abcdefghijklmnopqrstuvwxyz', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ')"/>
    </tr>
  </xsl:template>`),
    expect: [
      '<tr class="c" data-expensive="yes">PAN TADEUSZ</tr>',
      "<!--cheap-->LALKA",
    ],
  },
];
