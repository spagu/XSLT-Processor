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
| qt3tests (XPath 3.1) | parsing: syntax accepted and XPST0003 syntax errors detected | 21,787 | 21,232 | 97.5% |

The remaining 555 cases of the parse stage expect a static error that needs
the static context (unknown function XPST0017, variable XPST0008, prefix
XPST0081), which comes with the evaluator. Evaluation results follow with
milestone 0.1.
