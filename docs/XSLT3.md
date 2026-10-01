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
| qt3tests (XPath 3.1) | evaluation, all families | 21,787 | 20,778 | 95.4% |

Evaluation per family:

| Family | Applicable | Pass | Rate |
|---|---:|---:|---:|
| prod (expressions) | 7,039 | 6,993 | 99.3% |
| op (operators) | 3,544 | 3,543 | 100.0% |
| fn (functions) | 9,402 | 8,473 | 90.1% |
| app (use cases) | 962 | 940 | 97.7% |
| map | 219 | 217 | 99.1% |
| array | 179 | 177 | 98.9% |
| math | 149 | 149 | 100.0% |
| xs (types) | 137 | 137 | 100.0% |
| misc | 156 | 149 | 95.5% |

Most of the failures in fn are functions that are not implemented yet:
`parse-json`, `json-to-xml`, `xml-to-json`, `json-doc`, `serialize`,
`parse-ietf-date`, `unparsed-text*`, `parse-xml*`, `random-number-generator`,
`collection`, `id`/`idref`. The parse stage misses only XQuery-only errors and
static typing (XPST0005), which a basic processor does not do.

## Using XPath 3.1

```js
import { compileXPath, evaluateXPath } from "@tradik/xslt3";

evaluateXPath("sum((1, 2, 3)) * 2", null); // [xs:integer 12]

const query = compileXPath("//item[@price > $min]/@id ! string()", {
  variables: ["min"],
});
query.evaluate(document, { variables: { min: 10 } }); // strings
```

Values are returned as data model items (`{ type, value }` for atomic values,
DOM nodes, maps, arrays and functions). JavaScript values passed as
variables are converted: string to `xs:string`, number to `xs:double`,
BigInt to `xs:integer`, boolean, `Date` to `xs:dateTime`, arrays to
sequences, plain objects and `Map`s to maps.
