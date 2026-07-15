# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
