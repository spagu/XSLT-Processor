# @tradik/xslt-processor

[![GitHub](https://img.shields.io/badge/GitHub-Repository-181717?logo=github)](https://github.com/spagu/XSLT-Processor)
[![GitHub stars](https://img.shields.io/github/stars/spagu/XSLT-Processor?style=social)](https://github.com/spagu/XSLT-Processor/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/spagu/XSLT-Processor?style=social)](https://github.com/spagu/XSLT-Processor/network/members)

[![CI](https://github.com/spagu/XSLT-Processor/actions/workflows/test.yml/badge.svg)](https://github.com/spagu/XSLT-Processor/actions/workflows/test.yml)
[![Release](https://github.com/spagu/XSLT-Processor/actions/workflows/release.yml/badge.svg)](https://github.com/spagu/XSLT-Processor/actions/workflows/release.yml)
[![npm version](https://img.shields.io/npm/v/@tradik/xslt-processor.svg)](https://www.npmjs.com/package/@tradik/xslt-processor)
[![License: BSD-3-Clause](https://img.shields.io/badge/License-BSD--3--Clause-blue.svg)](https://opensource.org/licenses/BSD-3-Clause)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.19.0-brightgreen.svg)](https://nodejs.org/)
[![Test Coverage](https://img.shields.io/badge/coverage-100%25-brightgreen.svg)](https://github.com/spagu/XSLT-Processor)

> **Source Code:** [github.com/spagu/XSLT-Processor](https://github.com/spagu/XSLT-Processor)

JavaScript implementation of XSLTProcessor for browser environments and Node.js CLI. This package provides a complete implementation of the W3C XSLTProcessor API that can be used as a drop-in replacement for the native browser implementation.

## Background

Chrome and other browsers are deprecating native XSLTProcessor support:
- **Chrome 143+**: XSLTProcessor starts showing deprecation warnings
- **Chrome 164 (August 2027)**: Full removal of native XSLT support

This library ensures your XSLT-based applications continue to work regardless of browser support.

## Features

- **1:1 Native API Compatibility**: Drop-in replacement for native `XSLTProcessor`
- **Full XSLT 1.0 Support**: Implements the complete W3C XSLT 1.0 specification
- **XPath 1.0 Engine**: Built-in XPath evaluator with all core functions
- **`xsl:output` Serialization**: `transformToString()` honors method, indent, doctype, CDATA sections and `disable-output-escaping`
- **Zero Dependencies**: Standalone implementation with no external dependencies
- **Multiple Formats**: ESM, CommonJS, and browser IIFE bundles
- **TypeScript Support**: Includes TypeScript declarations
- **WCAG 2.2 Compliant**: Designed with accessibility in mind

## Installation

```bash
npm install @tradik/xslt-processor
```

## Usage

### Browser via CDN (Recommended)

Use a CDN for the easiest browser integration - no build step required:

```html
<!-- jsDelivr (recommended) -->
<script src="https://cdn.jsdelivr.net/npm/@tradik/xslt-processor@1/dist/xslt-processor.browser.min.js"></script>

<!-- or unpkg -->
<script src="https://unpkg.com/@tradik/xslt-processor@1/dist/xslt-processor.browser.min.js"></script>

<script>
  // XSLTProcessor is now available globally
  const processor = new XSLTProcessor();

  // Load and transform XML
  const parser = new DOMParser();
  const xslt = parser.parseFromString(xsltString, 'application/xml');
  const xml = parser.parseFromString(xmlString, 'application/xml');

  processor.importStylesheet(xslt);
  const result = processor.transformToFragment(xml, document);
  document.getElementById('output').appendChild(result);
</script>
```

**CDN URLs:**
| CDN | URL |
|-----|-----|
| jsDelivr | `https://cdn.jsdelivr.net/npm/@tradik/xslt-processor@1/dist/xslt-processor.browser.min.js` |
| unpkg | `https://unpkg.com/@tradik/xslt-processor@1/dist/xslt-processor.browser.min.js` |

> **Tip:** Use `@1` for latest 1.x version, or `@1.0.0` for exact version pinning.

### Browser (Local Install)

If you prefer local installation:

```html
<script src="node_modules/@tradik/xslt-processor/dist/xslt-processor.browser.min.js"></script>
<script>
  // XSLTProcessor is now available globally
  const processor = new XSLTProcessor();
  // ...
</script>
```

### ESM Module

```javascript
import { XSLTProcessor, installGlobal } from '@tradik/xslt-processor';

// Optional: Force install as global XSLTProcessor
installGlobal();

// Or use directly
const processor = new XSLTProcessor();
const parser = new DOMParser();

// Load and parse XSLT stylesheet
const xsltText = await fetch('template.xsl').then(r => r.text());
const xsltDoc = parser.parseFromString(xsltText, 'application/xml');
processor.importStylesheet(xsltDoc);

// Load and parse XML source
const xmlText = await fetch('data.xml').then(r => r.text());
const xmlDoc = parser.parseFromString(xmlText, 'application/xml');

// Transform
const fragment = processor.transformToFragment(xmlDoc, document);
document.getElementById('output').appendChild(fragment);
```

### CommonJS

```javascript
const { XSLTProcessor } = require('@tradik/xslt-processor');

const processor = new XSLTProcessor();
// ...
```

### CLI Usage

The package includes a command-line tool for transforming XML documents:

```bash
# Global installation
npm install -g @tradik/xslt-processor

# Transform XML with XSLT
xslt data.xml template.xsl

# Save output to file
xslt data.xml template.xsl -o result.html

# With parameters
xslt data.xml template.xsl -p title="My Page" -p count=10

# Format output with indentation
xslt data.xml template.xsl -f -o output.html

# Override the output method and drop the XML declaration
xslt data.xml template.xsl --method text
xslt data.xml template.xsl --no-declaration
```

The output is serialized according to the `xsl:output` element of the
stylesheet (see [Serializing output](#serializing-output-xsloutput)); the
options below override individual `xsl:output` settings.

All file arguments must live inside the current working directory (symbolic
links are resolved first). To work with files elsewhere, run the command from
that directory or point `XSLT_BASE_DIR` at it:

```bash
XSLT_BASE_DIR=/srv/data xslt /srv/data/in.xml /srv/data/t.xsl -o /srv/data/out.html
```

#### CLI Options

| Option | Description |
|--------|-------------|
| `-o, --output <file>` | Write output to file instead of stdout |
| `-p, --param <n>=<v>` | Set XSLT parameter (can be used multiple times) |
| `-f, --format` | Format output with indentation (same as `--indent`) |
| `--indent` | Override `xsl:output` to `indent="yes"` |
| `--method <m>` | Override the `xsl:output` method (`xml`, `html`, `xhtml`, `text`) |
| `--no-declaration` | Override `xsl:output` to omit the XML declaration |
| `-h, --help` | Show help message |
| `-v, --version` | Show version number |

## API Reference

### XSLTProcessor

#### Constructor

```javascript
const processor = new XSLTProcessor();
```

#### Methods

| Method | Description |
|--------|-------------|
| `importStylesheet(node, stylesheetUri?)` | Imports an XSLT stylesheet from a Document or Element node. The optional `stylesheetUri` is the base URI used to resolve relative `xsl:import`/`xsl:include` hrefs |
| `transformToFragment(source, output)` | Transforms XML and returns a DocumentFragment |
| `transformToDocument(source)` | Transforms XML and returns an XMLDocument |
| `transformToString(source)` | Transforms XML and returns the serialized result honoring `xsl:output` (non-W3C extension) |
| `setParameter(namespaceURI, localName, value)` | Sets an XSLT parameter |
| `getParameter(namespaceURI, localName)` | Gets an XSLT parameter value |
| `removeParameter(namespaceURI, localName)` | Removes an XSLT parameter |
| `clearParameters()` | Removes all parameters |
| `reset()` | Resets the processor, removing stylesheet and parameters (the stylesheet and document loaders are kept) |
| `setStylesheetLoader(loader)` | Sets the loader used to resolve `xsl:import`/`xsl:include`. Returns the processor for chaining |
| `setDocumentLoader(loader)` | Sets the loader used to resolve the XSLT `document()` function. Returns the processor for chaining |

#### Properties

| Property | Description |
|----------|-------------|
| `engine` | Read-only access to the underlying `XsltEngine` (advanced usage). It is `null` until `importStylesheet()` has been called |

### Serializing output (xsl:output)

`transformToString(source)` serializes the result tree according to the
`xsl:output` element of the stylesheet (XSLT 1.0 section 16). Unlike the DOM
based methods it returns ready to write markup, so the CLI and Node.js users do
not need a separate `XMLSerializer` or a hand rolled re-indenter.

```javascript
const xslt = parser.parseFromString(`<?xml version="1.0"?>
  <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
    <xsl:output method="xml" indent="yes"/>
    <xsl:template match="/"><BAR><QUX/></BAR></xsl:template>
  </xsl:stylesheet>`, 'application/xml');

const processor = new XSLTProcessor();
processor.importStylesheet(xslt);

processor.transformToString(xmlDoc);
// <?xml version="1.0" encoding="UTF-8"?>
// <BAR>
//   <QUX/>
// </BAR>
```

Supported `xsl:output` attributes:

| Attribute | Behavior |
|-----------|----------|
| `method="xml"` | XML declaration, minimal escaping, empty elements as `<x/>` (default) |
| `method="html"` | No XML declaration, void elements as `<br>`, minimized boolean attributes, unescaped `script`/`style` |
| `method="xhtml"` | XML rules with void elements written as `<br />` |
| `method="text"` | Concatenation of all text nodes, no escaping |
| `indent="yes"` | Newline plus two-space indentation for element-only content; mixed content and `pre`/`script`/`style`/`textarea` are left untouched |
| `encoding`, `version`, `standalone` | Written into the XML declaration |
| `omit-xml-declaration="yes"` | Suppresses the XML declaration |
| `doctype-public`, `doctype-system` | Emit a `<!DOCTYPE ...>` before the document element |
| `cdata-section-elements` | Text children of the listed elements are wrapped in `<![CDATA[...]]>`, split around any `]]>` |
| `media-type` | Parsed and exposed on the settings object |

`disable-output-escaping="yes"` on `xsl:text` and `xsl:value-of` is honored: the
generated text is emitted verbatim, so `&lt;b&gt;` reaches the output as `<b>`.

The serializer can also be used on its own, for example on a fragment produced
by `transformToFragment`:

```javascript
import { serializeResult } from '@tradik/xslt-processor';

serializeResult(fragment, { method: 'html', indent: 'yes' });
```

When `method` is absent (or `auto`), the output method is derived from the
result tree: `html` when the document element is `html` in no namespace, `xml`
otherwise.

### Parameters Example

```javascript
const processor = new XSLTProcessor();
processor.importStylesheet(xsltDoc);

// Set parameters
processor.setParameter(null, 'sortOrder', 'ascending');
processor.setParameter(null, 'itemsPerPage', 10);

// Get parameter
const sortOrder = processor.getParameter(null, 'sortOrder');

// Clear parameters
processor.clearParameters();
```

### Using xsl:import and xsl:include

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

#### Node.js example (filesystem loader)

```javascript
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DOMParser } from '@xmldom/xmldom'; // or: new JSDOM(...).window.DOMParser
import { XSLTProcessor } from '@tradik/xslt-processor';

const parser = new DOMParser();
const mainPath = path.resolve('./styles/main.xsl');

const processor = new XSLTProcessor();

processor.setStylesheetLoader((href, baseUri) => {
  const filePath = path.resolve(path.dirname(baseUri), href);
  return readFileSync(filePath, 'utf8'); // returned XML string is parsed for you
});

const mainStylesheet = parser.parseFromString(
  readFileSync(mainPath, 'utf8'),
  'application/xml',
);

processor.importStylesheet(mainStylesheet, mainPath);

const xml = parser.parseFromString(readFileSync('./data.xml', 'utf8'), 'application/xml');
const result = processor.transformToDocument(xml);
```

#### Advanced: the engine accessor

After `importStylesheet()`, `processor.engine` exposes the underlying
`XsltEngine` for advanced inspection (output settings, compiled templates). It
is `null` before the first import, which is why the loader must be configured
through `processor.setStylesheetLoader(...)` rather than `processor.engine`.

### Using the document() function

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
import path from 'node:path';
import { XSLTProcessor } from '@tradik/xslt-processor';

const processor = new XSLTProcessor();

processor.setDocumentLoader((uri, baseUri) => {
  const filePath = path.resolve(path.dirname(baseUri || '.'), uri);
  try {
    return readFileSync(filePath, 'utf8'); // XML string is parsed for you
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

#### Import vs Include Behavior

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

### Utility Functions

```javascript
import {
  isNativeXSLTSupported,
  installGlobal,
  serializeResult,
  markRawText
} from '@tradik/xslt-processor';

// Check if native XSLT is functional
if (!isNativeXSLTSupported()) {
  console.log('Using JS implementation');
}

// Install as global XSLTProcessor
installGlobal(); // Only if native not available
installGlobal(true); // Force install

// Serialize any result tree with xsl:output settings
serializeResult(node, { method: 'xml', indent: 'yes' });

// Mark a text node so that it is emitted without escaping
markRawText(document.createTextNode('<b>raw</b>'));
```

## Complete Example

Here's a full example transforming a list of products into an HTML table:

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

## Security Features

The XPath evaluator includes comprehensive security hardening to prevent common attack vectors.

### DoS Prevention Limits

| Limit | Default | Description |
|-------|---------|-------------|
| `MAX_RECURSION_DEPTH` | 100 | Prevents stack overflow from deeply nested expressions |
| `MAX_RESULT_SIZE` | 10,000 | Prevents memory exhaustion from large result sets |
| `MAX_STRING_LENGTH` | 1,000,000 | Limits string processing to prevent memory issues |

### Prototype Pollution Protection

The following variable names are blocked:
- `__proto__`, `constructor`, `prototype`
- `__defineGetter__`, `__defineSetter__`
- `__lookupGetter__`, `__lookupSetter__`

### Input Validation

- **AST Validation**: All AST nodes are validated before evaluation
- **Type Safety**: Strict type checking on all inputs
- **Safe Variable Lookup**: Uses `hasOwnProperty` to prevent prototype chain attacks

### Custom Security Limits

```javascript
import { XPathEvaluator, XPathContext, parse } from '@tradik/xslt-processor';

const evaluator = new XPathEvaluator({
  maxRecursionDepth: 50,    // Lower for untrusted input
  maxResultSize: 1000,      // Limit result set size
  maxStringLength: 10000    // Limit string operations
});

const ast = parse('//item');
const context = new XPathContext(xmlDoc);
const result = evaluator.evaluate(ast, context);
```

## XSLT Elements Supported

| Element | Status |
|---------|--------|
| `xsl:apply-templates` | Supported |
| `xsl:attribute` | Supported |
| `xsl:call-template` | Supported |
| `xsl:choose` / `when` / `otherwise` | Supported |
| `xsl:comment` | Supported |
| `xsl:copy` | Supported |
| `xsl:copy-of` | Supported |
| `xsl:element` | Supported |
| `xsl:for-each` | Supported |
| `xsl:if` | Supported |
| `xsl:message` | Supported |
| `xsl:number` | Supported |
| `xsl:output` | Supported |
| `xsl:param` | Supported |
| `xsl:processing-instruction` | Supported |
| `xsl:sort` | Supported |
| `xsl:template` | Supported |
| `xsl:text` | Supported |
| `xsl:value-of` | Supported |
| `xsl:variable` | Supported |
| `xsl:with-param` | Supported |
| `xsl:import` | Supported |
| `xsl:include` | Supported |
| `xsl:apply-imports` | Supported |
| `xsl:attribute-set` | Supported (also via `xsl:use-attribute-sets` on literal result elements) |
| `xsl:key` | Supported (see `key()`) |
| `xsl:decimal-format` | Supported (see `format-number()`) |
| `xsl:namespace-alias` | Supported |
| `xsl:strip-space` / `xsl:preserve-space` | Supported |
| `xsl:fallback` | Parsed, never instantiated (no extension elements) |

## XPath Functions Supported

### Node Set Functions
- `count()`, `id()`, `last()`, `local-name()`, `name()`, `namespace-uri()`, `position()`

### String Functions
- `concat()`, `contains()`, `normalize-space()`, `starts-with()`, `string()`, `string-length()`, `substring()`, `substring-after()`, `substring-before()`, `translate()`

### Boolean Functions
- `boolean()`, `false()`, `lang()`, `not()`, `true()`

### Number Functions
- `ceiling()`, `floor()`, `number()`, `round()`, `sum()`

### XSLT-Defined Functions
- `current()` - the XSLT current node, also inside predicates
- `document(object, base?)` - external documents, see `setDocumentLoader()`
- `element-available(name)`, `function-available(name)` - reflect the real element and function tables
- `format-number(number, pattern, decimalFormat?)` - full XSLT 1.0 picture strings, honouring `xsl:decimal-format`
- `generate-id(nodeSet?)` - stable identifier for the life of the transformation
- `key(name, value)` - `xsl:key` lookup, with lazily built per-document indexes
- `system-property(name)` - `xsl:version`, `xsl:vendor`, `xsl:vendor-url`
- `unparsed-entity-uri(name)` - always returns `''` (unparsed entities are not exposed by the DOM)

### Conformance Notes
- CDATA sections count as text everywhere (string-value, `text()`, `xsl:value-of`, `xsl:copy-of`)
- The identity transform `<xsl:template match="@*|node()"><xsl:copy><xsl:apply-templates select="@*|node()"/></xsl:copy></xsl:template>` round-trips a document exactly
- `xsl:number` supports `level="single|multiple|any"` with `count`, `from` and the `1`, `01`, `a`, `A`, `i`, `I` format tokens
- The result tree is built in a neutral XML document and imported into the output
  document at the end, so element names and namespaces survive an HTML owner document

## Development

### Prerequisites

- Node.js 22+ (native test runner; CI runs 22, 24 and 26)
- Docker (optional, for containerized testing)

### Setup

```bash
cd services/xslt-processor
npm install
```

### Commands

```bash
# Run tests
npm test

# Run tests with watch mode
npm run test:watch

# Build bundles
npm run build

# Lint code
npm run lint

# Format code
npm run format
```

### Docker

```bash
# Run tests in container
docker-compose run test

# Development with hot reload
docker-compose run dev

# Build bundles
docker-compose run build
```

### Publishing to npm

The package is published to npm automatically by the `Release` workflow when a
`v*` tag is pushed (or a GitHub release is published). Publishing uses npm
**Trusted Publishing** (OIDC): no `NPM_TOKEN` secret and no OTP are involved,
and every release carries provenance attestations.

**One-time prerequisite** (npmjs.com -> package `@tradik/xslt-processor` ->
Settings -> Trusted Publisher): provider *GitHub Actions*, owner `spagu`,
repository `XSLT-Processor`, workflow `release.yml`, environment left empty.
Until this is configured the `publish` job fails and the package must be
published manually with `npm publish --provenance --access public --otp=CODE`.

**Release process:**

```bash
# 1. Bump the version in package.json, package-lock.json, src/index.js and
#    add a CHANGELOG.md entry, then commit to main.

# 2. Tag and push the tag; the workflow refuses to publish if the tag does
#    not match package.json.
git tag v1.1.0
git push origin v1.1.0
```

**Automated workflow:**
1. Runs lint, formatting check and tests on Node.js 22, 24 and 26
2. Builds the distribution bundles and verifies the package contents
3. Checks that the tag matches the `package.json` version
4. Uploads the `dist/` build artifacts to GitHub
5. Publishes to npm with provenance

## Browser Compatibility

This library provides a JavaScript polyfill for XSLTProcessor that works across all modern browsers.

### Polyfill Support

| Browser | Minimum Version | ES Modules | Status |
|---------|-----------------|------------|--------|
| Chrome | 92+ | Yes | Fully Supported |
| Firefox | 92+ | Yes | Fully Supported |
| Safari | 15.4+ | Yes | Fully Supported |
| Edge | 92+ | Yes | Fully Supported |
| Opera | 78+ | Yes | Fully Supported |
| Samsung Internet | 16+ | Yes | Fully Supported |
| Node.js | 20.19+ | Yes | Fully Supported (CI: 22, 24, 26) |

### Native XSLT Deprecation Timeline

| Browser | Deprecation Warning | Full Removal |
|---------|---------------------|--------------|
| Chrome | v143 (2026) | v164 (August 2027) |
| Edge | v143 (2026) | v164 (August 2027) |
| Other Chromium | v143 (2026) | v164 (August 2027) |

### Feature Detection

```javascript
import { isNativeXSLTSupported, installGlobal } from '@tradik/xslt-processor';

// Check native support and auto-install polyfill
if (!isNativeXSLTSupported()) {
  installGlobal();
  console.log('Using JavaScript XSLT polyfill');
}
```

## W3C Standards Compliance

This implementation follows these W3C specifications with comprehensive test coverage to ensure compliance.

### Specifications Implemented

| Specification | Version | Status |
|---------------|---------|--------|
| [XPath 1.0](http://www.w3.org/TR/1999/REC-xpath-19991116) | W3C Recommendation, 16 November 1999 | Full Compliance |
| [XSLT 1.0](http://www.w3.org/TR/1999/REC-xslt-19991116) | W3C Recommendation, 16 November 1999 | Full Compliance |
| [DOM Level 3 Core](http://www.w3.org/TR/2004/REC-DOM-Level-3-Core-20040407/) | W3C Recommendation, 7 April 2004 | Full Compliance |

### XSLT 1.0 Specification Compliance

| Section | Feature | Status | Notes |
|---------|---------|--------|-------|
| 2 | Stylesheet Structure | Supported | `xsl:stylesheet`, `xsl:transform` elements |
| 3 | Data Model | Supported | Seven node types per XPath data model |
| 5 | Template Rules | Supported | Pattern matching, priority calculation |
| 5.1 | Processing Model | Supported | Built-in templates for all node types |
| 5.2 | Patterns | Supported | All pattern syntax including predicates |
| 5.3 | Defining Template Rules | Supported | `match`, `name`, `priority`, `mode` attributes |
| 5.4 | Applying Template Rules | Supported | `xsl:apply-templates` with `select`, `mode` |
| 5.5 | Conflict Resolution | Supported | Import precedence and priority ordering |
| 6 | Named Templates | Supported | `xsl:call-template`, `xsl:with-param` |
| 7 | Creating Result Tree | Supported | Literal result elements, attribute value templates |
| 7.1.2 | Creating Elements | Supported | `xsl:element` with dynamic names/namespaces |
| 7.1.3 | Creating Attributes | Supported | `xsl:attribute` with dynamic names/namespaces |
| 7.2 | Creating Text | Supported | `xsl:value-of`, `xsl:text` |
| 7.3 | Creating PIs | Supported | `xsl:processing-instruction` |
| 7.4 | Creating Comments | Supported | `xsl:comment` |
| 7.5 | Copying | Supported | `xsl:copy`, `xsl:copy-of` |
| 7.6 | Attribute Sets | Supported | `xsl:attribute-set`, `use-attribute-sets` |
| 7.6.2 | Namespace Aliases | Supported | `xsl:namespace-alias` |
| 8 | Repetition | Supported | `xsl:for-each` |
| 9 | Conditional Processing | Supported | `xsl:if`, `xsl:choose`, `xsl:when`, `xsl:otherwise` |
| 10 | Sorting | Supported | `xsl:sort` with multiple keys, data-types, order |
| 11 | Variables/Parameters | Supported | `xsl:variable`, `xsl:param`, scoping rules |
| 11.1 | Result Tree Fragments | Supported | RTF handling as per spec |
| 12 | Additional Functions | Supported | `document()`, `key()`, `format-number()`, `current()`, `generate-id()`, `system-property()` |
| 12.3 | Number Formatting | Supported | `xsl:number` with all formatting options |
| 13 | Messages | Supported | `xsl:message` with `terminate` attribute |
| 14 | Extensions | Partial | `xsl:fallback` supported |
| 15 | Fallback | Supported | `xsl:fallback` element |
| 16 | Output | Supported | `xsl:output` honored by `transformToString()` / `serializeResult()` |
| 16.1 | XML Output Method | Supported | XML declaration (`encoding`, `version`, `standalone`), `omit-xml-declaration`, `doctype-public`/`doctype-system`, namespace declarations, `indent="yes"` for element-only content |
| 16.1 | CDATA Sections | Supported | `cdata-section-elements`, split around `]]>` |
| 16.2 | HTML Output Method | Supported | Void elements as `<br>`, minimized boolean attributes, unescaped `script`/`style`, no re-indent inside `pre`/`script`/`style`/`textarea` |
| 16.3 | Text Output Method | Supported | Concatenation of all text nodes, no escaping |
| 16.4 | Disabling Output Escaping | Supported | `disable-output-escaping` on `xsl:text` and `xsl:value-of` |

### XPath 1.0 Specification Compliance

| Section | Feature | Status | Notes |
|---------|---------|--------|-------|
| 2.1 | Location Steps | Supported | axis::node-test[predicate] |
| 2.2 | Axes | Supported | All 13 axes implemented |
| 2.3 | Node Tests | Supported | Name tests, `node()`, `text()`, `comment()`, `processing-instruction()` |
| 2.4 | Predicates | Supported | Position and boolean predicates |
| 2.5 | Abbreviated Syntax | Supported | `.`, `..`, `@`, `//` |
| 3.1 | Basics | Supported | Expression evaluation |
| 3.2 | Function Calls | Supported | All core functions |
| 3.3 | Node-sets | Supported | Union operator `\|` |
| 3.4 | Booleans | Supported | `and`, `or`, `not()` |
| 3.5 | Numbers | Supported | IEEE 754 double-precision |
| 3.6 | Strings | Supported | Unicode string handling |
| 3.7 | Lexical Structure | Supported | Full tokenization |
| 4.1 | Node Set Functions | Supported | `last()`, `position()`, `count()`, `id()`, `local-name()`, `namespace-uri()`, `name()` |
| 4.2 | String Functions | Supported | `string()`, `concat()`, `starts-with()`, `contains()`, `substring-before()`, `substring-after()`, `substring()`, `string-length()`, `normalize-space()`, `translate()` |
| 4.3 | Boolean Functions | Supported | `boolean()`, `not()`, `true()`, `false()`, `lang()` |
| 4.4 | Number Functions | Supported | `number()`, `sum()`, `floor()`, `ceiling()`, `round()` |

### XPath Axes Implementation

| Axis | Status | Description |
|------|--------|-------------|
| `child` | Supported | Children of context node |
| `descendant` | Supported | Descendants of context node |
| `parent` | Supported | Parent of context node |
| `ancestor` | Supported | Ancestors of context node |
| `following-sibling` | Supported | Following siblings |
| `preceding-sibling` | Supported | Preceding siblings |
| `following` | Supported | Nodes after context in document order |
| `preceding` | Supported | Nodes before context in document order |
| `attribute` | Supported | Attributes of context node |
| `namespace` | Supported | Namespace nodes |
| `self` | Supported | Context node itself |
| `descendant-or-self` | Supported | Context node and descendants |
| `ancestor-or-self` | Supported | Context node and ancestors |

### DOM Level 3 Core Compliance

| Interface | Status | Notes |
|-----------|--------|-------|
| `Node` | Supported | All node type constants |
| `Document` | Supported | `createElement`, `createTextNode`, `createComment`, etc. |
| `Element` | Supported | `getAttribute`, `setAttribute`, namespace methods |
| `Attr` | Supported | Attribute nodes with namespace support |
| `Text` | Supported | Text node handling |
| `Comment` | Supported | Comment nodes |
| `ProcessingInstruction` | Supported | PI nodes with target and data |
| `DocumentFragment` | Supported | Fragment handling in transforms |
| `NamedNodeMap` | Supported | Attribute collections |
| `NodeList` | Supported | Child node collections |

### Web API Compliance

This implementation provides full compatibility with the [MDN XSLTProcessor API](https://developer.mozilla.org/en-US/docs/Web/API/XSLTProcessor):

| Method | Status | Notes |
|--------|--------|-------|
| `importStylesheet(node)` | Supported | Accepts Document or Element |
| `transformToFragment(source, output)` | Supported | Returns DocumentFragment |
| `transformToDocument(source)` | Supported | Returns XMLDocument |
| `transformToString(source)` | Extension | Not part of the W3C API; returns the `xsl:output` serialized result |
| `setParameter(namespaceURI, localName, value)` | Supported | Full namespace support |
| `getParameter(namespaceURI, localName)` | Supported | Returns parameter value |
| `removeParameter(namespaceURI, localName)` | Supported | Removes single parameter |
| `clearParameters()` | Supported | Removes all parameters |
| `reset()` | Supported | Resets processor state |

### Test Coverage by Specification

| Specification | Tests | Coverage |
|---------------|-------|----------|
| XSLT 1.0 Elements | 82+ | 100% of supported elements |
| XPath 1.0 Functions | 50+ | 100% of core functions |
| XPath 1.0 Axes | 26+ | All 13 axes |
| DOM Level 3 | 20+ | Core interfaces |
| XSLTProcessor API | 39+ | All methods |
| Output Serialization | 79+ | `xsl:output`, CLI, `transformToString()` |
| Security | 34+ | DoS prevention, prototype pollution |
| **Total** | **560** | **100% line coverage** |

## Style Guide

### Colors

| Usage | Color | Hex |
|-------|-------|-----|
| Primary | Blue | `#2563eb` |
| Success | Green | `#16a34a` |
| Warning | Amber | `#d97706` |
| Error | Red | `#dc2626` |
| Text | Gray | `#1f2937` |
| Background | White | `#ffffff` |

All colors meet WCAG 2.2 AA contrast requirements for accessibility.

## License

BSD-3-Clause License - see [LICENSE.md](LICENSE.md) for details.

## Related

- [MDN XSLTProcessor](https://developer.mozilla.org/en-US/docs/Web/API/XSLTProcessor)
- [libxslt](https://gitlab.gnome.org/GNOME/libxslt) - Reference implementation in C
