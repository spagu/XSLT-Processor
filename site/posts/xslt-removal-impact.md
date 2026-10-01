---
title: "What the end of browser XSLT breaks, and what to do about it"
description: "0.02% of page loads sounds like nothing. In practice it is styled RSS feeds and sitemaps, enterprise web apps, Android WebViews and a lot of XML that people open by hand. Who is affected, how the browsers differ, and the options with their trade-offs."
slug: xslt-removal-impact
status: publish
type: post
date: 2026-10-01T10:00:00Z
---
Chrome's case for removing XSLT rests on two numbers: about **0.02% of page
loads** use XSLT, and **less than 0.001%** use the `xml-stylesheet`
processing instruction ([the background is here](../chrome-is-turning-off-xslt/)).
Put that way it sounds like nothing. It is worth looking at what sits behind
it before deciding that it doesn't concern you.

![Bar chart of XSLT usage per million page loads in Chrome: the XSLTProcessor API between 100 and 1,000, about 500 on average; any XSLT, Chrome's headline figure, 200; the xml-stylesheet processing instruction at most 10](../../images/blog/xslt-usage.svg)

The figures come from Chrome's own use counters. The Chromium team has
described the `XSLTProcessor` count as volatile, between 0.01% and 0.1% of
page loads; the announcement settles on 0.02% for XSLT as a whole. Either
way it is a long tail: a small share of page loads, spread over a lot of
different, often old, systems. Those are the systems least likely to have
someone watching the console for deprecation warnings.

## Who actually uses it

**Feeds and sitemaps.** This is the use most people have seen without knowing
it. Many RSS and Atom feeds, podcast feeds among them, and many XML sitemaps
ship an XSL stylesheet so that a person who opens the URL sees a readable
page instead of tags. Feed readers and search engines never apply the
stylesheet, so subscriptions and indexing keep working. What breaks is the
human view: the link someone pastes into a browser to check that a podcast
exists now shows raw XML in Chrome.

**Web applications built on XML.** Some business software renders its screens
in the browser from XML with XSLT: product lifecycle and document management
systems, reporting tools, internal portals written when XML was the
interchange format of choice. Here nothing degrades gracefully. A screen is
either rendered or blank.

**Documents published as XML.** Standards, legal texts, technical manuals and
data catalogues are sometimes published as XML with a stylesheet, so the same
file is both machine-readable and viewable. These usually sit on someone's
web server for years, untouched.

**Apps that embed a browser.** Android apps that show content in a WebView
follow Chrome: WebView betas switch XSLT off from Chrome 154. Desktop apps
built on Electron or other Chromium embeddings inherit the removal when they
update Chromium. The people affected may not know their app contains a
browser at all.

## The browsers won't agree for a while

Chrome has dates. Microsoft Edge, Opera, Brave, Vivaldi, Samsung Internet and
the other Chromium-based browsers share its engine, so they will lose XSLT
too unless their vendors deliberately keep it. Firefox and Safari both
support the removal but have not announced when.

The result is a period when an XML page renders in Firefox and Safari and
not in Chrome. That is the worst kind of breakage to debug: it works for the
developer on a Mac, and the bug report from a Chrome user says "the page is
just code".

## The options

| Option | Good for | Watch out for |
|---|---|---|
| Transform on the server and send HTML | Feeds, sitemaps, documents, anything you can change on the server | The XML URL now returns HTML, unless you negotiate on the `Accept` header |
| A JavaScript `XSLTProcessor`, such as [@tradik/xslt-processor](../../docs/getting-started/) | Pages that already run JavaScript and call `XSLTProcessor` | Does not help an XML file opened directly: no script runs there |
| Chrome's suggested WASM polyfill or browser extension | Quick fixes, internal users | An extension has to be installed on every machine |
| [Saxon-JS](https://www.saxonica.com/saxon-js/) | XSLT 3.0 in the browser | Stylesheets are compiled to SEF first; commercial licence for some uses |
| Enterprise policy or origin trial | Buying time | Both end with Chrome 176 on 17 August 2027 |

### Example: a page that calls XSLTProcessor

This is the easy case. The code stays the same; only the processor changes
where the browser no longer has one.

```html
<script type="module">
  import { installGlobal, isNativeXSLTSupported }
    from "https://cdn.jsdelivr.net/npm/@tradik/xslt-processor/+esm";

  if (!isNativeXSLTSupported()) installGlobal();

  const [xml, xsl] = await Promise.all(
    ["/report.xml", "/report.xsl"].map(async (url) =>
      new DOMParser().parseFromString(
        await (await fetch(url)).text(), "application/xml")),
  );
  const processor = new XSLTProcessor();
  processor.importStylesheet(xsl);
  document.querySelector("#report")
    .replaceChildren(processor.transformToFragment(xml, document));
</script>
```

We follow Chrome's libxslt behaviour on purpose, so the output matches what
your users saw before, including the odd corners.

### Example: a feed with a stylesheet

For `<?xml-stylesheet type="text/xsl"?>` there is no script to hook into, so
move the transformation to the place that serves the file. With the same
library in Node.js:

```js
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { XSLTProcessor } from "@tradik/xslt-processor";

const parse = (text) =>
  new new JSDOM().window.DOMParser().parseFromString(text, "application/xml");

const processor = new XSLTProcessor();
processor.importStylesheet(parse(await readFile("feed.xsl", "utf8")));
const html = processor.transformToString(parse(await readFile("feed.xml", "utf8")));
// Serve html at /feed.html, or for requests whose Accept header prefers text/html
```

Or once, at build time, with the command line tool: `xslt feed.xml feed.xsl
-o feed.html`. Keep the XML feed as it is for feed readers and link to the
HTML version for people.

## A short checklist

1. Search your code and servers for `XSLTProcessor` and
   `xml-stylesheet … text/xsl`, including feeds, sitemaps and old intranet
   pages.
2. Open what you find in Chrome 143 or later and read the console.
3. Decide per use: server-side for documents and feeds, a JavaScript processor
   for pages that already run scripts.
4. If you need more time, register for the origin trial or set the enterprise
   policy now, and put 17 August 2027 in the calendar.
5. Test in Chrome, Firefox and Safari. They will disagree for a while.

## Sources

- Chrome for Developers, [Removing XSLT for a more secure browser](https://developer.chrome.com/docs/web-platform/deprecating-xslt): dates, usage figures, suggested alternatives
- blink-dev, [Intent to Deprecate and Remove: XSLT](https://groups.google.com/a/chromium.org/g/blink-dev/c/zIg2KC7PyH0): the use counter figures
- Justin Jackson, [Don't kill my pretty RSS feed](https://justinjackson.ca/xslt): the feed case from a publisher's side
- Mozilla, [bug 1990759](https://bugzilla.mozilla.org/show_bug.cgi?id=1990759): Firefox's tracking bug
