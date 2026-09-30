<?xml version="1.0" encoding="UTF-8"?>
<!-- Entry stylesheet: pulls a named template from common.xsl (xsl:include)
     and country names from countries.xml (document()). -->
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:include href="common.xsl"/>
  <xsl:output method="html"/>
  <xsl:variable name="countries" select="document('countries.xml')/countries"/>

  <xsl:template match="/orders">
    <ul>
      <xsl:for-each select="order">
        <li>
          <xsl:call-template name="label">
            <xsl:with-param name="text" select="@id"/>
          </xsl:call-template>
          <xsl:value-of select="$countries/country[@code = current()/@country]"/>
        </li>
      </xsl:for-each>
    </ul>
  </xsl:template>
</xsl:stylesheet>
