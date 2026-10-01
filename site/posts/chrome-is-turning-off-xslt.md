---
title: "Chrome turns off XSLT on 17 November 2026. How we got here"
description: "Chrome 158 stops running XSLT in November 2026, and the last escape hatches close in August 2027. The dates, the reasons (an unmaintained C library and tiny usage) and what still works."
slug: chrome-is-turning-off-xslt
status: publish
type: post
date: 2026-10-01T09:00:00Z
---
On 17 November 2026, Chrome 158 reaches the stable channel, and XSLT stops
working in it. A page that calls `new XSLTProcessor()` gets a `ReferenceError`.
An XML file that starts with `<?xml-stylesheet type="text/xsl" href="…"?>`
shows up as raw XML instead of the HTML its author intended.

That is seven weeks from today. If you have been meaning to look into it,
this is the week.

## The dates

![Timeline from March 2025 to August 2027: libxslt loses its maintainer, the WHATWG issue, the Chrome 142 warnings, the Chrome 143 deprecation, the enterprise policy and origin trial, the WebView betas, and XSLT going off in Chrome 158 and for everyone in Chrome 176](../../images/blog/chrome-xslt-timeline.svg)

Chrome has been warning about this for a year. Chrome 142 (October 2025)
logged the first console messages. Chrome 143 (December 2025) made the
deprecation official, in DevTools and in Lighthouse. Since then two ways to
buy time have opened:

- an **enterprise policy** (Chrome 146, March 2026), for companies that manage
  their browsers, and
- an **origin trial** (Chrome 152, August 2026), which a site registers for and
  then sends a token with its pages.

Both end with Chrome 176 on 17 August 2027. After that, XSLT is gone from
Chrome for everyone. Android's WebView, which many apps use to show web
content, is switching it off in its beta channels from Chrome 154.

## What exactly goes away

Two things, both of which run XSLT 1.0 in the page:

```js
// 1. The JavaScript API
const processor = new XSLTProcessor();
processor.importStylesheet(xsl);
const fragment = processor.transformToFragment(xml, document);
```

```xml
<!-- 2. The processing instruction at the top of an XML document -->
<?xml version="1.0"?>
<?xml-stylesheet type="text/xsl" href="feed.xsl"?>
<rss version="2.0">…</rss>
```

XML styled with CSS (`type="text/css"`) keeps working. So does XML itself,
`DOMParser`, `XMLSerializer` and `document.evaluate` for XPath. And XSLT on
the server is not affected at all: Saxon, libxslt in your build pipeline and
the .NET and Java processors carry on as before.

## Why Chrome is doing this

The short version from the Chrome team: XSLT in the browser costs a lot of
security work and almost nobody uses it. Both halves deserve a closer look.

### An old C library with nobody looking after it

Chrome (like Safari) runs XSLT through **libxslt**, a C library from the early
2000s that sits on top of libxml2. It parses whatever stylesheet and document
a web page hands it, which makes it attack surface: memory-safety bugs in
code like this can turn into arbitrary code execution. Chrome's
announcement says it plainly: these libraries get "far less maintenance and
security scrutiny than core JavaScript engines".

Then the maintainers ran out. In March 2025 Nick Wellnhofer, who had been
looking after libxslt, stepped down, which left it more or less unmaintained.
In June 2025 he announced he would treat security reports for libxml2 like
ordinary bugs, fixed when there is time, because triaging them took several
unpaid hours a week. In September 2025 he stepped down from libxml2 as well.

A browser can't ship a parser for untrusted input that no one is fixing.
Chrome's options were to take over libxslt, rewrite XSLT in a memory-safe
language, or drop it. Given the usage numbers, it chose the last.

### Very few pages use it

Chrome counts how often features are used. Its announcement puts XSLT at
**about 0.02% of page loads**, and the `xml-stylesheet` processing instruction
below **0.001%**. Two out of every ten thousand page loads is small, but at
Chrome's scale it is still a lot of pages, which is why the removal is
spread over two years with ways out. We look at who those pages belong to in
[What the end of browser XSLT breaks](../xslt-removal-impact/).

### Not just Google

It's tempting to read this as Google deciding on its own. The record says
otherwise. The proposal was raised in a WHATNOT meeting of the browser
vendors, where it came from someone at Mozilla. Mason Freed from Google then
opened [WHATWG issue #11523](https://github.com/whatwg/html/issues/11523) on
1 August 2025, asking whether XSLT should be removed from the web platform.
Mozilla's recorded standards position on removal is positive, and WebKit
signalled support too. Eric Meyer, who is no fan of the decision, wrote a
careful account of this in
[No, Google did not unilaterally decide to kill XSLT](https://meyerweb.com/eric/thoughts/2025/08/22/no-google-did-not-unilaterally-decide-to-kill-xslt/).

What is true is that Chrome moves first and has the dates. Firefox tracks the
work in [bug 1990759](https://bugzilla.mozilla.org/show_bug.cgi?id=1990759)
and Safari has said it supports the removal, but neither has announced when.
For a while, the same XML page will render in Firefox and Safari and not in
Chrome.

## Find out whether you are affected

Search your code and your servers for the two patterns:

```sh
grep -rnE 'XSLTProcessor|xml-stylesheet[^>]*text/xsl' \
  --include='*.js' --include='*.ts' --include='*.html' \
  --include='*.xml' --include='*.xsl' --include='*.xslt' .
```

Then open the pages in Chrome 143 or later with DevTools: each use logs a
deprecation warning in the console. A Lighthouse run lists them as well. Don't
forget the places nobody opens in a browser any more: RSS and Atom feeds,
sitemaps, generated reports and anything served from an intranet.

## What we built

This site exists because of this change. **@tradik/xslt-processor** is the
browser's `XSLTProcessor`, reimplemented in JavaScript with no dependencies,
following Chrome's libxslt behaviour. Load it where the native one is missing,
and existing code keeps running:

```js
import { installGlobal, isNativeXSLTSupported } from "@tradik/xslt-processor";

if (!isNativeXSLTSupported()) installGlobal();
// new XSLTProcessor() works again, now in JavaScript
```

The other paths, and when each one makes sense, are in the follow-up
article. And because a JavaScript library doesn't have to stop at the XSLT
1.0 browsers shipped, we are also building
[XSLT 2.0 and 3.0](../xslt3-in-javascript/).

## Sources

- Chrome for Developers, [Removing XSLT for a more secure browser](https://developer.chrome.com/docs/web-platform/deprecating-xslt) (updated 29 October 2025): dates, reasons, usage figures
- blink-dev, [Intent to Deprecate and Remove: XSLT](https://groups.google.com/a/chromium.org/g/blink-dev/c/CxL4gYZeSJA)
- WHATWG, [issue #11523](https://github.com/whatwg/html/issues/11523) and Mozilla's [standards position](https://github.com/mozilla/standards-positions/issues/1287)
- GNOME Discourse, [Stepping down as libxslt maintainer](https://discourse.gnome.org/t/stepping-down-as-libxslt-maintainer/27615)
- LWN, [Removing XSLT from Chromium](https://lwn.net/Articles/1045161/)
