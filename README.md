# @tradik/xslt-processor

[![GitHub](https://img.shields.io/badge/GitHub-Repository-181717?logo=github)](https://github.com/spagu/XSLT-Processor)
[![GitHub stars](https://img.shields.io/github/stars/spagu/XSLT-Processor?style=social)](https://github.com/spagu/XSLT-Processor/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/spagu/XSLT-Processor?style=social)](https://github.com/spagu/XSLT-Processor/network/members)

[![CI](https://github.com/spagu/XSLT-Processor/actions/workflows/test.yml/badge.svg)](https://github.com/spagu/XSLT-Processor/actions/workflows/test.yml)
[![Release](https://github.com/spagu/XSLT-Processor/actions/workflows/release.yml/badge.svg)](https://github.com/spagu/XSLT-Processor/actions/workflows/release.yml)
[![npm version](https://img.shields.io/npm/v/@tradik/xslt-processor.svg)](https://www.npmjs.com/package/@tradik/xslt-processor)
[![License: BSD-3-Clause](https://img.shields.io/badge/License-BSD--3--Clause-blue.svg)](https://opensource.org/licenses/BSD-3-Clause)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
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
```

#### CLI Options

| Option | Description |
|--------|-------------|
| `-o, --output <file>` | Write output to file instead of stdout |
| `-p, --param <n>=<v>` | Set XSLT parameter (can be used multiple times) |
| `-f, --format` | Format output with indentation |
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
| `importStylesheet(node)` | Imports an XSLT stylesheet from a Document or Element node |
| `transformToFragment(source, output)` | Transforms XML and returns a DocumentFragment |
| `transformToDocument(source)` | Transforms XML and returns an XMLDocument |
| `setParameter(namespaceURI, localName, value)` | Sets an XSLT parameter |
| `getParameter(namespaceURI, localName)` | Gets an XSLT parameter value |
| `removeParameter(namespaceURI, localName)` | Removes an XSLT parameter |
| `clearParameters()` | Removes all parameters |
| `reset()` | Resets the processor, removing stylesheet and parameters |

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

To use `xsl:import` and `xsl:include` elements in your stylesheets, you need to configure a stylesheet loader that tells the processor how to fetch external stylesheets:

```javascript
import { XSLTProcessor } from '@tradik/xslt-processor';

const processor = new XSLTProcessor();

// Configure stylesheet loader
processor.engine.setStylesheetLoader((href, baseUri) => {
  // href: the href attribute from xsl:import/xsl:include
  // baseUri: the URI of the importing stylesheet

  // Option 1: Return a parsed Document
  const response = await fetch(href);
  const text = await response.text();
  const parser = new DOMParser();
  return parser.parseFromString(text, 'application/xml');

  // Option 2: Return XML string (will be parsed automatically)
  return await fetch(href).then(r => r.text());
});

// Now xsl:import and xsl:include will work
processor.importStylesheet(mainStylesheet, '/styles/main.xsl');
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
import { isNativeXSLTSupported, installGlobal } from '@tradik/xslt-processor';

// Check if native XSLT is functional
if (!isNativeXSLTSupported()) {
  console.log('Using JS implementation');
}

// Install as global XSLTProcessor
installGlobal(); // Only if native not available
installGlobal(true); // Force install
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

## XPath Functions Supported

### Node Set Functions
- `count()`, `id()`, `last()`, `local-name()`, `name()`, `namespace-uri()`, `position()`

### String Functions
- `concat()`, `contains()`, `normalize-space()`, `starts-with()`, `string()`, `string-length()`, `substring()`, `substring-after()`, `substring-before()`, `translate()`

### Boolean Functions
- `boolean()`, `false()`, `lang()`, `not()`, `true()`

### Number Functions
- `ceiling()`, `floor()`, `number()`, `round()`, `sum()`

## Development

### Prerequisites

- Node.js 25+ (for native test runner)
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

The package is automatically published to npm when a GitHub release is created or a version tag is pushed.

**Prerequisites:**
1. Set up `NPM_TOKEN` secret in GitHub repository settings
2. Ensure version in `package.json` matches the release tag

**Release Process:**

```bash
# 1. Update version in package.json
npm version patch  # or minor, major

# 2. Push the tag
git push origin --tags

# 3. Create a GitHub release (or push triggers automatically)
```

**Automated Workflow:**
1. Runs all tests and linting checks
2. Performs security audit with `npm audit`
3. Builds distribution bundles
4. Publishes to npm with provenance (supply chain security)
5. Uploads build artifacts to GitHub

## Browser Compatibility

This library provides a JavaScript polyfill for XSLTProcessor that works across all modern browsers.

### Polyfill Support

| Browser | Minimum Version | ES Modules | Status |
|---------|-----------------|------------|--------|
| Chrome | 90+ | Yes | Fully Supported |
| Firefox | 88+ | Yes | Fully Supported |
| Safari | 14+ | Yes | Fully Supported |
| Edge | 90+ | Yes | Fully Supported |
| Opera | 76+ | Yes | Fully Supported |
| Samsung Internet | 15+ | Yes | Fully Supported |
| Node.js | 25+ | Yes | Fully Supported |

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
| 16 | Output | Supported | `xsl:output` with method, encoding, indent |

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
| Security | 34+ | DoS prevention, prototype pollution |
| **Total** | **441** | **99.41% line coverage** |

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
