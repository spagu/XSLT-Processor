<?xml version="1.0" encoding="UTF-8"?>
<!-- Stylesheet loaded by importStylesheetAsync in tests/browser/async.spec.mjs -->
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:import href="common.xsl"/>
  <xsl:output method="text"/>
  <xsl:template match="/">
    <xsl:call-template name="greeting"/>
    <xsl:text>|</xsl:text>
    <xsl:value-of select="document('data.xml')/data/city"/>
    <xsl:text>|</xsl:text>
    <xsl:value-of select="count(//item)"/>
  </xsl:template>
</xsl:stylesheet>
