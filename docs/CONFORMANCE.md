# XSLT and XPath Conformance

How closely `@tradik/xslt-processor` follows the W3C XSLT 1.0 and XPath 1.0
Recommendations and the `XSLTProcessor` Web API: compliance tables per
specification section, the supported XSLT elements and XPath functions
(including extension functions), the known deviations and the test coverage.

## Contents

- [W3C Standards Compliance](#w3c-standards-compliance)
  - [Specifications Implemented](#specifications-implemented)
  - [XSLT 1.0 Specification Compliance](#xslt-10-specification-compliance)
  - [XPath 1.0 Specification Compliance](#xpath-10-specification-compliance)
  - [XPath Axes Implementation](#xpath-axes-implementation)
  - [DOM Requirements](#dom-requirements)
  - [Web API Compliance](#web-api-compliance)
- [XSLT Elements Supported](#xslt-elements-supported)
- [XPath Functions Supported](#xpath-functions-supported)
- [Known Deviations](#known-deviations)
- [Test Coverage](#test-coverage)

## W3C Standards Compliance

This implementation follows these W3C specifications; the exceptions are listed under [Known Deviations](#known-deviations).

### Specifications Implemented

| Specification | Version | Status |
|---------------|---------|--------|
| [XPath 1.0](http://www.w3.org/TR/1999/REC-xpath-19991116) | W3C Recommendation, 16 November 1999 | Supported except the `namespace::` axis |
| [XSLT 1.0](http://www.w3.org/TR/1999/REC-xslt-19991116) | W3C Recommendation, 16 November 1999 | Supported except `xsl:fallback` instantiation |
| [DOM Level 3 Core](http://www.w3.org/TR/2004/REC-DOM-Level-3-Core-20040407/) | W3C Recommendation, 7 April 2004 | Consumed, not implemented: the host DOM (browser or `jsdom`) is used |

### XSLT 1.0 Specification Compliance

| Section | Feature | Status | Notes |
|---------|---------|--------|-------|
| 2 | Stylesheet Structure | Supported | `xsl:stylesheet`, `xsl:transform` elements |
| 3 | Data Model | Partial | Root, element, attribute, text, processing instruction and comment nodes; namespace nodes are not exposed |
| 5 | Template Rules | Supported | Pattern matching, priority calculation |
| 5.1 | Processing Model | Supported | Built-in templates for all node types |
| 5.2 | Patterns | Supported | All pattern syntax including predicates |
| 5.3 | Defining Template Rules | Supported | `match`, `name`, `priority`, `mode` attributes |
| 5.4 | Applying Template Rules | Supported | `xsl:apply-templates` with `select`, `mode` |
| 5.5 | Conflict Resolution | Supported | Import precedence and priority ordering |
| 6 | Named Templates | Supported | `xsl:call-template`, `xsl:with-param` |
| 7 | Creating Result Tree | Supported | Literal result elements, attribute value templates |
| 7.1.2 | Creating Elements | Supported | `xsl:element` with dynamic names/namespaces |
| 7.1.3 | Creating Attributes | Supported | `xsl:attribute` with dynamic names/namespaces |
| 7.2 | Creating Text | Supported | `xsl:value-of`, `xsl:text` |
| 7.3 | Creating PIs | Supported | `xsl:processing-instruction` |
| 7.4 | Creating Comments | Supported | `xsl:comment` |
| 7.5 | Copying | Supported | `xsl:copy`, `xsl:copy-of` |
| 7.6 | Attribute Sets | Supported | `xsl:attribute-set`, `use-attribute-sets` |
| 7.6.2 | Namespace Aliases | Supported | `xsl:namespace-alias` |
| 8 | Repetition | Supported | `xsl:for-each` |
| 9 | Conditional Processing | Supported | `xsl:if`, `xsl:choose`, `xsl:when`, `xsl:otherwise` |
| 10 | Sorting | Supported | `xsl:sort` with multiple keys, `data-type`, `order`, `case-order`, `lang` (all attribute value templates). Text sorts by Unicode code point like libxslt/Chrome; `lang` or `case-order` switch to locale collation. Numbers sort with NaN first. |
| 11 | Variables/Parameters | Supported | `xsl:variable`, `xsl:param`, scoping rules |
| 11.1 | Result Tree Fragments | Supported | RTF handling as per spec |
| 7.7 | Numbering | Supported | `xsl:number` with `level`, `count`, `from`, `value`, `format`, grouping; `lang` and `letter-value` are ignored |
| 12 | Additional Functions | Supported | `document()`, `key()`, `format-number()`, `current()`, `generate-id()`, `system-property()`, `element-available()`, `function-available()`; `unparsed-entity-uri()` always returns `''` |
| 12.3 | Number Formatting | Supported | `format-number()` with `xsl:decimal-format` |
| 13 | Messages | Supported | `xsl:message` with `terminate` attribute |
| 14 | Extensions | Partial | Extension functions `exsl:node-set()` and `msxsl:node-set()`; no extension elements |
| 15 | Fallback | Partial | `xsl:fallback` is accepted but never instantiated |
| 16 | Output | Supported | `xsl:output` honored by `transformToString()` / `serializeResult()` |
| 16.1 | XML Output Method | Supported | XML declaration (`encoding`, `version`, `standalone`), `omit-xml-declaration`, `doctype-public`/`doctype-system`, namespace declarations, `indent="yes"` for element-only content |
| 16.1 | CDATA Sections | Supported | `cdata-section-elements`, split around `]]>` |
| 16.2 | HTML Output Method | Supported | Void elements as `<br>`, minimized boolean attributes, unescaped `script`/`style`, no re-indent inside `pre`/`script`/`style`/`textarea` |
| 16.3 | Text Output Method | Supported | Concatenation of all text nodes, no escaping |
| 16.4 | Disabling Output Escaping | Supported | `disable-output-escaping` on `xsl:text` and `xsl:value-of` |

### XPath 1.0 Specification Compliance

| Section | Feature | Status | Notes |
|---------|---------|--------|-------|
| 2.1 | Location Steps | Supported | axis::node-test[predicate] |
| 2.2 | Axes | Partial | 12 of 13 axes; `namespace::` always returns an empty node-set |
| 2.3 | Node Tests | Supported | Name tests, `node()`, `text()`, `comment()`, `processing-instruction()`; unprefixed names also match namespaced nodes |
| 2.4 | Predicates | Supported | Position and boolean predicates |
| 2.5 | Abbreviated Syntax | Supported | `.`, `..`, `@`, `//` |
| 3.1 | Basics | Supported | Expression evaluation |
| 3.2 | Function Calls | Supported | All core functions |
| 3.3 | Node-sets | Supported | Union operator `\|` |
| 3.4 | Booleans | Supported | `and`, `or`, `not()` |
| 3.5 | Numbers | Supported | IEEE 754 double-precision |
| 3.6 | Strings | Supported | Unicode string handling |
| 3.7 | Lexical Structure | Supported | Full tokenization |
| 4.1 | Node Set Functions | Supported | `last()`, `position()`, `count()`, `id()`, `local-name()`, `namespace-uri()`, `name()` |
| 4.2 | String Functions | Supported | `string()`, `concat()`, `starts-with()`, `contains()`, `substring-before()`, `substring-after()`, `substring()`, `string-length()`, `normalize-space()`, `translate()` |
| 4.3 | Boolean Functions | Supported | `boolean()`, `not()`, `true()`, `false()`, `lang()` |
| 4.4 | Number Functions | Supported | `number()`, `sum()`, `floor()`, `ceiling()`, `round()` |

### XPath Axes Implementation

| Axis | Status | Description |
|------|--------|-------------|
| `child` | Supported | Children of context node |
| `descendant` | Supported | Descendants of context node |
| `parent` | Supported | Parent of context node |
| `ancestor` | Supported | Ancestors of context node |
| `following-sibling` | Supported | Following siblings |
| `preceding-sibling` | Supported | Preceding siblings |
| `following` | Supported | Nodes after context in document order |
| `preceding` | Supported | Nodes before context in document order |
| `attribute` | Supported | Attributes of context node |
| `namespace` | Not supported | Always an empty node-set |
| `self` | Supported | Context node itself |
| `descendant-or-self` | Supported | Context node and descendants |
| `ancestor-or-self` | Supported | Context node and ancestors |

### DOM Requirements

The library does not implement the DOM; it reads the source and stylesheet
through the DOM Level 3 Core interfaces of the host (`Node`, `Document`,
`Element`, `Attr`, `Text`, `CDATASection`, `Comment`, `ProcessingInstruction`,
`DocumentFragment`, `NamedNodeMap`, `NodeList`) and creates the result with
`document.implementation.createDocument()`. Browsers and `jsdom` provide all of
them. XML strings returned by loaders are parsed with the global `DOMParser`.

### Web API Compliance

This implementation provides full compatibility with the [MDN XSLTProcessor API](https://developer.mozilla.org/en-US/docs/Web/API/XSLTProcessor):

| Method | Status | Notes |
|--------|--------|-------|
| `importStylesheet(node)` | Supported | Accepts Document or Element |
| `transformToFragment(source, output)` | Supported | Returns DocumentFragment |
| `transformToDocument(source)` | Supported | Returns XMLDocument |
| `transformToString(source)` | Extension | Not part of the W3C API; returns the `xsl:output` serialized result |
| `setParameter(namespaceURI, localName, value)` | Supported | Full namespace support |
| `getParameter(namespaceURI, localName)` | Supported | Returns parameter value |
| `removeParameter(namespaceURI, localName)` | Supported | Removes single parameter |
| `clearParameters()` | Supported | Removes all parameters |
| `reset()` | Supported | Resets processor state |
| `setStylesheetLoader(loader)` | Extension | Resolves `xsl:import`/`xsl:include` |
| `setDocumentLoader(loader)` | Extension | Resolves `document()` |

## XSLT Elements Supported

| Element | Status |
|---------|--------|
| `xsl:apply-templates` | Supported |
| `xsl:attribute` | Supported |
| `xsl:call-template` | Supported |
| `xsl:choose` / `when` / `otherwise` | Supported |
| `xsl:comment` | Supported |
| `xsl:copy` | Supported |
| `xsl:copy-of` | Supported |
| `xsl:element` | Supported |
| `xsl:for-each` | Supported |
| `xsl:if` | Supported |
| `xsl:message` | Supported |
| `xsl:number` | Supported (`lang` and `letter-value` are ignored; decimal tokens in any Unicode digit family) |
| `xsl:output` | Supported |
| `xsl:param` | Supported |
| `xsl:processing-instruction` | Supported |
| `xsl:sort` | Supported |
| `xsl:template` | Supported |
| `xsl:text` | Supported |
| `xsl:value-of` | Supported |
| `xsl:variable` | Supported |
| `xsl:with-param` | Supported |
| `xsl:import` | Supported |
| `xsl:include` | Supported |
| `xsl:apply-imports` | Supported |
| `xsl:attribute-set` | Supported (also via `xsl:use-attribute-sets` on literal result elements) |
| `xsl:key` | Supported (see `key()`) |
| `xsl:decimal-format` | Supported (see `format-number()`) |
| `xsl:namespace-alias` | Supported |
| `xsl:strip-space` / `xsl:preserve-space` | Supported |
| `xsl:fallback` | Supported: used for unknown XSLT instructions and extension elements; an extension element without a fallback or a registered implementation outputs nothing (with a warning) |

## XPath Functions Supported

### Node Set Functions
- `count()`, `id()`, `last()`, `local-name()`, `name()`, `namespace-uri()`, `position()`

### String Functions
- `concat()`, `contains()`, `normalize-space()`, `starts-with()`, `string()`, `string-length()`, `substring()`, `substring-after()`, `substring-before()`, `translate()`

### Boolean Functions
- `boolean()`, `false()`, `lang()`, `not()`, `true()`

### Number Functions
- `ceiling()`, `floor()`, `number()`, `round()`, `sum()`

### XSLT-Defined Functions
- `current()` - the XSLT current node, also inside predicates
- `document(object, base?)` - external documents, see `setDocumentLoader()`
- `element-available(name)`, `function-available(name)` - reflect the real element and function tables
- `format-number(number, pattern, decimalFormat?)` - full XSLT 1.0 picture strings, honouring `xsl:decimal-format`
- `generate-id(nodeSet?)` - stable identifier for the life of the transformation
- `key(name, value)` - `xsl:key` lookup, with lazily built per-document indexes
- `system-property(name)` - `xsl:version`, `xsl:vendor`, `xsl:vendor-url`
- `unparsed-entity-uri(name)` - always returns `''` (unparsed entities are not exposed by the DOM)

### Extension Functions (EXSLT)

The EXSLT functions that libexslt (bundled with libxslt, used by Chrome's native
`XSLTProcessor`) provides are implemented with libexslt's behaviour. Bind any
prefix to the module namespace; `function-available()` reports each function.

| Module | Namespace | Functions |
|---|---|---|
| Common | `http://exslt.org/common` | `node-set`, `object-type` (also `msxsl:node-set` in `urn:schemas-microsoft-com:xslt`) |
| Math | `http://exslt.org/math` | `min`, `max`, `highest`, `lowest`, `abs`, `sqrt`, `power`, `constant`, `log`, `random`, `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `atan2`, `exp` |
| Sets | `http://exslt.org/sets` | `difference`, `intersection`, `distinct`, `has-same-node`, `leading`, `trailing` |
| Strings | `http://exslt.org/strings` | `tokenize`, `split`, `replace`, `padding`, `align`, `concat`, `encode-uri`, `decode-uri` |
| Dates and times | `http://exslt.org/dates-and-times` | `date-time`, `date`, `time`, `year`, `leap-year`, `month-in-year`, `month-name`, `month-abbreviation`, `week-in-year`, `week-in-month`, `day-in-year`, `day-in-month`, `day-of-week-in-month`, `day-in-week`, `day-name`, `day-abbreviation`, `hour-in-day`, `minute-in-hour`, `second-in-minute`, `seconds`, `add`, `add-duration`, `difference`, `duration`, `sum` |
| Dynamic | `http://exslt.org/dynamic` | `evaluate` (opt-in, see below) |

Not supported, as in libexslt: `date:format-date`, `date:parse-date`,
`dyn:map` and the `exsl:document` element; calling them throws
`Unknown function`.

- Current-time functions use the local time zone. For reproducible output set
  `SOURCE_DATE_EPOCH` (seconds, UTC) or `processor.engine.clock = () => new Date(...)`.
- `dyn:evaluate()` evaluates XPath built from strings, which often come from
  the transformed data. It is disabled by default
  (`function-available('dyn:evaluate')` is false); enable it only for trusted
  input with `processor.engine.enableDynamicEvaluate = true` after
  `importStylesheet()`.
- Lengths and positions count Unicode characters, where libexslt counts bytes.

### Conformance Notes
- CDATA sections count as text everywhere (string-value, `text()`, `xsl:value-of`, `xsl:copy-of`); a run of adjacent text and CDATA nodes is a single text node
- Patterns (`match`, `count`, `from`, `xsl:key`) support every XSLT 1.0 form, including multi-step paths, `//`, positional predicates, `id()` and `key()`, and are matched in time proportional to the node's depth
- Template conflicts with equal priority and import precedence resolve to the last template, like libxslt
- Without `xsl:output method`, a result whose root element is `<html>` is serialized as HTML
- XML whitespace means space, tab, CR and LF only; a non-breaking space is ordinary text
- The identity transform `<xsl:template match="@*|node()"><xsl:copy><xsl:apply-templates select="@*|node()"/></xsl:copy></xsl:template>` round-trips a document exactly
- `xsl:number` supports `level="single|multiple|any"` with `count`, `from`, `grouping-separator`/`grouping-size`, the `1`, `01`, `a`, `A`, `i`, `I` format tokens and decimal tokens of any Unicode digit family
- Unprefixed name tests (`item`, `@a`) match only nodes in no namespace (XPath 1.0 section 2.3); in HTML documents element names are matched case-insensitively regardless of namespace, as browsers do
- The `namespace::` axis returns a namespace node for every binding in scope, including `xml`
- `transformToFragment()` into an HTML document parses html output as HTML, like Chrome, so the fragment contains real `HTMLElement`s
- The result tree is built in a neutral XML document and imported into the output
  document at the end, so element names and namespaces survive an HTML owner document

## Known Deviations

Differences from the XSLT 1.0 / XPath 1.0 specifications and from libxslt
(the engine behind Chrome's native `XSLTProcessor`):

- **Recursion depth**: roughly 1,000 to 1,500 nested template invocations fit
  in Node's default stack (libxslt allows about 3,000). Deeper recursion stops
  with `Template recursion too deep`; raise the limit with
  `node --stack-size=...` or rewrite the recursion.
- **`xsl:number`**: `lang` and `letter-value` are ignored. Decimal format
  tokens in any Unicode digit family work; negative values are numbered 0 with
  a warning, as in libxslt.
- **`unparsed-entity-uri()`** always returns `''` because the DOM does not
  expose unparsed entities.
- **`xsl:strip-space` / `xsl:preserve-space`** name tests compare names
  without resolving namespaces.
- **HTML URI attributes** are %-escaped like libxml2 (`href`, `action`, `src`
  and `a/@name`: spaces, control characters and non-ASCII), not the full
  HTML 4 URI attribute list.
- **`legacyNameTests`** (deprecated, to be removed in a future major release):
  `new XSLTProcessor({ legacyNameTests: true })` restores the pre-1.2.0 matching
  where unprefixed name tests also selected namespaced nodes.

## Test Coverage

`npm test` runs 1,428 tests with Node's built-in test runner (100% line and
function coverage, 98% branch coverage for 1.2.0):

| Area | Test files |
|------|-----------|
| XSLTProcessor API and serialization | `src/XSLTProcessor*.test.js`, `src/index.test.js` |
| XPath tokenizer, evaluator, axes, conformance | `src/xpath/*.test.js` |
| XSLT engine, patterns, templates, keys, numbering, sorting, scoping | `src/xslt/*.test.js` |
| `xsl:output` serializers | `src/xslt/serializer.test.js`, `src/xslt/outputRecovery.test.js` |
| Command line tool | `src/cli.test.js` |
| Reported issues | `src/regressions.test.js` |

## Conformance test suite

`npm run test:conformance` runs the test corpus of libxslt 1.1.45 (MIT), the
XSLT engine behind Chrome's native `XSLTProcessor`, against this library. The
corpus is downloaded and checksum-verified on first run; known failures are
listed in [`tests/conformance/baseline.json`](../tests/conformance/baseline.json)
and CI fails only on new failures. Details: [`tests/conformance/README.md`](../tests/conformance/README.md).

| Result | Cases |
|---|---|
| Passing | 266 of 303 counted (87.8%) |
| Skipped | 31 implementation-defined or extension-only cases |
