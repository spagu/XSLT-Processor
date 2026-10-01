---
title: "XSLT playground"
description: "Run XSLT 1.0 stylesheets and XPath 3.1 expressions against your own XML in the browser: parameters, a live preview, maps, arrays and typed results."
slug: playground
link: /playground/
status: publish
type: page
layout: playground
---
The playground has two modes. Nothing is uploaded in either, and the page
keeps working without a network connection once it has loaded.

**XSLT 1.0** runs a stylesheet against your XML with the browser bundle of
`@tradik/xslt-processor`, not with the browser's native `XSLTProcessor`, so
the result is the one your users get after Chrome removes native XSLT.

**XPath 3.1** evaluates an expression against the same kind of XML document
and lists every item of the result with its type: `for` and `let`, maps and
arrays, higher-order functions, regular expressions and date formatting. It
comes from `@tradik/xslt3`, the XSLT 3.0 engine that is in development in this
repository ([design and status](../docs/xslt3/)). XSLT 2.0 and 3.0 stylesheets
will join the playground when the XSLT part of that engine is ready.
