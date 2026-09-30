<?xml version="1.0" encoding="UTF-8"?>
<!-- Included by main.xsl. -->
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:template name="label">
    <xsl:param name="text"/>
    <strong class="order-id">#<xsl:value-of select="$text"/></strong>
    <xsl:text> ships to </xsl:text>
  </xsl:template>
</xsl:stylesheet>
