/**
 * Example stylesheets of the playground's XSLT 3.0 mode, part two: maps and
 * JSON output, xsl:try, xsl:merge, accumulators and xsl:result-document.
 * The menu is assembled in xslt3-presets.js.
 *
 * @module xslt3-presets-more
 */

/**
 * Opening tag shared by the examples: XSLT 3.0 with text value templates.
 *
 * @param {string} [extra] - More namespace declarations
 * @returns {string} The XML declaration and the xsl:stylesheet start tag
 */
export const stylesheetStart = (extra = "") =>
  `<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="3.0" expand-text="yes"
    xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
    xmlns:xs="http://www.w3.org/2001/XMLSchema"${extra}
    exclude-result-prefixes="#all">`;

const ordersXml = `<?xml version="1.0" encoding="UTF-8"?>
<orders>
  <order id="1001" customer="Ana Silva" total="37.00"/>
  <order id="1002" customer="Ben Okafor" total="126.00"/>
  <order id="1003" customer="Ana Silva" total="93.40"/>
</orders>`;

const jsonXsl = `${stylesheetStart()}
  <xsl:output method="text"/>

  <!-- Build a map with arrays inside, then write it as JSON with
       serialize(). -->
  <xsl:template match="/orders">
    <xsl:variable name="report" select="map {
      'orders': count(order),
      'revenue': sum(order/@total),
      'customers': array {
        for $name in distinct-values(order/@customer)
        return map {
          'name': $name,
          'orders': array { order[@customer = $name]/@id ! xs:integer(.) }
        }
      }
    }"/>
    <xsl:value-of select="serialize($report, map { 'method': 'json', 'indent': true() })"/>
  </xsl:template>
</xsl:stylesheet>`;

const pricesXml = `<?xml version="1.0" encoding="UTF-8"?>
<prices>
  <price sku="TEA-GRN-100">9.50</price>
  <price sku="CUP-CER-02">18,00</price>
  <price sku="POT-IRN-08">64.90</price>
  <price sku="TEA-OOL-250">n/a</price>
</prices>`;

const tryXsl = `${stylesheetStart(`
    xmlns:err="http://www.w3.org/2005/xqt-errors"`)}
  <xsl:output method="xml" indent="yes"/>

  <xsl:template match="/prices">
    <checked>
      <xsl:for-each select="price">
        <!-- A failed cast is caught here instead of ending the run. -->
        <xsl:try>
          <ok sku="{@sku}">{xs:decimal(.) * 2}</ok>
          <xsl:catch>
            <rejected sku="{@sku}" code="{$err:code}">{$err:description}</rejected>
          </xsl:catch>
        </xsl:try>
      </xsl:for-each>
    </checked>
  </xsl:template>
</xsl:stylesheet>`;

const branchesXml = `<?xml version="1.0" encoding="UTF-8"?>
<branches>
  <branch name="Kraków">
    <sale time="09:05" amount="12.00"/>
    <sale time="11:40" amount="38.00"/>
    <sale time="16:20" amount="7.50"/>
  </branch>
  <branch name="Gdańsk">
    <sale time="10:15" amount="64.90"/>
    <sale time="11:40" amount="19.00"/>
  </branch>
</branches>`;

const mergeXsl = `${stylesheetStart()}
  <xsl:output method="text"/>

  <!-- Two inputs, each sorted by time, read as one sorted stream. -->
  <xsl:template match="/branches">
    <xsl:merge>
      <xsl:merge-source name="krakow" select="branch[@name = 'Kraków']/sale">
        <xsl:merge-key select="@time"/>
      </xsl:merge-source>
      <xsl:merge-source name="gdansk" select="branch[@name = 'Gdańsk']/sale">
        <xsl:merge-key select="@time"/>
      </xsl:merge-source>
      <xsl:merge-action>
        <xsl:text>{current-merge-key()}  Kraków {sum(current-merge-group('krakow')/@amount)}, </xsl:text>
        <xsl:text>Gdańsk {sum(current-merge-group('gdansk')/@amount)}&#10;</xsl:text>
      </xsl:merge-action>
    </xsl:merge>
  </xsl:template>
</xsl:stylesheet>`;

const manualXml = `<?xml version="1.0" encoding="UTF-8"?>
<manual>
  <chapter title="Brewing">
    <figure caption="Water temperatures"/>
    <figure caption="Steeping times"/>
  </chapter>
  <chapter title="Storage">
    <figure caption="Airtight tins"/>
  </chapter>
</manual>`;

const accumulatorXsl = `${stylesheetStart()}
  <xsl:output method="html" html-version="5" indent="yes"/>

  <!-- Counts figures in document order, whatever template is running. -->
  <xsl:accumulator name="figures" as="xs:integer" initial-value="0">
    <xsl:accumulator-rule match="figure" select="$value + 1"/>
  </xsl:accumulator>
  <xsl:mode use-accumulators="figures"/>

  <xsl:template match="/manual">
    <div style="font-family: system-ui, sans-serif">
      <xsl:apply-templates select="chapter"/>
      <p>{accumulator-after('figures')} figures in total.</p>
    </div>
  </xsl:template>

  <xsl:template match="chapter">
    <h2>{@title}</h2>
    <xsl:apply-templates select="figure"/>
  </xsl:template>

  <xsl:template match="figure">
    <p>Figure {accumulator-after('figures')}: {@caption}</p>
  </xsl:template>
</xsl:stylesheet>`;

const resultDocumentXsl = `${stylesheetStart()}
  <xsl:output method="html" html-version="5" indent="yes"/>

  <xsl:template match="/orders">
    <!-- Two more files besides the principal result. -->
    <xsl:result-document href="orders.csv" method="text">
      <xsl:text>id,customer,total&#10;</xsl:text>
      <xsl:for-each select="order">{@id},{@customer},{@total}&#10;</xsl:for-each>
    </xsl:result-document>
    <xsl:result-document href="summary.json" method="text">
      <xsl:value-of select="map { 'orders': count(order), 'revenue': sum(order/@total) }
          => serialize(map { 'method': 'json' })"/>
    </xsl:result-document>
    <xsl:message>Wrote orders.csv and summary.json</xsl:message>
    <p style="font-family: system-ui, sans-serif">
      {count(order)} orders exported to <code>orders.csv</code>
      and <code>summary.json</code>.
    </p>
  </xsl:template>
</xsl:stylesheet>`;

/** The examples of this part, in menu order. */
export const moreXslt3Presets = [
  {
    id: "json",
    label: "Maps, arrays and JSON output",
    xml: ordersXml,
    xsl: jsonXsl,
    params: [],
  },
  {
    id: "try",
    label: "xsl:try and xsl:catch: recover from bad data",
    xml: pricesXml,
    xsl: tryXsl,
    params: [],
  },
  {
    id: "merge",
    label: "xsl:merge: two sorted sources as one",
    xml: branchesXml,
    xsl: mergeXsl,
    params: [],
  },
  {
    id: "accumulator",
    label: "Accumulators: number figures across chapters",
    xml: manualXml,
    xsl: accumulatorXsl,
    params: [],
  },
  {
    id: "result-document",
    label: "xsl:result-document: two extra outputs",
    xml: ordersXml,
    xsl: resultDocumentXsl,
    params: [],
  },
];
