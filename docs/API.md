# API Reference

The `XSLTProcessor` class implements the W3C/MDN `XSLTProcessor` API and adds
`transformToString()` plus stylesheet and document loaders. This page covers its
methods, parameters, `xsl:output` serialization, the module exports, the
`XsltEngine` options and the TypeScript declarations. Loaders for
`xsl:import`, `xsl:include` and `document()` are described in
[Loaders](LOADERS.md).

## Contents

- [XSLTProcessor](#xsltprocessor): [Constructor](#constructor), [Methods](#methods), [Properties](#properties)
- [Module exports](#module-exports)
- [TypeScript](#typescript)
- [Serializing output (xsl:output)](#serializing-output-xsloutput)
- [Parameters Example](#parameters-example)
- [Utility Functions](#utility-functions)
- [XsltEngine options](#xsltengine-options)
- [Opt-in XSLT 2.0/3.0](#opt-in-xslt-2030)

## XSLTProcessor

### Constructor

```javascript
const processor = new XSLTProcessor();
```

The native constructor takes no argument; this one takes optional,
non-W3C options:

| Option | Description |
|--------|-------------|
| `xsltVersion` | `"1.0"` (default) or `"auto"`, see [Opt-in XSLT 2.0/3.0](#opt-in-xslt-2030). Other values throw a `RangeError` |
| `maxTemplateDepth` | Deepest nesting of template instantiations (default 3000) |
| `enableDynamicEvaluate` | Allow EXSLT `dyn:evaluate()` (trusted input only) |
| `clock` | `() => Date` used by EXSLT date functions and `current-dateTime()` |
| `legacyNameTests` | Deprecated: unprefixed name tests also match namespaced nodes, as before 1.2.0 |

### Methods

| Method | Description |
|--------|-------------|
| `importStylesheet(node, stylesheetUri?)` | Imports an XSLT stylesheet from a Document or Element node. The optional `stylesheetUri` is the base URI used to resolve relative `xsl:import`/`xsl:include` hrefs |
| `transformToFragment(source, output)` | Transforms XML and returns a DocumentFragment owned by `output` |
| `transformToDocument(source)` | Transforms XML and returns an XMLDocument |
| `transformToString(source)` | Transforms XML and returns the serialized result honoring `xsl:output` (non-W3C extension) |
| `setParameter(namespaceURI, localName, value)` | Sets an XSLT parameter |
| `getParameter(namespaceURI, localName)` | Gets an XSLT parameter value (`''` when it is not set) |
| `removeParameter(namespaceURI, localName)` | Removes an XSLT parameter |
| `clearParameters()` | Removes all parameters |
| `reset()` | Resets the processor, removing stylesheet and parameters (the stylesheet and document loaders are kept) |
| `setStylesheetLoader(loader)` | Sets the loader used to resolve `xsl:import`/`xsl:include` (non-W3C extension). Pass `null` to remove it. Returns the processor for chaining |
| `setDocumentLoader(loader)` | Sets the loader used to resolve the XSLT `document()` function (non-W3C extension). Pass `null` to remove it. Returns the processor for chaining |
| `XSLTProcessor.preload(version?)` | Static, non-W3C: loads `@tradik/xslt3` so that the synchronous API can run XSLT 2.0/3.0 stylesheets with `xsltVersion: "auto"`. `version` is `"3.0"` (default) or `"2.0"`; returns a `Promise<void>` |

Like the native implementation, the `transformTo*` methods return `null` when
the transformation fails (for example `xsl:message terminate="yes"`) and log
the error with `console.error`. Missing arguments, a source that is not a
Document, Element or DocumentFragment, and calling them before
`importStylesheet()` throw instead.

`importStylesheet()` throws for a stylesheet that is not valid XSLT 1.0, for
example an invalid pattern such as `match="a/.."` (the error names the
pattern), as Chrome's native processor rejects such stylesheets. The processor
then keeps its previously imported stylesheet. Invalid names computed at run
time by `xsl:element`/`xsl:attribute` are reported with `console.warn` and
skipped, as libxslt does.

### Properties

| Property | Description |
|----------|-------------|
| `engine` | Read-only access to the underlying `XsltEngine` (advanced usage). It is `null` until `importStylesheet()` has been called; for a stylesheet run by `@tradik/xslt3` it is the bridge engine, which has `outputSettings` |

## Module exports

| Export | Description |
|--------|-------------|
| `XSLTProcessor` (also the default export) | The processor class described above |
| `isNativeXSLTSupported()` | `true` when `globalThis.XSLTProcessor` exists and transforms a test document. After `installGlobal()` it tests the installed polyfill |
| `installGlobal(force = false)` | Sets `globalThis.XSLTProcessor` to this implementation when native XSLT is not functional (always with `force`). Returns `true` when installed |
| `serializeResult(node, outputSettings?)` | Serializes a document, fragment or element with `xsl:output` settings, see [below](#serializing-output-xsloutput) |
| `resolveOutputSettings(outputSettings, node)` | Normalizes raw `xsl:output` settings (booleans for `indent`/`omitXmlDeclaration`, a `Set` of CDATA element names, detected method) |
| `markRawText(textNode)`, `isRawText(node)` | Mark / test a text node that is serialized without escaping (`disable-output-escaping`) |
| `evaluateXPath(expr, node, { variables, namespaces }?)` | Evaluates an XPath 1.0 expression; returns a node array, string, number or boolean |
| `selectXPath(expr, node, options?)` | Returns the matching nodes as an array (`[]` for non node-set results) |
| `selectFirstXPath(expr, node, options?)` | Returns the first matching node or `null` |
| `parseXPath(expr)` | Parses an expression into the AST accepted by `XPathEvaluator#evaluate` |
| `XPathEvaluator`, `XPathContext` | Low-level XPath API, see [Custom Security Limits](SECURITY-LIMITS.md#custom-security-limits) |
| `XPathResultType` | The DOM `XPathResult` type constants (`ANY_TYPE` ... `FIRST_ORDERED_NODE_TYPE`) |
| `XsltEngine`, `XsltContext` | The engine behind `XSLTProcessor` (advanced usage) |
| `XSLT_MAX_RESULT_SIZE`, `XSLT_MAX_EXPRESSION_DEPTH` | Default XPath limits inside a transformation (5,000,000 and 1000) |
| `VERSION` | The package version, e.g. `'1.1.3'` |
| `isBrowser`, `isNode` | Environment flags evaluated at load time |

## TypeScript

Declarations ship as `dist/xslt-processor.d.ts` (ESM) and
`dist/xslt-processor.d.cts` (CommonJS) and are picked up automatically through
the `exports` map. The `StylesheetLoader` and `OutputSettings` types are
exported as well.

## Serializing output (xsl:output)

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
| `method="xml"` | XML declaration, minimal escaping, empty elements as `<x/>` (default). Empty elements in the XHTML namespace follow the XHTML compatibility rules below |
| `method="html"` | No XML declaration, void elements as `<br>`, minimized boolean attributes, unescaped `script`/`style` |
| `method="xhtml"` | XML rules, but void elements are written as `<br />` and other empty elements get an end tag (`<script src="a.js"></script>`, `<div></div>`), so the output also parses as HTML. Elements in other namespaces keep `<x/>` |
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

## Parameters Example

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

## Utility Functions

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

## XsltEngine options

`new XsltEngine({ maxResultSize, maxRecursionDepth })` chooses the XPath limits
inside a transformation, see [DoS Prevention Limits](SECURITY-LIMITS.md#dos-prevention-limits).

Other `XsltEngine` options: `stylesheetLoader`, `documentLoader` (see [Loaders](LOADERS.md)) and
`domParser`, a `DOMParser`-compatible object used to parse XML strings returned
by loaders. It defaults to the global `DOMParser` or the stylesheet document's
window, so it only needs to be set for DOM implementations such as
`@xmldom/xmldom` in Node.js. `setStylesheetLoader()` and `setDocumentLoader()`
return the engine, so calls can be chained.

## Asynchronous and streaming API

Non-W3C additions for loading stylesheets over the network and producing
large results incrementally. The synchronous W3C methods are unchanged.

| Method | Description |
|--------|-------------|
| `importStylesheetAsync(style, stylesheetUri?, { loader?, documentLoader?, signal? })` | Loads the `xsl:import`/`xsl:include` tree (in parallel, each URI once) and the literal `document('...')` URIs with `fetch` or a custom loader, then compiles synchronously. `style` may be a Node, a string, bytes, a `ReadableStream` or an async iterable |
| `transformAsync(source, { signal?, stylesheet?, stylesheetUri?, fetchStylesheet?, fetchDocument? })` | Returns a `Promise<string>` with the serialized result; failures reject. Sources may be nodes, strings, bytes, `ReadableStream`s or async iterables, decoded by byte order mark, then the XML declaration's encoding, then UTF-8 |
| `transformToStream(source, { signal?, chunkSize? })` | Returns a `ReadableStream<string>` serialized on demand in chunks of about 16 KiB, with backpressure and cancellation |

```js
// Browser: fetch the stylesheet and everything it imports, then transform
const processor = new XSLTProcessor();
const url = new URL('/xsl/main.xsl', location.href).href;
await processor.importStylesheetAsync((await fetch(url)).body, url);
const html = await processor.transformAsync((await fetch('/data.xml')).body);

// Node.js: pipe a large result without building one big string
import { Readable } from 'node:stream';
Readable.fromWeb(processor.transformToStream(xmlDoc, { signal })).pipe(process.stdout);
```

Limits: XSLT 1.0 needs random access to the whole source and result trees, so
inputs are read fully before parsing and the result tree is built in memory.
Streaming bounds the output text and delivers the first bytes before
serialization ends. The transformation itself is synchronous and cannot be
aborted midway; the signal is honoured while loading and reading, and between
output chunks. Only literal `document('...')` URIs are preloaded; computed ones
use `setDocumentLoader`. Constant-memory input streaming would need XSLT 3.0
streamability.

The building blocks are exported as well: `serializeChunks(node, settings?, { chunkSize? })`,
`DEFAULT_CHUNK_SIZE`, and the engine-level `transformToChunks(engine, node, options)`
and `transformToStream(engine, node, options)`.

`maxTemplateDepth` (default 3000, exported as `XSLT_MAX_TEMPLATE_DEPTH`) limits the nesting of template instantiations, like libxslt's `xsltMaxDepth`: `new XSLTProcessor({ maxTemplateDepth: 10000 })`.

## Opt-in XSLT 2.0/3.0

`new XSLTProcessor({ xsltVersion: "auto" })` runs a stylesheet whose
effective version (the `version` attribute of `xsl:stylesheet`, or
`xsl:version` of a simplified stylesheet) is 2.0 or more with
[`@tradik/xslt3`](XSLT3.md); stylesheets of version 1.0 keep the XSLT 1.0
engine. The default, `xsltVersion: "1.0"`, is unchanged: a `version="2.0"`
stylesheet runs in XSLT 1.0 forwards-compatible mode, as in Chrome.

`@tradik/xslt3` is an optional peer dependency (`npm install @tradik/xslt3`),
loaded with a dynamic `import()` the first time it is needed. Because
`import()` is asynchronous:

- the asynchronous API (`importStylesheetAsync`, `transformAsync`,
  `transformToStream` after an asynchronous import) loads it by itself;
- the synchronous W3C API needs `await XSLTProcessor.preload()` once
  beforehand. Without it, `importStylesheet()` of a 2.0/3.0 stylesheet throws
  `This XSLT 2.0 stylesheet needs @tradik/xslt3: call "await XSLTProcessor.preload()" before importStylesheet(), or use importStylesheetAsync() / transformAsync()`.

When the package is not installed, `preload()` and the asynchronous API
reject with `Cannot load @tradik/xslt3: install @tradik/xslt3 to run XSLT 2.0/3.0 stylesheets`
(the import error is the `cause`).

```javascript
await XSLTProcessor.preload("3.0");
const processor = new XSLTProcessor({ xsltVersion: "auto" });
processor.setStylesheetLoader((href) => readFileSync(fileURLToPath(href), "utf8"));
processor.importStylesheet(xsl30Doc, pathToFileURL("grouping.xsl").href);
processor.setParameter(null, "title", "Report");
const xml = processor.transformToString(xmlDoc);
```

How the API maps onto `@tradik/xslt3`:

| 1.0 API | With `@tradik/xslt3` |
|---------|----------------------|
| `importStylesheet` / `importStylesheetAsync` | `compileStylesheet(style, { baseUri: stylesheetUri })`; static errors (`XTSE...`) are thrown |
| `setParameter` / `getParameter` / `removeParameter` / `clearParameters` / `reset` | Stylesheet parameters by name (`{uri}local` for a namespace). Strings are `xs:string`, numbers `xs:double`, booleans `xs:boolean`; nodes, node lists and arrays are sequences of nodes |
| `transformToString`, `transformAsync`, `transformToStream` | The principal result serialized with its `xsl:output` (Serialization 3.1) |
| `transformToDocument` | As for XSLT 1.0: text output in a `pre` page, html output parsed as HTML, xml output with the `xsl:output` doctype |
| `transformToFragment(source, output)` | A fragment of `output`; html output into an HTML document is parsed by its HTML parser |
| `setStylesheetLoader` | Loads `xsl:include`/`xsl:import` modules (with the resolved URI) |
| `setDocumentLoader` | Loads `doc()` and `document()` (with the resolved URI); a missing document is an error (`FODC0002`), not an empty node-set |
| `clock` option | `current-dateTime()` |
| `xsl:message` | Logged with `console.log("XSLT Message:", text)` |

As with XSLT 1.0, the `transformTo*` methods return `null` and log the error
when the transformation fails. `xsl:result-document` secondary results are not
returned through this API, and `maxTemplateDepth` and `enableDynamicEvaluate`
apply to the XSLT 1.0 engine only (`xsl:evaluate` is part of XSLT 3.0). A
string parameter declared with another type (`as="xs:integer"`) is a type
error (`XTTE0590`); declare it as `xs:string` or untyped, or pass a number.

The library bundles keep `import("@tradik/xslt3")` as an external import: a
browser page loading the IIFE bundle needs an import map for
`@tradik/xslt3`; application bundlers resolve it like any dependency.

## DOM implementations in Node.js

| Feature | jsdom | @xmldom/xmldom 0.9+ |
|---|---|---|
| `importStylesheet`, `transformToString`, async and streaming API | yes | yes |
| `transformToDocument`, xml and text output | yes | yes |
| `transformToDocument`, html output | HTML document with `HTMLElement`s | xmldom HTML document (no `body`/`head` accessors) |
| `transformToFragment` into an XML document | yes | yes |
| `transformToFragment` into an HTML document (real `HTMLElement`s, like Chrome) | yes | no HTML documents |
| Entities from the internal DTD subset | expanded | not expanded |

With xmldom, set `globalThis.DOMParser = DOMParser` (or pass `domParser` to
`XsltEngine`) so string results of loaders can be parsed, and create owner
documents with `new DOMImplementation().createDocument(null, null)`.
linkedom (no XML namespace support) and xmldom 0.8 are not supported.

