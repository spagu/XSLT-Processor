# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.9] - 2026-09-10

### Added

- **`XSLTProcessor.setStylesheetLoader(loader)`** - public API for configuring the loader used to resolve `xsl:import` and `xsl:include`. It can be called before `importStylesheet()` (required, since the engine is created during import) or after it (the live engine is updated). Passing anything other than a function or `null` throws a `TypeError`. Returns the processor for chaining.
- **`XSLTProcessor.engine`** - read-only getter exposing the underlying `XsltEngine` for advanced usage. Returns `null` until a stylesheet has been imported.
- **`importStylesheet(style, stylesheetUri)`** - the optional second argument is now forwarded to the engine and used as the base URI when resolving relative `xsl:import`/`xsl:include` hrefs.
- TypeScript declarations for the new API, including an exported `StylesheetLoader` type (synchronous: `(href, baseUri?) => Document | string`).
- **`dist/xslt-processor.d.cts`** - CommonJS-flavoured declarations, wired through nested `types` conditions in `package.json` `exports`, so `require()` consumers under TypeScript `node16`/`nodenext` resolution no longer get the ESM declarations for the CommonJS bundle ("Masquerading as ESM" reported by `@arethetypeswrong/cli`). Verified with TypeScript 7.0.2 in `strict` mode under `nodenext` and `bundler` resolution.
- **Release workflow** - `publish` job using npm Trusted Publishing (OIDC) with provenance; runs on `v*` tags after tests and build, and refuses to publish when the tag does not match `package.json`. Requires a one-time Trusted Publisher configuration on npmjs.com (documented in README).
- **XSLT-defined XPath functions** - `document()`, `key()`, `format-number()`, `current()`, `generate-id()`, `system-property()`, `function-available()`, `element-available()` and `unparsed-entity-uri()`. Calling any of them previously raised `Unknown function: X`, which made `transformToFragment()`/`transformToDocument()` return `null`.
- **`XSLTProcessor.setDocumentLoader(loader)`** (and `XsltEngine.setDocumentLoader(loader)`, plus a `documentLoader` engine option) - synchronous loader for the XSLT `document()` function, returning a `Document`, an XML string or `null`. Same validation and chaining contract as `setStylesheetLoader()`. Missing loader or a `null` result yields an empty node-set instead of failing the transformation; `document('')` returns the stylesheet, node-set arguments are unioned, fragment identifiers are ignored and relative URIs resolve against the stylesheet URI.
- **`XPathEvaluator.registerFunctions(map)`** - extension hook used to register the XSLT function library, keeping `src/xpath` a pure XPath 1.0 implementation. `XPathContext` gained an optional `hostContext` that is carried through predicate evaluation so host functions such as `current()` can reach the XSLT context.
- **`xsl:apply-imports`** - previously reported as `Unknown XSLT element`. Applies only templates of lower import precedence in the same mode, falling back to the built-in rules.
- **`xsl:strip-space` / `xsl:preserve-space`** - parsed since 1.0.0 but never applied. Whitespace-only text nodes are now removed from a copy of the source tree (the caller's document is never modified), honouring "most specific name test wins", `xsl:preserve-space` winning ties, and `xml:space="preserve"` on ancestors.
- New focused modules with full test suites: `src/xslt/functions.js`, `keys.js`, `formatNumber.js`, `number.js`, `numberFormat.js`, `whitespace.js`, `literalResult.js`, `resultTree.js`, `elements.js` and `uri.js`.
- CommonJS consumer smoke test (`tests/cjs-smoke.cjs`) exercising the built bundle through `require()` with jsdom, plus tests for the package entry point.

- **Output serializer (`xsl:output`, XSLT 1.0 section 16)** - new `src/xslt/serializer.js` exporting `serializeResult(node, outputSettings)` plus the focused modules in `src/xslt/serializer/` (`baseWriter`, `xmlSerializer`, `htmlSerializer`, `textSerializer`, `escape`, `indent`, `namespaces`, `settings`, `rawText`, `constants`).
  - `method="xml"` - XML declaration honoring `encoding`, `version` and `standalone`, `omit-xml-declaration`, `doctype-public`/`doctype-system`, minimal text and attribute escaping, `<x/>` for empty elements, namespace declarations emitted where first used and never twice, comments and processing instructions.
  - `method="html"` - no XML declaration, HTML doctype, void elements written as `<br>`, minimized boolean attributes, unescaped `script`/`style` content, `>`-terminated processing instructions, original element and attribute name case, no namespace declarations.
  - `method="xhtml"` - XML rules with void elements written as `<br />`.
  - `method="text"` - concatenation of all descendant text nodes, unescaped.
  - Automatic default method detection: `html` when the result document element is `html` in no namespace, `xml` otherwise.
  - `indent="yes"` - newline plus two-space indentation for element-only content; mixed content, `cdata-section-elements` and the HTML `pre`/`script`/`style`/`textarea` elements are left untouched.
  - `cdata-section-elements` - text children wrapped in `<![CDATA[...]]>`, split around any `]]>` terminator.
  - `disable-output-escaping="yes"` on `xsl:text` and `xsl:value-of` is now honored; text nodes can also be marked explicitly with the exported `markRawText()` helper.
- **`XSLTProcessor.transformToString(source)`** and **`XsltEngine.transformToString(sourceNode)`** - non-W3C convenience methods returning the serialized result. `transformToFragment()` and `transformToDocument()` are unchanged.
- **Public exports** - `serializeResult`, `markRawText`, `isRawText` and `resolveOutputSettings` are exported from the package entry point, and `transformToString`/`OutputSettings` are declared in the generated TypeScript declarations.
- **CLI** - `bin/xslt.js` now serializes through `transformToString()` instead of re-indenting with a regular expression, and gained `--indent`, `--method <m>` and `--no-declaration` flags that override the stylesheet `xsl:output` settings. Helpers were extracted to `bin/lib/options.js` and `bin/lib/transform.js`.
- **Tests** - `src/xslt/serializer.test.js`, `src/XSLTProcessor.serialization.test.js` and `src/cli.test.js` (119 new tests, 560 in total), including the `<xsl:output method="xml" indent="yes"/>` regression from DesignLiquido/xslt-processor#219.

### Fixed

- **`TypeError: Cannot read properties of undefined (reading 'setStylesheetLoader')`** ([#6](https://github.com/spagu/XSLT-Processor/issues/6)) - the README documented `processor.engine.setStylesheetLoader(...)`, but `processor.engine` was undefined and the engine did not exist before `importStylesheet()`. The documented workflow now works through `processor.setStylesheetLoader(...)`.
- **README** - rewrote the "Using xsl:import and xsl:include" section: the previous example used `await` inside a non-async callback and contained two unreachable "options". It now shows a correct synchronous loader, a browser pre-fetch pattern, and a Node.js filesystem example using `path.resolve(path.dirname(baseUri), href)`.
- **`xsl:copy` lost attributes** - the identity transform turned `<i k="a">1</i>` into `<i>a1</i>`. Attribute nodes were never matched by patterns such as `@*|node()` because attributes have no `parentNode`; patterns are now evaluated from the `ownerElement`, so `<xsl:copy>` on an attribute copies the attribute instead of falling back to the built-in text rule. The identity transform now round-trips elements, attributes, text, comments and processing instructions exactly.
- **CDATA sections were invisible** - the string-value of an element containing a CDATA section was empty. CDATA nodes now count as text everywhere: string-value, the `text()` node test, `xsl:value-of`, `xsl:copy-of` and the built-in text template.
- **`xsl:number level="any"`** always produced the same number (`I, I` instead of `I, II`). Counting was rewritten for `single`, `multiple` and `any`, including `count`, `from` and the `1`, `01`, `a`, `A`, `i`, `I` format tokens with prefixes, separators and suffixes.
- **`xsl:namespace-alias` produced wrong output** (`<ax:stylesheet xmlns:ax="xsl"/>`). Aliases are now resolved against the namespace declarations in scope, so literal result elements and their attributes are emitted in the result namespace with the result prefix (or the default namespace for `result-prefix="#default"`), which makes stylesheet-generating stylesheets work.
- **`xsl:use-attribute-sets` on literal result elements** was ignored. It now applies the same attribute sets as on `xsl:element`/`xsl:copy` (literal attributes still win), and `xsl:*` attributes (`xsl:version`, `xsl:exclude-result-prefixes`, `xsl:extension-element-prefixes`, `xsl:use-attribute-sets`) never leak into the result.
- **`transformToFragment(xmlDoc, htmlDocument)` lower-cased names and injected the XHTML namespace** (`<bar xmlns="http://www.w3.org/1999/xhtml">` for `<BAR>`). The result tree is now built in a neutral XML document and imported into the output document at the end, preserving names, namespaces and `disable-output-escaping` markers while keeping the W3C behaviour that the fragment is owned by the output document.
- **XPath function lookup** no longer resolves inherited `Object.prototype` members, so expressions such as `constructor()` report `Unknown function` instead of invoking an object built-in.
- **`setParameter()` broke every transformation** - the processor stored `{ value }` in `globalParameters`, but the engine only understood `{ select }` / `{ node }` definitions and called `processChildren(undefined)`, throwing `Cannot read properties of undefined (reading 'childNodes')` (so `transformTo*` returned `null`). A value set *before* `importStylesheet()` was silently overwritten by the `xsl:param` declaration. External values are now merged into the declaration and always win over the declared default. This also fixes the CLI `-p name=value` flag.
- **Union match patterns had the wrong default priority** - `match="@*|node()"` was treated as one "complex" pattern with priority 0.5, so the identity template beat every `match="name"` template (priority 0). Per XSLT 1.0 section 5.5 a union pattern is now registered as one template rule per alternative, each with its own default priority; `calculatePriority()` moved to `src/xslt/templatePriority.js` and also recognises `@name`, `@*`, `prefix:name`, `@prefix:*`, `child::`/`attribute::` axes and `processing-instruction('literal')`.
- **`transformToDocument()`/`transformToString()` failed in Node.js without a global `document`** (`Document creation not available in this environment`). The result document is now created from the DOM implementation of the source document when no global `document` exists, so jsdom/xmldom users no longer need to install a global.
- **`xsl:output` ignored `version` and `standalone`** - both attributes are now parsed into `outputSettings` (`version` defaults to `1.0`, `standalone` to `null`).

### Changed

- `reset()` keeps the configured stylesheet loader (it is processor configuration, not stylesheet state); pass `null` to `setStylesheetLoader()` to remove it. Documented in JSDoc and the README API table.
- Updated `VERSION` in `src/index.js` to `1.0.9`.
- Fixed the package name in the generated declaration header (`@tradik/xslt-processor`).
- `xsl:include`/`xsl:import` failures are rethrown with `{ cause }` so the original loader/parser error and stack are preserved (ESLint 10 `preserve-caught-error`).
- GitHub Actions bumped to `actions/checkout@v7`, `actions/setup-node@v7`, `actions/upload-artifact@v7`, `docker/setup-buildx-action@v4`; `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` enabled.
- README "Publishing to npm" section rewritten to match the actual workflow (it previously claimed an `NPM_TOKEN`-based auto-publish that did not exist).
- `XsltEngine.namespaceAliases` is now a `NamespaceAliasMap` keyed by namespace URI instead of a plain prefix-to-prefix object (internal API; the previous shape never produced correct output).
- `XsltEngine.countNumber()` was replaced by `countXsltNumber()` in `src/xslt/number.js`; `XsltEngine.formatNumber()` and `XsltEngine.toRoman()` are kept as thin delegating wrappers.
- `XsltEngine.resolveUri()` delegates to `src/xslt/uri.js`, which also recognises URIs with any scheme (not just `http:`/`https:`) as absolute.
- `removeParameter()` and `clearParameters()` now restore the `xsl:param` default of the stylesheet instead of deleting the declaration (which made `$name` an undefined variable). New engine helpers `setParameterValue()`, `clearParameterValue()` and `clearParameterValues()` back this.

- `-f, --format` on the CLI is now an alias of `--indent` and drives the real serializer instead of the previous naive re-indentation.

### Security

- **js-yaml** (transitive via `eslint`) - GHSA-5p4m-2wfm-xmqj, vulnerable `>= 4.0.0, < 4.3.1`. Resolved by upgrading `eslint` to 10.x, which no longer pulls `@eslint/eslintrc`/`js-yaml` at all; `npm audit` reports 0 vulnerabilities.
- **brace-expansion** - GHSA-mh99-v99m-4gvg / GHSA-rgw5-rvv9-x895 (DoS), resolved via `npm audit fix` (now 5.0.9).

### Dependencies

- `eslint` `^9.0.0` -> `^10.10.0` (flat config unchanged; `@eslint/js` is now an explicit devDependency because ESLint 10 stopped bundling it).
- `jsdom` `^25.0.0` -> `^29.1.1`, `esbuild` `^0.28.0` -> `^0.28.2`, `prettier` `^3.4.0` -> `^3.9.6`.

## [1.0.8] - 2026-07-15

### Changed

- **Dependencies**: Bumped `esbuild` to `^0.28.0` (resolves security vulnerability CVE-2024-52317 / GHSA-67mh-4wv8-2f99 on esbuild < 0.25.0).
- Updated `VERSION` in `src/index.js` to `1.0.5`.

## [1.0.4] - 2026-07-15

### Fixed

- **Vite/Angular module resolution** - Changed `browser` targets in `package.json` to point to the ESM build (`dist/xslt-processor.js`) instead of the IIFE build (`dist/xslt-processor.browser.js`). This resolves a `SyntaxError: The requested module ... does not provide an export named 'default'` issue under bundlers like Vite (e.g. in Angular 19+).

### Changed

- Updated `VERSION` in `src/index.js` to `1.0.4`.
- Updated devDependencies (`eslint`, `prettier`, `esbuild`, `jsdom`) and fully synchronized `package-lock.json` with `package.json` specifications.

## [1.0.3] - 2026-01-27

### Changed

- **License**: Corrected license to BSD-3-Clause (was incorrectly marked as MIT in documentation)
- **Node.js compatibility**: Primary Node.js 25, with backward compatibility to Node.js 18+
  - Library runtime works with Node.js 14+
  - Tests require Node.js 18+ (native test runner)
  - CI now tests on Node.js 25, 22, 20, 18
- Dockerfile uses Node.js 25 as primary
- Updated GitHub Actions workflows for multi-version testing

### Fixed

- Fixed license badge in README (BSD-3-Clause, not MIT)
- Fixed license reference link in README

## [1.0.2] - 2026-01-27

### Fixed

- **XPath context bug** - Fixed initial context node in XSLT transformation
  - Previously used `documentElement` as initial context, breaking paths like `RootElement/child`
  - Now correctly uses document node as initial context for `/` template matching
  - XPath expressions like `Schema_Resume_v1.1.0/basics/name` now work correctly
  - This fix ensures XSLT templates that match `/` and use relative paths work as expected

## [1.0.1] - 2026-01-27

### Added

- CDN usage documentation in README (jsDelivr, unpkg)
- Complete browser integration examples with CDN

### Changed

- Disabled automatic npm publishing in GitHub Actions (requires manual publish with OTP)

## [1.0.0] - 2026-01-27

### Changed

- **BREAKING**: Package renamed from `xslt-processor` to `@tradik/xslt-processor`
- Repository moved to https://github.com/spagu/XSLT-Processor
- Version reset to 1.0.0 for the new scoped package

### Added

- GitHub Actions release workflow for npm publishing
  - Automated tests, linting, and format checks
  - Security audit with npm audit (high severity threshold)
  - Provenance-enabled npm publishing for supply chain security
  - Build artifact uploads
  - Triggers on GitHub releases and version tags (v*)
- Full support for `xsl:import` and `xsl:include` elements
  - Stylesheet loader API for loading external stylesheets
  - Proper import precedence handling (imported templates have lower precedence)
  - Include merges templates at same precedence level
  - Circular reference detection
  - Relative URI resolution
  - Support for both Document and XML string returns from loader
  - Nested imports/includes support
- 100% test line coverage for all source files
- 473 comprehensive tests

### Features (from previous development)

- Complete XPath 1.0 implementation
- Complete XSLT 1.0 implementation
- XSLTProcessor class with native-compatible API
- CLI tool (`xslt` command) for transforming XML
- Multiple bundle formats (ESM, CommonJS, Browser IIFE)
- TypeScript declarations
- Security hardening with configurable limits
- Docker support with Node 25+

---

## Previous Development History (as `xslt-processor`)

## [1.0.6] - 2026-01-27

### Added

- GitHub Actions CI/CD workflow for automated testing
  - Node.js test matrix
  - Lint and format checks
  - Docker-based testing
  - Test coverage reporting
- XSLT Engine comprehensive test suite (82 new tests):
  - XsltContext constructor, clone, getVariable, setVariable tests
  - XsltEngine constructor, importStylesheet tests
  - Template priority calculation tests
  - Transform and transformToDocument tests
  - xsl:apply-templates with mode, sorting, with-param tests
  - xsl:call-template with content parameters tests
  - xsl:value-of with disable-output-escaping tests
  - xsl:text and whitespace preservation tests
  - xsl:element with dynamic names and namespaces tests
  - xsl:attribute with dynamic names and namespaces tests
  - xsl:copy for elements, text nodes, with use-attribute-sets tests
  - xsl:copy-of deep copy and primitive values tests
  - xsl:comment and xsl:processing-instruction tests
  - xsl:number formatting (padding, letters, roman numerals) tests
  - xsl:message with terminate option tests
  - xsl:variable with select and content tests
  - sortNodes by number and case-order tests
  - splitUnionPattern with predicates and strings tests
  - processAttributeValueTemplate tests
  - Built-in templates tests
  - toRoman number conversion tests
  - deepCloneNode tests
  - shouldPreserveSpace xml:space handling tests
  - collectNamespaces tests
  - applyAttributeSets nested sets tests
  - Global variables, parameters, keys, decimal-format tests
  - namespace-alias, attribute-set, strip-space, preserve-space tests
- XSLTProcessor comprehensive test suite (39 new tests):
  - importStylesheet parse error handling
  - setParameter/getParameter/removeParameter validation
  - transformToFragment/transformToDocument error handling
  - clearParameters with engine synchronization
  - installGlobal edge cases
- W3C Specification Compliance tests:
  - XSLT 1.0 Specification (Sections 5, 7, 9, 10, 11, 12.4, 16)
  - XPath 1.0 Specification (Sections 2, 3, 4)
  - DOM Level 3 Core Compliance tests
- Additional edge case tests:
  - xsl:fallback element handling
  - xsl:with-param standalone handling
  - xsl:copy direct method calls for attribute and document nodes
  - xslApplyTemplates with non-array result
  - xslForEach with non-array result
  - createDocument without global document
  - namespace aliases in literal result elements
  - literal result element with namespace

### Changed

- Test suite expanded to 441 tests (from 293)
- XSLT engine coverage increased from 59.92% to 100%
- XSLTProcessor coverage increased from 83.18% to 93.58%
- Overall test coverage increased to 99.41% line, 92.77% branch
- Updated README with CI badge, enhanced browser compatibility table, and comprehensive W3C standards compliance documentation

## [1.0.5] - 2026-01-27

### Added Tests

- Comprehensive security test suite (34 new tests):
  - Prototype pollution prevention (`__defineGetter__`, `__defineSetter__`, `__lookupGetter__`, `__lookupSetter__`)
  - Object.prototype inheritance prevention (`hasOwnProperty`, `valueOf`, `toString`)
  - Prefixed forbidden variable names
  - Recursion depth reset after errors
  - Circular reference handling
- Strict mode validation tests:
  - AST validation (null type, undefined type, array input, primitive values, symbol types)
  - Context node validation
- Input sanitization tests:
  - Unicode characters and element names
  - Emoji in text content
  - Very long element names
  - Deeply nested XML structures
  - Many attributes handling
  - Whitespace-only text nodes
  - Special XML characters
- DoS prevention tests:
  - String concatenation limits
  - Union expression deduplication
  - Pathological predicate expressions
  - Ancestor axis traversal bounds
  - Large node set counting
  - Result size validation in location paths
- XPathLimits constants export and configuration tests

### Changed

- Test suite expanded to 293 tests
- Updated README with comprehensive security documentation
- XPath evaluator branch coverage improved to 91.28%

## [1.0.4] - 2026-01-27

### Added

- CLI tool (`xslt` command) for transforming XML from command line
  - Support for parameters via `-p name=value`
  - Output formatting with `-f` flag
  - File output with `-o` flag
- Complete usage examples in README

### Fixed

- Method name collision in XSLT engine (processTemplate vs registerTemplate)
- Null handling in `sortNodes` for `localeCompare`

### Changed

- Test suite now includes XSLTProcessor tests (259 total tests)
- Updated README with CLI documentation and security features

## [1.0.3] - 2026-01-27

### Fixed

- Tokenizer operator disambiguation per XPath 1.0 specification
  - `div`, `mod`, `and`, `or` are now correctly treated as element names when following operators like `//`, `@`, `(`, `[`, `,`
  - Example: `//div` now correctly selects `<div>` elements instead of throwing a parser error
- Removed dead code in tokenizer (unreachable `.5` number parsing branch)
- Removed dead code in parser (unreachable prefixed function call branch)

### Added Tests

- Token.toString() coverage
- Tokenizer error cases (unexpected character, unterminated string)
- Operator disambiguation tests (div/mod/and/or as element names vs operators)
- Document position sorting edge cases
- Parser error cases (trailing tokens, missing names, invalid syntax)
- Function edge cases (substring with negative start, infinity handling)
- Parser advanced features (descendant paths, prefixed variables)

### Changed

- Test coverage improved to 230 tests with 99.95% line coverage, 92.88% branch coverage
- evaluator.js: 100% line coverage
- tokenizer.js: 100% line coverage
- parser.js: 99.81% line coverage
- index.js: 100% line coverage

## [1.0.2] - 2026-01-27

### Added

- Security hardening with configurable limits:
  - `MAX_RECURSION_DEPTH` (default: 100) prevents stack overflow from deeply nested expressions
  - `MAX_RESULT_SIZE` (default: 10000) prevents memory exhaustion from large result sets
  - `MAX_STRING_LENGTH` (default: 1000000) limits string processing
- Prototype pollution protection for variable names (`__proto__`, `constructor`, `prototype`)
- Strict AST validation before evaluation
- Comprehensive test coverage (157 tests, 95% line coverage, 87% branch coverage)

### Added Tests

- Unary expressions (negation)
- Additional axes (ancestor-or-self, following, preceding, namespace)
- Relational operators (`<=`, `>=`)
- Node-set comparisons
- Boolean comparisons
- Additional functions (`id()`, `namespace-uri()`, `lang()`)
- Node type tests (text, comment, processing-instruction)
- Type conversion edge cases
- Security tests for prototype pollution and AST validation
- Security limits tests (recursion depth, string length, result size)
- Namespace prefix wildcard and prefixed name matching
- Filter expressions with predicates and path continuation
- Named processing-instruction test
- string() and substring() without args

## [1.0.1] - 2026-01-27

### Fixed

- XPath absolute paths now correctly start from document node instead of documentElement
- Null handling in `getFollowingSiblings` and `getPrecedingSiblings` methods
- Test expectation for wildcard selector (corrected count from 4 to 5)

## [1.0.0] - 2026-01-27

### Added

- Initial release of xslt-processor
- Complete XPath 1.0 implementation
  - Tokenizer for XPath expressions
  - Parser generating Abstract Syntax Trees
  - Evaluator for XPath expressions against DOM nodes
  - All core XPath functions (node-set, string, boolean, number)
  - All XPath axes (child, parent, ancestor, descendant, sibling, etc.)
  - Predicate filtering
  - Variable references
- Complete XSLT 1.0 implementation
  - Template matching with priority calculation
  - Named templates with call-template
  - All XSLT instructions (apply-templates, for-each, if, choose, etc.)
  - Parameters and variables
  - Sorting with xsl:sort
  - Attribute value templates
  - Copy and copy-of
  - Comments and processing instructions
  - Number formatting
  - Output method configuration
- XSLTProcessor class with native-compatible API
  - importStylesheet()
  - transformToFragment()
  - transformToDocument()
  - setParameter() / getParameter() / removeParameter() / clearParameters()
  - reset()
- Multiple bundle formats
  - ESM module (dist/xslt-processor.js)
  - CommonJS module (dist/xslt-processor.cjs)
  - Browser IIFE bundle (dist/xslt-processor.browser.js)
  - Minified browser bundle (dist/xslt-processor.browser.min.js)
- TypeScript declarations (dist/xslt-processor.d.ts)
- Auto-install as global XSLTProcessor in browser environments
- Utility functions
  - isNativeXSLTSupported()
  - installGlobal()
- Comprehensive test suite
  - XPath tokenizer tests
  - XPath evaluator tests
  - XSLTProcessor tests
  - XSLT feature tests
- Docker support with Node 25+
  - Development container with hot reload
  - Test container
  - Build container
  - Production container
- Documentation
  - Complete README with usage examples
  - API reference
  - XSLT elements support matrix
  - XPath functions support list
  - Style guide with WCAG 2.2 compliant colors

### Technical Details

- Based on W3C specifications:
  - XPath 1.0: http://www.w3.org/TR/1999/REC-xpath-19991116
  - XSLT 1.0: http://www.w3.org/TR/1999/REC-xslt-19991116
  - DOM Level 3: http://www.w3.org/TR/2004/REC-DOM-Level-3-Core-20040407/
- Inspired by libxslt architecture (https://gitlab.gnome.org/GNOME/libxslt)
- Zero runtime dependencies
- Native test runner (Node.js 25+)
- esbuild for bundling

[1.0.3]: https://github.com/spagu/XSLT-Processor/releases/tag/v1.0.3
[1.0.2]: https://github.com/spagu/XSLT-Processor/releases/tag/v1.0.2
[1.0.1]: https://github.com/spagu/XSLT-Processor/releases/tag/v1.0.1
[1.0.0]: https://github.com/spagu/XSLT-Processor/releases/tag/v1.0.0
