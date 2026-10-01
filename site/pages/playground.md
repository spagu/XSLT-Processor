---
title: "XSLT playground"
description: "Run XSLT 1.0 and 3.0 stylesheets and XPath 3.1 expressions on your own XML in the browser: parameters, live preview, result documents, typed items."
slug: playground
link: /playground/
status: publish
type: page
layout: playground
---
The playground has three modes. Nothing is uploaded in any of them, and the
page keeps working without a network connection once it has loaded.

**XSLT 1.0** runs a stylesheet against your XML with the browser bundle of
`@tradik/xslt-processor`, not with the browser's native `XSLTProcessor`, so
the result is the one your users get after Chrome removes native XSLT.

**XSLT 3.0** runs the same editors with `@tradik/xslt3`, the XSLT 3.0 engine
that is in development in this repository ([design and status](../docs/xslt3/)).
It takes XSLT 3.0 and 2.0 stylesheets, and 1.0 ones in backwards-compatible
mode. The examples cover `xsl:for-each-group`, `xsl:analyze-string`, typed
`xsl:function`s, text value templates, `xsl:iterate`, maps and JSON,
`xsl:try`, `xsl:merge`, accumulators and `xsl:result-document`, whose extra
outputs are listed under the result. Errors show their W3C code (`XTSE0010`,
`XPTY0004`...). The link above the editors runs the stylesheet you are
editing with the other engine, so you can compare the two.

**XPath 3.1** evaluates an expression against an XML document with the same
engine and lists every item of the result with its type: `for` and `let`,
maps and arrays, higher-order functions, regular expressions and date
formatting.
