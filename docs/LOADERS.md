# Stylesheet and Document Loaders

`xsl:import`, `xsl:include` and the XSLT `document()` function need external
files. The processor never fetches anything by itself: you configure a
synchronous stylesheet loader and a document loader that return a `Document` or
an XML string. See the [API Reference](API.md) for the rest of the API.

## Contents

- [Using xsl:import and xsl:include](#using-xslimport-and-xslinclude)
  - [Node.js example (filesystem loader)](#nodejs-example-filesystem-loader)
  - [Advanced: the engine accessor](#advanced-the-engine-accessor)
- [Using the document() function](#using-the-document-function)
  - [Import vs Include Behavior](#import-vs-include-behavior)

## Using xsl:import and xsl:include

To use `xsl:import` and `xsl:include` elements in your stylesheets, configure a
stylesheet loader that tells the processor how to fetch external stylesheets.

Call `processor.setStylesheetLoader(...)` **before** `importStylesheet()` -
references are resolved while the main stylesheet is being compiled, so a loader
set afterwards is too late for that stylesheet (it still applies to the next
`importStylesheet()` call).

The loader is **synchronous**. It receives the resolved `href` and the `baseUri`
of the importing stylesheet, and must return either a `Document` or an XML
`string` (which is parsed automatically). Promises are not awaited, so pre-load
remote stylesheets before importing.

```javascript
import { XSLTProcessor } from '@tradik/xslt-processor';

const processor = new XSLTProcessor();

// Pre-loaded stylesheets, keyed by resolved URI
const stylesheets = {
  '/styles/base.xsl': baseXslText,
  '/styles/utils.xsl': utilsXslText,
};

processor.setStylesheetLoader((href, baseUri) => {
  // href:    resolved URI of the xsl:import/xsl:include target
  // baseUri: URI of the importing stylesheet (the stylesheetUri you passed in)
  const xml = stylesheets[href];
  if (!xml) {
    throw new Error(`Unknown stylesheet: ${href} (from ${baseUri})`);
  }
  return xml; // a Document is also accepted
});

// The second argument is the base URI used to resolve relative hrefs
processor.importStylesheet(mainStylesheet, '/styles/main.xsl');
```

If you need remote stylesheets in the browser, fetch them first and hand the
loader a ready-made map:

```javascript
const hrefs = ['/styles/base.xsl', '/styles/utils.xsl'];
const texts = await Promise.all(
  hrefs.map((href) => fetch(href).then((response) => response.text())),
);
const cache = Object.fromEntries(hrefs.map((href, i) => [href, texts[i]]));

processor.setStylesheetLoader((href) => cache[href]);
processor.importStylesheet(mainStylesheet, '/styles/main.xsl');
```

### Node.js example (filesystem loader)

Node.js has no DOM, so bring one such as `jsdom`. XML strings returned by a
loader are parsed with the global `DOMParser`, which therefore has to be set
(or make the loader return a `Document` itself).

```javascript
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { XSLTProcessor } from '@tradik/xslt-processor';

const { window } = new JSDOM('');
globalThis.DOMParser = window.DOMParser; // used to parse the loader's strings

const parser = new DOMParser();
const mainPath = path.resolve('./styles/main.xsl');

const processor = new XSLTProcessor();

processor.setStylesheetLoader((href) => {
  // href is already resolved against the importing stylesheet's URI
  return readFileSync(href, 'utf8'); // returned XML string is parsed for you
});

const mainStylesheet = parser.parseFromString(
  readFileSync(mainPath, 'utf8'),
  'application/xml',
);

processor.importStylesheet(mainStylesheet, mainPath);

const xml = parser.parseFromString(readFileSync('./data.xml', 'utf8'), 'application/xml');
const result = processor.transformToDocument(xml);
console.log(new window.XMLSerializer().serializeToString(result));
```

### Advanced: the engine accessor

After `importStylesheet()`, `processor.engine` exposes the underlying
`XsltEngine` for advanced inspection (output settings, compiled templates). It
is `null` before the first import, which is why the loader must be configured
through `processor.setStylesheetLoader(...)` rather than `processor.engine`.

## Using the document() function

The XSLT `document()` function loads additional XML documents at transformation
time. Configure a **synchronous** document loader with
`processor.setDocumentLoader(...)`; it receives the resolved URI and the base URI
and returns a `Document`, an XML `string` (parsed automatically) or `null`.

Semantics:

- `document('')` returns the stylesheet itself, per the XSLT 1.0 specification.
- A node-set argument loads one document per node and returns their union.
- Relative URIs are resolved against the `stylesheetUri` passed to
  `importStylesheet()`; fragment identifiers are ignored.
- Without a loader, or when the loader returns `null`, `document()` evaluates to
  an **empty node-set** instead of failing the transformation.
- Each resolved URI is loaded once and cached for the life of the processor.

```javascript
import { readFileSync } from 'node:fs';
import { XSLTProcessor } from '@tradik/xslt-processor';

const processor = new XSLTProcessor();

processor.setDocumentLoader((uri) => {
  // uri is already resolved against the stylesheet URI (here /styles/...)
  try {
    return readFileSync(uri, 'utf8'); // XML string is parsed for you
  } catch {
    return null; // -> empty node-set, the transformation keeps going
  }
});

processor.importStylesheet(mainStylesheet, '/styles/main.xsl');
const result = processor.transformToDocument(xmlDoc);
```

```xml
<xsl:template match="/">
  <rate><xsl:value-of select="document('rates.xml')/rates/eur"/></rate>
</xsl:template>
```

### Import vs Include Behavior

- **xsl:include**: Merges templates at the same precedence level. If multiple templates match, priority attribute decides.
- **xsl:import**: Imported templates have lower precedence than importing stylesheet. The importing stylesheet's templates always win over imported ones with the same match pattern.

```xml
<!-- main.xsl -->
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:import href="base.xsl"/>  <!-- imported templates have lower precedence -->
  <xsl:include href="utils.xsl"/> <!-- included templates have same precedence -->

  <xsl:template match="item">
    <!-- This template overrides the one from base.xsl -->
  </xsl:template>
</xsl:stylesheet>
```
