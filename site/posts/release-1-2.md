---
title: "Looking back at 1.2.0 and 1.2.1: Chrome's behaviour, 3,000-level recursion, and a release that broke on macOS"
description: "What changed in @tradik/xslt-processor 1.2: every libxslt conformance test passing, deep recursion on an explicit stack, faster and leaner transformations, streaming, xmldom, standalone binaries, and the 1.2.1 fix that followed the same evening."
slug: release-1-2
status: publish
type: post
date: 2026-09-30T18:00:00Z
---
Version 1.2.0 went out on 30 September 2026, and 1.2.1 followed a few hours
later. The second one exists because of a bug in our own tests, and we will
get to that. First, what 1.2 is about: making the JavaScript `XSLTProcessor`
behave like the one Chrome is about to switch off, on the inputs real
stylesheets throw at it.

## It behaves like Chrome, test for test

Chrome runs XSLT through libxslt, so "behave like Chrome" has a measurable
meaning: pass libxslt's own regression tests. 1.2.0 passes all **299** cases of
the libxslt 1.1.45 corpus that apply to a JavaScript processor (32 more are
skipped because they depend on DTDs, extension functions or implementation
choices). Getting there meant a long list of small things that only show up
in real stylesheets: duplicate named templates rejected at import precedence,
`xsl:namespace-alias` with `#default`, HTML URI attributes escaped the way
libxml2 does, `xsl:number` with negative values, and many more.

One of them changes behaviour on purpose. Unprefixed name tests such as
`item` or `@id` now match only nodes in no namespace, as XPath 1.0 says and
as libxslt does. Earlier versions also matched elements in a default
namespace. If you relied on that, `new XSLTProcessor({ legacyNameTests: true
})` restores the old matching while you fix the stylesheet.

## Recursion 3,000 levels deep

XSLT 1.0 has no loops, so stylesheets recurse: a named template that calls
itself with `$n - 1` is the standard way to repeat something `n` times. In 1.1
the JavaScript call stack ran out after about 1,000 to 1,400 levels. libxslt
allows 3,000, and real stylesheets get close to that.

1.2 runs templates from an explicit work stack instead of nested JavaScript
calls, so the depth no longer depends on the engine's stack size. 3,000
levels work in Node.js and in every browser, and you can allow more:

```js
const processor = new XSLTProcessor({ maxTemplateDepth: 20000 });
processor.importStylesheet(countdown); // calls itself with $n - 1
processor.transformToString(input);    // 15,000 levels: "reached the bottom"
```

Past the limit you get a clear error ("Template recursion too deep") rather
than a `RangeError` from somewhere inside the engine. The serializer got the
same treatment: result trees nested 50,000 elements deep are written without
recursion.

## Faster, and lighter on memory

![Chart of the speed-up of 1.2.0 over 1.1.3 per benchmark scenario, on a log scale: faster in all ten compared scenarios, up to 1.81 times on a 100 MB text result](../../images/blog/release-1-2-speedup.svg)

We compared 1.1.3 and 1.2.0 on the same machine with the same inputs
([full method and tables](../../docs/benchmarks/)). 1.2.0 is faster in every
scenario: **1.39 times on geometric mean**, up to **1.81 times** on a 100 MB
text result, and the largest case needs **58% less memory** (1,557 MB down to
650 MB), because the result is written in chunks instead of one growing
string.

The benchmark also caught a regression before it shipped. The first run had
Muenchian grouping at 0.88 times the speed of 1.1.3: the new document-order
index looked up every attribute's position in its element, even when no two
attributes shared one. With that fixed, the same scenario is 1.09 times faster
than 1.1.3 instead of slower.

## Streaming and an asynchronous API

The W3C `XSLTProcessor` API is synchronous and returns whole results. 1.2 adds
an asynchronous side for the cases where that is awkward: stylesheets that
import other stylesheets over the network, inputs that arrive as streams, and
results too large to hold as one string.

```js
await processor.importStylesheetAsync((await fetch(url)).body, url);
const html = await processor.transformAsync((await fetch("/data.xml")).body);

// Or serialize on demand, with backpressure and cancellation
Readable.fromWeb(processor.transformToStream(xmlDoc, { signal }))
  .pipe(process.stdout);
```

`xsl:import` and `xsl:include` trees are fetched in parallel, each URI once,
and inputs are decoded from bytes by byte order mark, then the XML
declaration, then UTF-8.

## Beyond jsdom

The library always needed a DOM in Node.js, and that meant jsdom. 1.2 also
works with **@xmldom/xmldom**, which is much lighter. That exposed a problem:
xmldom's `compareDocumentPosition` is written in JavaScript, so sorting nodes
into document order one comparison at a time was slow. Transformations now
number each tree once per run instead. One union-heavy transformation on
xmldom went from about 150 seconds to 0.7. The command line tool can use it
too (`XSLT_DOM=xmldom`), which made it 2.6 times faster end to end than with
jsdom.

## No Node.js required

The `xslt` command line tool now also ships as standalone executables for
Linux (x64, ARM64), macOS (Intel, Apple silicon) and Windows. They contain
their own Node.js runtime, start in about 28 ms, and install with one line:

```sh
curl -fsSL https://raw.githubusercontent.com/spagu/XSLT-Processor/main/scripts/install.sh | bash
xslt data.xml style.xsl -o page.html
```

## And then 1.2.1

The release workflow builds each executable on its own operating system and
tests the build scripts there first. On macOS two tests failed: the temporary
directory `/var/folders/...` is a symbolic link to `/private/var/...`, the
scripts compared real paths, and the tests did not. On Windows the test that
builds a sample archive called `tar` from Git Bash, which reads `C:\...` as the
name of a remote host. Neither had ever run outside Linux before the release.

The library itself was fine, but the macOS and Windows executables were
missing from the release. 1.2.1 fixes the two tests and nothing else, and CI
now runs the binary scripts on macOS and Windows for every pull request, so
the next platform-only failure shows up before a release instead of after
it.

The lesson is an old one: a test that has only ever run on one operating
system has only been tested on one operating system.

## Where to get it

The executables and their checksums are on the
[GitHub release page](https://github.com/spagu/XSLT-Processor/releases/tag/v1.2.1).
Publishing to npm moved to trusted publishing in this cycle and is catching up
with the releases; the [changelog](../../changelog/) has the full list of
changes.

Next up is 1.3, which adds an opt-in route from the same `XSLTProcessor` to
XSLT 2.0 and 3.0. Why that is a separate engine is in
[XSLT 2.0 and 3.0 in JavaScript](../xslt3-in-javascript/).
