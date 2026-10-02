---
title: "XSLT 2.0 and 3.0 in JavaScript: why @tradik/xslt3 is a separate package"
description: "Browsers only ever ran XSLT 1.0. Now that they are dropping it, a JavaScript library is free to go further. How we are building XSLT 2.0 and 3.0 as a separate engine, what already works (XPath 3.1 passes 95.4% of the W3C tests), and what comes next."
slug: xslt3-in-javascript
status: publish
type: post
date: 2026-10-01T11:00:00Z
---
Every browser that ever ran XSLT ran version 1.0, the 1999 recommendation.
Chrome and Safari used libxslt, Firefox its own TransforMiiX. XSLT 2.0
arrived in 2007 and 3.0 in 2017, with grouping, regular expressions, real
functions, maps, JSON and a much stronger XPath, and the browsers never
followed. For anyone writing XSLT for the web, 1999 stayed the ceiling.

With browsers [turning XSLT off](../chrome-is-turning-off-xslt/), that ceiling
is gone too. A JavaScript processor doesn't have to imitate a native
implementation that will no longer exist. So, next to our XSLT 1.0
processor, we are building XSLT 2.0 and 3.0.

## Two packages, not one

The obvious move would be to add 2.0 and 3.0 to `@tradik/xslt-processor`. We
decided against it.

`@tradik/xslt-processor` is a replacement for the browser's `XSLTProcessor`.
People use it so that pages written for Chrome keep behaving exactly as they
did, quirks included. An XSLT 3.0 processor running a 1.0 stylesheet in its
backwards-compatible mode is close, but not identical: errors, `xsl:number`
and serialization differ in the details, and those details are what users of a
replacement notice. It would also make the package several times larger for
everyone, including the people who only need 1.0.

So the new engine is a separate package, **@tradik/xslt3**, in the same
repository:

| | @tradik/xslt-processor | @tradik/xslt3 |
|---|---|---|
| Runs | XSLT 1.0, XPath 1.0, EXSLT | XSLT 3.0 and XPath 3.1; 2.0 stylesheets; 1.0 in backwards-compatible mode |
| Behaves like | Chrome (libxslt) | the W3C specifications |
| Runtime dependencies | none | none |
| Status | stable, 1.2 | in development |

There is one engine for 2.0 and 3.0, not two. XSLT 3.0 is a superset of 2.0,
and the specification requires a 3.0 processor to run 2.0 stylesheets, so a
separate 2.0 engine would only duplicate the type system, the function
library and most instructions.

Later, the two will be connected, but only on request. `XSLTProcessor` will
accept `xsltVersion: "auto"`, and a stylesheet that declares version 2.0 or
3.0 will then be handed to @tradik/xslt3, loaded with `import()` at that
moment and only if it is installed. Without the option nothing changes. If you
only use 1.0, you never download or load a line of 2.0 code.

## Why bother: grouping, for example

Grouping shows the difference between the versions better than any feature
list. Here is "orders per city" in XSLT 1.0, with the Muenchian method that
every XSLT developer has copied from somewhere at least once:

```xml
<xsl:key name="by-city" match="order" use="@city"/>

<xsl:template match="orders">
  <xsl:for-each select="order[generate-id() =
                              generate-id(key('by-city', @city)[1])]">
    <xsl:sort select="@city"/>
    <h2><xsl:value-of select="@city"/></h2>
    <p><xsl:value-of select="sum(key('by-city', @city)/@total)"/></p>
  </xsl:for-each>
</xsl:template>
```

And in XSLT 2.0:

```xml
<xsl:template match="orders">
  <xsl:for-each-group select="order" group-by="@city">
    <xsl:sort select="current-grouping-key()"/>
    <h2><xsl:value-of select="current-grouping-key()"/></h2>
    <p><xsl:value-of select="sum(current-group()/@total)"/></p>
  </xsl:for-each-group>
</xsl:template>
```

Same output, and the second version says what it means. The same pattern
repeats across the language: `xsl:analyze-string` instead of recursive
`substring-before` templates, `xsl:function` instead of named templates
pretending to be functions, `format-date` instead of a hand-written calendar,
and in 3.0, maps, arrays and JSON input and output. The XSLT part of the new
engine is being written right now; the XPath part is further along.

## What already works: XPath 3.1

An XSLT processor is mostly an XPath engine with templates around it, so we
started there. `@tradik/xslt3` already evaluates XPath 3.1 on its own,
against any DOM: jsdom, @xmldom/xmldom or the browser's.

```js
import { evaluateXPath } from "@tradik/xslt3";

evaluateXPath(`
  let $orders := //order return
    for $city in sort(distinct-values($orders/@city))
    return $city || ': ' || sum($orders[@city = $city]/@total)
`, ordersDocument);
// "Gdańsk: 80", "Kraków: 162.75"

evaluateXPath(`(1 to 10)[. mod 2 = 0] ! (. * .) => sum()`, null);  // 220
evaluateXPath(`format-date(xs:date('2026-11-17'), '[D1o] [MNn] [Y]')`, null);
// "17th November 2026"
evaluateXPath(`string(xs:date('2027-08-17') - xs:date('2026-10-01'))`, null);
// "P320D": days until Chrome's escape hatches close
```

Decimals are exact (no `0.1 + 0.2` surprises), dates and durations have time
zones, and regular expressions use the XSD syntax, translated to JavaScript,
character class subtraction included.

## How we measure it

The W3C publishes test suites for its specifications: **qt3tests** for XPath
3.1 and its function library, and **xslt30-test** for XSLT 3.0. We run them in
CI on every change. Of the 31,821 XPath tests, 21,787 apply to a processor
like ours (the rest are XQuery, schema-aware features or similar). Today
20,778 of those pass, **95.4%**:

![Bar chart of qt3tests pass rates per area: operators, math and types 100%, expressions 99.3%, maps 99.1%, arrays 98.9%, use cases 97.7%, miscellaneous 95.5%, functions 90.1%](../../images/blog/xslt3-qt3-pass-rate.svg)

Most of what fails is in the function library, and most of that is functions
we haven't written yet: JSON (`parse-json`, `json-to-xml`, `xml-to-json`),
`serialize`, `parse-ietf-date` and `unparsed-text`. They are in progress. Each
passing test goes into a baseline, so a test that passes once is not allowed to
fail again.

## What comes next

| Milestone | What it brings |
|---|---|
| 0.1 | XPath 3.1 complete, published to npm |
| 0.2 | XSLT 2.0: templates, modes, grouping, `xsl:analyze-string`, `xsl:function`, tunnel parameters, `xsl:result-document` |
| 0.3 | XSLT 3.0: `xsl:iterate`, `xsl:try`, text value templates, maps and arrays, JSON in and out, accumulators |
| 1.0 | published W3C pass rates, the opt-in bridge from `XSLTProcessor`, benchmarks against the 1.0 package and Saxon-JS |

Some things are deliberately out of scope: schema awareness, real streaming
(streamable stylesheets will run, just not in constant memory) and XQuery.

If you need XSLT 3.0 in the browser today, Saxon-JS from Saxonica is the
established choice. What we want to offer is something else: BSD-licensed,
no runtime dependencies, no compile step for stylesheets, and an upgrade path
that starts from the `XSLTProcessor` code you already have.

The design notes and the current numbers are in
[XSLT 2.0 and 3.0](../../docs/xslt3/), updated as we go. Follow this blog by
[RSS](../rss.xml) for the milestones.
