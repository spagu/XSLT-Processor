---
title: "Migrating from native XSLT: how-to"
description: "Find the pages that break when Chrome drops XSLT with npx xslt-migrate-check, then fix each with one line: XSLTProcessor pages and <?xml-stylesheet?> XML."
slug: migrating-from-native-xslt
status: publish
type: post
date: 2026-10-02T18:00:00Z
---
On 17 November 2026, Chrome 158 stops running XSLT ([the dates and the
reasons](../chrome-is-turning-off-xslt/)). Two kinds of pages break: pages
whose JavaScript calls `new XSLTProcessor()`, and XML documents the browser
rendered through `<?xml-stylesheet type="text/xsl"?>`. This is the hands-on
part: how to find both in a project, and the one line that fixes each. Every
step below was run in Chromium with XSLT switched off, the configuration
Chrome 158 ships.

## Step 1: find what you have

```sh
npx xslt-migrate-check .
```

The checker walks the project (skipping `node_modules`, build output and the
like, nothing leaves your machine) and prints what it found. Without Node.js
at hand, the [online check](../../check/) runs the same analysis on files you
drop in the browser:

```text
xslt-migrate-check 0.1.0 — scanned 19 files in ./ (0.0 s)

Found 5 XSLTProcessor usages in 2 files
Found 12 XSL stylesheets (10 × XSLT 1.0, 1 × XSLT 2.0, 1 × XSLT 3.0)
Found 3 XML documents rendered with <?xml-stylesheet?>
Chrome compatibility risk: HIGH
  Chrome 158 (17 November 2026) stops running XSLT; these pages break then.

Suggested migration: @tradik/xslt-processor
  One line, before your other scripts, keeps XSLTProcessor working:
  <script src="https://cdn.jsdelivr.net/npm/@tradik/xslt-processor@1/dist/xslt-processor.browser.min.js"></script>
  Inside an XML document rendered with <?xml-stylesheet?>, right after the processing instruction:
  <script xmlns="http://www.w3.org/1999/xhtml" src="https://cdn.jsdelivr.net/npm/@tradik/xslt-processor@1/dist/xslt-processor.browser.min.js"></script>
  XSLT 2.0/3.0 stylesheets: also install @tradik/xslt3 and pass { xsltVersion: "auto" }.
  How-to: https://xslt-processor.tradik.com/blog/migrating-from-native-xslt/
```

Below the summary it lists each finding with its file and line: the
`XSLTProcessor` calls, the XML documents with a processing instruction, and
the stylesheets with their declared version and the features they use
(EXSLT, `disable-output-escaping`, `document()`, and MSXML extensions, which
no browser polyfill can run). The risk is **HIGH** as soon as one page
depends on the browser's XSLT; **MEDIUM** when there are stylesheets but no
usage the scanner can see (a server may be running them, or code it does not
read); **NONE** otherwise. In a pipeline, `npx xslt-migrate-check . --fail-on
high` fails the build until the pages are migrated, and `--json` gives the
same data to tools.

## Step 2: pages that call XSLTProcessor

This is the common case: a page fetches XML and a stylesheet, and runs
`new XSLTProcessor()`, `importStylesheet()` and `transformToFragment()` or
`transformToDocument()`. The fix is one script tag before the scripts that
use it:

```html
<script src="https://cdn.jsdelivr.net/npm/@tradik/xslt-processor@1/dist/xslt-processor.browser.min.js"></script>
```

The bundle checks whether the browser has a working `XSLTProcessor`. If it
does (Firefox, Safari, Chrome until 158), it leaves it alone and your page
keeps using the native one. If it does not, it installs its own
implementation under the same name, with the same methods, the same
parameters and the same results as Chrome's: it passes libxslt's own test
corpus, which is what Chrome runs. Your code does not change. With a bundler
the same thing is an import:

```js
import { installGlobal } from "@tradik/xslt-processor";
installGlobal(); // replaces XSLTProcessor only when the browser has none
```

Two things to check once rather than assume. First, that your stylesheets
are XSLT 1.0 with at most EXSLT extensions: MSXML's `msxsl:script` and
`msxsl:node-set` never worked in Chrome either, so a page that depends on
them is not working today. Second, the output of a transformation on your
data, which the [playground](../../playground/) shows next to the stylesheet
source; the known differences from libxslt are listed in the
[conformance notes](../../docs/conformance/), and so far they are corner
cases such as number formatting beyond 15 significant digits.

## Step 3: XML documents with `<?xml-stylesheet?>`

The harder case. A file like this is served as XML, and the browser has
been turning it into HTML on its own:

```xml
<?xml version="1.0"?>
<?xml-stylesheet type="text/xsl" href="catalog.xsl"?>
<catalog>
  <item id="1">Apples</item>
</catalog>
```

Without XSLT, Chrome 158 shows the XML as a tree of tags, and no script of
yours runs, because there is no HTML page to put one in. Except that there
is a hook: browsers execute an XHTML `<script>` element wherever they find
it in an XML document. So the migration is one line, right after the
processing instruction:

```xml
<?xml version="1.0"?>
<?xml-stylesheet type="text/xsl" href="catalog.xsl"?>
<catalog><script xmlns="http://www.w3.org/1999/xhtml" src="https://cdn.jsdelivr.net/npm/@tradik/xslt-processor@1/dist/xslt-processor.browser.min.js"></script>
  <item id="1">Apples</item>
</catalog>
```

When the bundle loads inside an unstyled XML document that carries an XSLT
processing instruction, it waits for the document to finish parsing, fetches
the stylesheet relative to the document's address (and the stylesheets it
imports or includes), transforms the document, and replaces the document
element with the result. Scripts in the result are re-created so that they
run; `<link>` elements load their stylesheets as usual; the address bar does
not change. The script element itself is removed from the source before the
transformation, so a stylesheet that copies the source does not copy it.

In browsers that still have XSLT, nothing changes: they apply the processing
instruction while parsing and never execute the script. The stylesheet has
to be fetchable from the page's origin (same origin, or CORS headers), which
is already true for a stylesheet the browser was loading itself.

If the XML is generated, add the line in the template that writes it. If
the files are static, a search and replace over the `<?xml-stylesheet`
documents the checker listed does it; the element can also be the last child
of the root element instead of the first, as long as it is inside the
document element.

## Step 4: stylesheets written in XSLT 2.0 or 3.0

Chrome never ran these (libxslt is XSLT 1.0), so a page that uses them
already has its own processor, usually SaxonJS, or runs them on the server.
If you are consolidating, `@tradik/xslt3` runs XSLT 3.0 and 2.0 stylesheets
in JavaScript ([98.2% of the W3C test suite](../release-1-3/)), and
`@tradik/xslt-processor` hands a stylesheet to it when told to:

```js
import { XSLTProcessor } from "@tradik/xslt-processor"; // plus: npm install @tradik/xslt3
const processor = new XSLTProcessor({ xsltVersion: "auto" });
await processor.importStylesheetAsync(stylesheet); // version="2.0" or "3.0"
```

The one-line script tag of steps 2 and 3 runs the XSLT 1.0 engine, so a
`<?xml-stylesheet?>` document whose stylesheet is XSLT 2.0 needs the
bundler route, or the stylesheet rendered on the server (below).

## Step 5: test it today

You do not have to wait for November. Chromium has a switch for the same
feature Chrome 158 removes:

```sh
chrome --disable-blink-features=XSLT https://your.site/page.xml
```

In that browser `typeof XSLTProcessor` is `"undefined"` and processing
instructions are ignored, which is exactly how the fixes above were
verified: the project's browser tests run a Chromium with that flag
alongside Chromium, Firefox and WebKit. Open each page the checker listed,
once with the flag and once without, and compare.

## The alternative: render on the server

A page that is the same for every visitor does not need XSLT in the browser
at all. The `xslt` command line tool (`npm install -g @tradik/xslt-processor`,
or the [standalone binaries](https://github.com/spagu/XSLT-Processor/releases)
with no Node.js) writes the HTML once:

```sh
xslt catalog.xml catalog.xsl -o catalog.html
```

That removes the dependency instead of replacing it, which is the right
answer for documentation sites, feeds with a human-readable view, and
anything built by a pipeline. The browser-side line is for pages that
transform data the server does not have at build time, and for the many
XML documents nobody is going to rebuild.

## Checklist

The [migration wizard](../../migrate/) shows these steps for your project's answers.


1. `npx xslt-migrate-check .` and keep the list.
2. Pages with `XSLTProcessor` in JavaScript: one `<script>` tag before your scripts.
3. XML documents with `<?xml-stylesheet?>`: one `<script xmlns="http://www.w3.org/1999/xhtml">` after the instruction.
4. XSLT 2.0/3.0: `@tradik/xslt3` with `xsltVersion: "auto"`, or render on the server.
5. Open every page in `chrome --disable-blink-features=XSLT`.
6. Add `npx xslt-migrate-check . --fail-on high` to the pipeline, so nothing new slips in.
