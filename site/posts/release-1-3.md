---
title: "1.3.0: XSLT 3.0 in JavaScript, one option away"
description: "@tradik/xslt3 1.0.0 is out: XSLT 3.0 and XPath 3.1 in JavaScript, 98.2% of the W3C XSLT tests, faster than our XSLT 1.0 engine on the same stylesheets. @tradik/xslt-processor 1.3.0 reaches it with xsltVersion: \"auto\"."
slug: release-1-3
status: publish
type: post
date: 2026-10-02T12:00:00Z
---
Two releases today. **@tradik/xslt3 1.0.0** is a new package: XSLT 3.0 and
XPath 3.1 in JavaScript, which also runs XSLT 2.0 stylesheets. And
**@tradik/xslt-processor 1.3.0**, the browser `XSLTProcessor` replacement, can
now hand a 2.0 or 3.0 stylesheet to it when you ask. Nothing changes for
anyone who doesn't ask: XSLT 1.0 keeps Chrome's behaviour, by default, as
before.

## One option

```js
import { XSLTProcessor } from "@tradik/xslt-processor";

const processor = new XSLTProcessor({ xsltVersion: "auto" });
await processor.importStylesheetAsync(stylesheet); // version="3.0"
const text = await processor.transformAsync(orders);
// "Kraków: 162.75\nGdańsk: 80\n"
```

With `xsltVersion: "auto"`, a stylesheet that declares version 2.0 or 3.0 runs
on @tradik/xslt3, which is loaded with `import()` at that moment. Version 1.0
stylesheets stay on the XSLT 1.0 engine. The synchronous W3C API works too,
after `await XSLTProcessor.preload()`. On the command line it is
`xslt data.xml style.xsl --xslt-version auto`, and the standalone executables
include the new engine, so it works there without installing anything. Why
the two engines are separate packages is in
[an earlier post](../xslt3-in-javascript/).

## How complete it is

The W3C publishes test suites for its specifications, and we run both on
every change:

| Suite | Applicable tests | Passing |
|---|---:|---:|
| qt3tests: XPath 3.1, functions and operators | 21,787 | **99.9%** |
| xslt30-test: XSLT 3.0 and 2.0 | 7,914 | **98.2%** |

That covers grouping, regular expressions, `xsl:function`, typed variables,
tunnel parameters, `xsl:result-document`, `xsl:iterate`, `xsl:try`, maps,
arrays, JSON in and out, accumulators, `xsl:merge`, packages and
`xsl:evaluate`. Two things are out of scope: schema awareness, and streaming
(stylesheets that ask for it run without it). Of the 142 failing tests, about
twenty expect whitespace that the reference processor's test driver drops,
some need what a DOM cannot do (external entities, XInclude), and about a
dozen contradict the current specification.

## And it is faster

We expected a full XSLT 3.0 engine to cost speed on plain XSLT 1.0
stylesheets. It turned out the other way round:

![Chart of the time ratio between @tradik/xslt3 and the XSLT 1.0 engine on nine XSLT 1.0 stylesheets, log scale: xslt3 is faster on most of them, by up to five times on a 100 MB text result, and close to equal on the catalogue, the identity transform and Muenchian grouping](../../images/blog/release-1-3-xslt-ratio.svg)

On the same XSLT 1.0 stylesheets, @tradik/xslt3 is **2.1 times faster** than
our XSLT 1.0 engine on jsdom and **1.9 times** on @xmldom/xmldom (geometric
mean over nine scenarios), with identical output. The same tasks rewritten
in XSLT 3.0 style gain another **1.7 times**: Muenchian grouping turned into
`xsl:for-each-group` is almost four times faster. XPath alone is
**3.2 times** faster than our XPath 1.0 on jsdom. The full tables, memory and
start-up figures are in the [benchmarks](../../docs/benchmarks/).

Some of that comes back to the 1.0 package too. 1.3.0 fixes slow sorting of
large node-sets in the standalone XPath API on @xmldom/xmldom, where
`sum(//item/@price)` over 20,000 items took 28 seconds and now takes 30
milliseconds.

## Try it

The [playground](../../playground/?mode=xslt3) has an XSLT 3.0 mode with
twelve examples, and a link that runs the stylesheet you are editing in the
other engine, so you can compare the two. To install:

```sh
npm install @tradik/xslt-processor @tradik/xslt3
```

The full list of changes is in the [changelog](../../changelog/), the
options and limits of the new engine in
[XSLT 2.0 and 3.0](../../docs/xslt3/).
