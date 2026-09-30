# Complete Example

Here's a full example transforming a list of products into an HTML table.

**products.xml:**
```xml
<?xml version="1.0"?>
<products>
  <product id="1">
    <name>Widget</name>
    <price>29.99</price>
    <stock>150</stock>
  </product>
  <product id="2">
    <name>Gadget</name>
    <price>49.99</price>
    <stock>75</stock>
  </product>
</products>
```

**products.xsl:**
```xml
<?xml version="1.0"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:param name="title" select="'Product Catalog'"/>

  <xsl:template match="/">
    <html>
      <head><title><xsl:value-of select="$title"/></title></head>
      <body>
        <h1><xsl:value-of select="$title"/></h1>
        <table>
          <tr><th>ID</th><th>Name</th><th>Price</th><th>Stock</th></tr>
          <xsl:apply-templates select="products/product">
            <xsl:sort select="name"/>
          </xsl:apply-templates>
        </table>
      </body>
    </html>
  </xsl:template>

  <xsl:template match="product">
    <tr>
      <td><xsl:value-of select="@id"/></td>
      <td><xsl:value-of select="name"/></td>
      <td>$<xsl:value-of select="price"/></td>
      <td>
        <xsl:choose>
          <xsl:when test="stock > 100">In Stock</xsl:when>
          <xsl:when test="stock > 0">Low Stock</xsl:when>
          <xsl:otherwise>Out of Stock</xsl:otherwise>
        </xsl:choose>
      </td>
    </tr>
  </xsl:template>
</xsl:stylesheet>
```

**JavaScript:**
```javascript
import { XSLTProcessor } from '@tradik/xslt-processor';

const processor = new XSLTProcessor();
processor.importStylesheet(xsltDoc);
processor.setParameter(null, 'title', 'My Product List');

const result = processor.transformToFragment(xmlDoc, document);
document.body.appendChild(result);
```

**CLI:**
```bash
xslt products.xml products.xsl -p title="My Product List" -f -o catalog.html
```

See the
[API Reference](API.md) and the [Command Line Tool](CLI.md) guide for the
methods and options used here.
