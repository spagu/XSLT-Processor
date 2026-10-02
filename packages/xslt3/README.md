# @tradik/xslt3

[![npm version](https://img.shields.io/npm/v/@tradik/xslt3.svg)](https://www.npmjs.com/package/@tradik/xslt3)
[![License: BSD-3-Clause](https://img.shields.io/badge/License-BSD--3--Clause-blue.svg)](https://opensource.org/licenses/BSD-3-Clause)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.8-brightgreen.svg)](https://nodejs.org/)

XSLT 3.0 and XPath 3.1 in JavaScript, with no runtime dependencies. It also
runs XSLT 2.0 stylesheets, and 1.0 ones in backwards-compatible mode, in
Node.js and in browsers, on any DOM (the browser's, jsdom, @xmldom/xmldom).

| W3C test suite | Applicable tests | Passing |
|---|---:|---:|
| qt3tests (XPath 3.1, functions and operators) | 21,787 | 99.9% |
| xslt30-test (XSLT 3.0 and 2.0) | 7,914 | 98.2% |

Schema awareness and streaming are not supported (stylesheets that ask for
streaming run without it).

## Install

```sh
npm install @tradik/xslt3
```

## XSLT 3.0

```js
import { compileStylesheet, serialize } from "@tradik/xslt3";

const parseXml = (text) =>
  new DOMParser().parseFromString(text, "application/xml");

const stylesheet = compileStylesheet(
  `<xsl:stylesheet version="3.0" expand-text="yes"
       xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
     <xsl:output method="html" html-version="5"/>
     <xsl:template match="orders">
       <ul>
         <xsl:for-each-group select="order" group-by="@city">
           <xsl:sort select="current-grouping-key()"/>
           <li>{current-grouping-key()}: {sum(current-group()/@total)}</li>
         </xsl:for-each-group>
       </ul>
     </xsl:template>
   </xsl:stylesheet>`,
  { parseXml },
);

const result = stylesheet.transform({ source: parseXml(ordersXml) });
serialize([result.principal].flat(), result.output);
// <ul><li>Gdańsk: 80</li><li>Kraków: 162.75</li></ul>
```

`transform()` returns the principal result, the `xsl:result-document`
outputs (a `Map` by URI), the `xsl:message` output and the `xsl:output`
parameters. An `XSLTProcessor` class with the browser's method names is also
exported.

## XPath 3.1

```js
import { compileXPath, evaluateXPath } from "@tradik/xslt3";

evaluateXPath("sum((1, 2, 3)) * 2", null); // [xs:integer 12]

const query = compileXPath("//item[@price > $min]/@id ! string()", {
  variables: ["min"],
});
query.evaluate(document, { variables: { min: 10 } });
```

## Through the XSLT 1.0 package

[@tradik/xslt-processor](https://www.npmjs.com/package/@tradik/xslt-processor),
the browser `XSLTProcessor` with Chrome's XSLT 1.0 behaviour, hands
stylesheets that declare version 2.0 or 3.0 to this package when you opt in:

```js
const processor = new XSLTProcessor({ xsltVersion: "auto" });
await processor.importStylesheetAsync(stylesheet);
```

## Security

Expressions and stylesheets read nothing outside the data you pass unless you
allow it: `doc()` needs a `documentLoader`, `unparsed-text()` and `json-doc()`
a `textLoader`, `collection()` a `collections` option. `xsl:evaluate` can be
switched off for untrusted input with `transform({ dynamicEvaluation: false })`.

## Documentation

- [Design, options and results](https://github.com/spagu/XSLT-Processor/blob/main/docs/XSLT3.md)
- [Benchmarks](https://github.com/spagu/XSLT-Processor/blob/main/docs/BENCHMARKS.md)
- [Playground](https://xslt-processor.tradik.com/playground/?mode=xslt3) (XSLT 3.0 and XPath 3.1 in the browser)
- [Changelog](https://github.com/spagu/XSLT-Processor/blob/main/CHANGELOG.md)

## License

BSD-3-Clause, see [LICENSE.md](LICENSE.md).
