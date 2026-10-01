# XSLT 2.0 and 3.0: design decision

Status: **in development**, nothing released yet. This page records how
XSLT 2.0, XSLT 3.0 and XPath 3.1 are being added and why; it changes when the
plan does.

## Decision

| Package | Covers | Dependencies |
|---|---|---|
| `@tradik/xslt-processor` (this package) | XSLT 1.0, XPath 1.0, EXSLT: the browser `XSLTProcessor` with Chrome (libxslt) behaviour | none |
| `@tradik/xslt3` (new, `packages/xslt3/` in this repository) | XSLT 3.0 and XPath 3.1, which also run `version="2.0"` stylesheets and `version="1.0"` ones in backwards-compatible mode | none at run time |

- **One engine for 2.0 and 3.0.** XSLT 3.0 is a superset of 2.0, and a 3.0
  processor must accept 2.0 stylesheets (XSLT 3.0 section 3.9). A separate
  2.0 engine would duplicate the data model, the function library and most
  instructions.
- **1.0 stays separate and unchanged.** Pages and applications that replace
  the browser's native `XSLTProcessor` need libxslt's XSLT 1.0 behaviour, not
  a 3.0 processor's backwards-compatible mode, which differs in details
  (errors, `xsl:number`, serialization). The 1.0 package keeps its size and
  its zero dependencies: nobody who uses 1.0 downloads or loads 2.0/3.0 code.
- **Opt-in bridge.** A later 1.x release adds `xsltVersion: "auto"` to
  `XSLTProcessor`: a stylesheet that declares version 2.0 or 3.0 is then run by
  `@tradik/xslt3`, loaded with `import()` only at that moment and only when it
  is installed (optional peer dependency). Without the option nothing changes:
  a `version="2.0"` stylesheet runs in XSLT 1.0 forwards-compatible mode, as in
  Chrome.
- **Inside `@tradik/xslt3`**, rarely used parts (regular expressions,
  date/number formatting, JSON) live in their own modules so bundlers and
  `import()` keep them out of programs that do not use them.

## Scope

Target: a **basic XSLT 3.0 processor** (XSLT 3.0 section 27) with XPath 3.1,
maps, arrays, higher-order functions and JSON, and Serialization 3.1.

Not planned: schema awareness (`xsl:import-schema` with a schema), streaming
(`xsl:mode streamable="yes"` runs, without streaming guarantees), static
typing and XQuery.

## Implementation-defined limits

| Item | Value |
|---|---|
| `xs:decimal` and `xs:integer` | exact, unbounded (BigInt) |
| Decimal division (`div`) | at least 18 fraction digits, more when an operand has more, rounded half-down |
| `xs:double`, `xs:float` | IEEE 754 (JavaScript numbers; float through `Math.fround`) |
| Years | -999,999,999 to 999,999,999 (XSD 1.1: year 0 exists) |
| Implicit timezone | an option, default UTC |
| `xs:anyURI` | lexical form not validated |

## Milestones

| Milestone | Content |
|---|---|
| 0.1 | XPath 3.1 on its own: parser, data model (sequences, atomic types, casting), path expressions over DOM nodes, FLWOR, maps, arrays, inline and dynamic functions, the core function library |
| 0.2 | XSLT 2.0 instructions: grouping, `xsl:analyze-string`, `xsl:function`, typed variables, tunnel parameters, `xsl:result-document`, character maps |
| 0.3 | XSLT 3.0: `xsl:iterate`, `xsl:try`, text value templates, `xsl:evaluate`, accumulators, `xsl:merge`, static parameters and `use-when`, JSON and adaptive output |
| 1.0 | Conformance against the W3C test suites published, the bridge in `@tradik/xslt-processor`, benchmarks in [BENCHMARKS.md](BENCHMARKS.md): the 1.0 package against the new engine on the same stylesheets, 2.0/3.0-only scenarios, and Saxon-JS as the reference 3.0 processor in JavaScript |

## Conformance

Measured with the W3C suites, fetched at test time and not committed:
[qt3tests](https://github.com/w3c/qt3tests) for XPath 3.1 and its functions,
and [xslt30-test](https://github.com/w3c/xslt30-test) for XSLT 3.0 and 2.0.
Pass rates per feature are published here as they come in.

### Current results

| Suite | Stage | Applicable | Pass | Rate |
|---|---|---:|---:|---:|
| qt3tests (XPath 3.1) | parsing and static analysis | 21,787 | 21,759 | 99.9% |
| qt3tests (XPath 3.1) | evaluation, all families | 21,787 | 21,767 | 99.9% |
| xslt30-test (XSLT 3.0 and 2.0) | transformation, all families | 7,734 | 6,277 | 81.2% |

The 20 remaining evaluation failures are `collation-key` with UCA collations
(JavaScript's `Intl` exposes no sort keys), `fn:transform` and
`load-xquery-module` (not offered by a basic processor), and three cases where
the DOM implementation used by the test runner (@xmldom/xmldom) does not
normalize `xml:id`, apply DTD default attributes or resolve external entities.
The parse stage misses only XQuery-only errors and static typing (XPST0005).

XSLT per family:

| Family | Applicable | Pass | Rate |
|---|---:|---:|---:|
| expr (expressions in stylesheets) | 635 | 624 | 98.3% |
| misc | 1,822 | 1,710 | 93.9% |
| type (types and conversions) | 768 | 695 | 90.5% |
| fn (XSLT functions) | 1,110 | 952 | 85.8% |
| attr (attributes and AVTs) | 993 | 806 | 81.2% |
| insn (instructions) | 1,355 | 965 | 71.2% |
| decl (declarations) | 1,051 | 525 | 50.0% |

Not done yet (task 0031): packages (`xsl:use-package`, most of the 371 tests
not run), `xsl:accumulator`, `xsl:merge`, `xsl:iterate`, `xsl:on-empty`,
`xsl:on-non-empty`, `xsl:where-populated` and `xsl:evaluate`; several
static error codes are reported as XTSE0010 because the instruction is not
known yet.

## Using XSLT 3.0

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

`transform()` returns the principal result, the secondary results of
`xsl:result-document` (a `Map` by URI), the `xsl:message` output and the
serialization parameters of `xsl:output`. Recursion runs on an explicit work
stack, so templates nested 10,000 deep work (`maxDepth` sets the limit). An
`XSLTProcessor` class with the browser's method names is also exported.

## Using XPath 3.1

```js
import { compileXPath, evaluateXPath } from "@tradik/xslt3";

evaluateXPath("sum((1, 2, 3)) * 2", null); // [xs:integer 12]

const query = compileXPath("//item[@price > $min]/@id ! string()", {
  variables: ["min"],
});
query.evaluate(document, { variables: { min: 10 } }); // strings
```

Expressions cannot reach outside the data you give them unless you allow it:
`doc()` needs a `documentLoader`, `unparsed-text()` and `json-doc()` a
`textLoader`, `collection()` a `collections` option. To let trusted
expressions read local files in Node.js, pass the exported `readFileUri`:

```js
import { evaluateXPath, readFileUri } from "@tradik/xslt3";

evaluateXPath("json-doc('file:///srv/data/config.json')?name", null, {
  textLoader: readFileUri,
});
```

The website's [playground](https://xslt-processor.tradik.com/playground/?mode=xpath)
has an XPath 3.1 mode that runs this function in the browser, with examples
of `for`/`let`, `sort`, maps, regular expressions, formatting, `=>` and
`fold-left`. XSLT 2.0 and 3.0 stylesheets join it once the XSLT part is ready.

Values are returned as data model items (`{ type, value }` for atomic values,
DOM nodes, maps, arrays and functions). JavaScript values passed as
variables are converted: string to `xs:string`, number to `xs:double`,
BigInt to `xs:integer`, boolean, `Date` to `xs:dateTime`, arrays to
sequences, plain objects and `Map`s to maps.
