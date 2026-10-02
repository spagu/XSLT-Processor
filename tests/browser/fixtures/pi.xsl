<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:output method="html"/>
  <xsl:template match="/">
    <html>
      <head><title>Catalog (<xsl:value-of select="count(/catalog/item)"/>)</title></head>
      <body>
        <ul id="items">
          <xsl:for-each select="/catalog/item">
            <li id="item-{@id}"><xsl:value-of select="."/></li>
          </xsl:for-each>
        </ul>
        <p id="count"><xsl:value-of select="count(//*)"/> source elements</p>
        <script>window.resultScriptRan = true;</script>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
