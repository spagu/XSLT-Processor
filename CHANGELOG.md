# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - Unreleased

### Changed

- **libxslt parity** (task 0021): the libxslt 1.1.45 conformance corpus passes completely (299 of 299 counted cases; 32 cases are skipped as DTD-dependent, implementation-defined or extension-only).
- `importStylesheet()` rejects duplicate named templates or global variables at the same import precedence, text between top-level elements, invalid or undeclared names of templates and attribute sets, and an attribute set that uses itself. An undeclared prefix in an XPath name test is an error instead of matching names in no namespace.
- `xsl:namespace-alias` keeps the literal prefix and supports `#default` without a default namespace; named templates, attribute sets and decimal formats are compared by expanded name, and attribute sets with the same name are merged across import precedence; `xsl:strip-space`/`xsl:preserve-space` resolve namespaces.
- HTML output writes namespace declarations and derives the doctype from `version` (`version="5"` gives `<!DOCTYPE html>`); XHTML 1.0 doctypes get libxml2's Content-Type meta and `xmlns`; generated prefixes are `ns_1`, `ns_2`, ... like libxslt.
- **Browser parity**: `transformToFragment` into an HTML document creates XHTML elements for xml output; `transformToDocument` returns an HTML document for html output and Blink's text page (XHTML doctype, `head`/`title`, `pre`) for text output. `engine.outputSettings.indent` defaults to `undefined`; `engine.stripSpace`/`preserveSpace` hold expanded names.
- **Unprefixed name tests are namespace-strict** (task 0003): `item`, `@a` and names in patterns match only nodes in no namespace (XPath 1.0 section 2.3), like Chrome/libxslt. Elements of HTML documents are still matched by unprefixed, case-insensitive names. Migration: bind a prefix to the namespace, or use `local-name()`; the deprecated `new XSLTProcessor({ legacyNameTests: true })` (also on `XsltEngine`/`XPathEvaluator`) restores the old matching for now.
- **`transformToFragment(source, htmlDocument)`** with html output (declared or detected) returns real HTML elements parsed by the owner document, like Chrome: `<a>` is an `HTMLAnchorElement` and scripts run when inserted. The markup is parsed as body content, so `html`/`head`/`body` tags are dropped. XML output keeps the XML DOM nodes.
- **Extension elements** (`extension-element-prefixes`) are no longer copied to the result: their `xsl:fallback` children run; without a fallback nothing is output and a warning is shown. New `XsltEngine#registerExtensionElement(uri, localName, handler)`; `element-available()` reports registered elements.
- **HTML URI attributes** are %-escaped like libxml2: only `href`, `action`, `src` and `a/@name` on elements in no namespace; spaces, control characters, DEL and non-ASCII characters are escaped (`a b` becomes `a%20b`).
- `id()`/`key()` in patterns accept only string literals (XSLT 1.0 section 5.2); other arguments are an import error.
- `xsl:number` numbers negative values as 0 with a warning; alphabetic and Roman formats fall back to decimals below 1, and Roman above 5000 (libxslt).

### Fixed

- **Deep template recursion** (task 0005): recursive `xsl:call-template` and `xsl:apply-templates` stopped at about 1,000 to 1,400 levels with `Template recursion too deep`. Templates now run from an explicit work stack, so the JavaScript stack no longer grows with template depth: libxslt's limit of 3,000 nested templates fits in Node.js and every browser, and more with a higher limit.
- **`transformToDocument()` returned `null`** when the result had whitespace text around its root element (common with built-in templates), found by the browser tests; document-level whitespace is dropped and a DocumentType node is created from `doctype-public`/`doctype-system`.
- A carriage return in XML text is written as `&#13;`; adjacent text nodes in `cdata-section-elements` form one CDATA section; `xsl:copy-of` declares the namespaces in scope; `xml:id` via `xsl:attribute`; `element-available()` with the default namespace; `format-number()` patterns `.`, `#.` and `.#`; `html:div` and other operator names as QName local parts; `xsl:number` on namespace nodes.
- **`xsl:number` hung on huge values** (`format="I"` or `"a"` with `9007199254740992`), a denial of service found by the conformance suite; conversion now takes logarithmic time. Values from 1e21 print as full digits, NaN and Infinity as `NaN`/`Infinity`.
- `xsl:number` format tokens of any Unicode digit family (`٠١`, `１`, ...) use that family's digits; `count="@*" level="any"` counts the attribute itself.
- A global `xsl:param` with higher import precedence wins over an imported `xsl:variable` of the same name (XSLT 1.0 section 11.4).
- `self::*` and other non-attribute axes no longer match attribute or namespace nodes.
- Node-sets holding an element and its own attributes are sorted in document order under jsdom.
- The release workflow ran twice per release (on the tag push and on the published release), including `npm publish`; it now runs once, on the published release.
- The CLI entry point handles an unexpected rejection from `main()` instead of leaving the promise unhandled (SonarCloud S9383).

### Security

- Build, conformance and browser-test scripts confine paths from command line arguments and HTTP requests to the repository (or the temporary directory) after canonicalizing them, and run `tar`/`codesign` from fixed system directories instead of looking them up in `PATH` (SonarCloud S8707, S2083, S4036).
- CI, release and Docker builds install dependencies with `npm ci --ignore-scripts`, so lifecycle scripts of dependencies never run during builds (SonarCloud S6505).
- The GitHub Pages workflow grants `pages: write` and `id-token: write` only to the deploy job instead of the whole workflow (SonarCloud S8233).

### Added

- `maxTemplateDepth` option for `XSLTProcessor` and `XsltEngine`, default 3000 (`XSLT_MAX_TEMPLATE_DEPTH`, libxslt's `xsltMaxDepth`); deeper nesting throws `Template recursion too deep`, as libxslt reports a potential infinite recursion.
- **Asynchronous and streaming API** (task 0010): `XSLTProcessor#transformToStream(source, { signal, chunkSize })` returns a `ReadableStream<string>` serialized on demand; `transformAsync(source, { signal, stylesheet, stylesheetUri, fetchStylesheet, fetchDocument })` returns a `Promise<string>`; `importStylesheetAsync(style, uri, { loader, documentLoader, signal })` loads the `xsl:import`/`xsl:include` tree and literal `document()` URIs with `fetch` or a custom loader. Sources may be nodes, strings, bytes, `ReadableStream`s or async iterables. New exports `serializeChunks()`, `DEFAULT_CHUNK_SIZE`, `transformToChunks()` and `transformToStream()`, with TypeScript types. The CLI writes its output in chunks with backpressure (byte-identical, about 27% less peak memory on a 100 MB result).
- **Project website** (task 0015) with the documentation, the changelog and an XSLT playground, built with spagu/ssg and deployed to GitHub Pages (`make site`, `.github/workflows/site.yml`); it replaces the Jekyll workflow. Pull requests build and check the site without deploying it.
- **Standalone `xslt` executables** (task 0008) for linux-x64/arm64, darwin-x64/arm64 and windows-x64, attached to each GitHub release with `checksums.sha256`. They are built as Node.js Single Executable Applications with jsdom bundled (`scripts/binaries/`) and smoke-tested on each operating system in CI; `scripts/install.sh` installs them with checksum verification.
- **Browser tests** (task 0009): `npm run test:browser` runs the built bundles in Chromium, Firefox and WebKit with Playwright, in CI on pull requests; an informational differential test compares the output with the browser's native `XSLTProcessor`.
- **`namespace::` axis** (task 0004): namespace nodes for every binding in scope (including `xml`), with `name()`, string value, parent, `generate-id()`, union deduplication, and `xsl:copy`/`xsl:copy-of` adding the declaration.
- `XSLTProcessor`/`XsltEngine` options `enableDynamicEvaluate` and `clock` for EXSLT `dyn:evaluate()` and reproducible current-time functions.
- **EXSLT** (task 0002): the common, math, sets, strings, dates-and-times and dynamic functions libexslt provides, with libexslt's behaviour (new `src/xslt/exslt/`). `dyn:evaluate` is opt-in through `engine.enableDynamicEvaluate` because it evaluates XPath built from data.
- **Conformance suite**: `npm run test:conformance` runs libxslt 1.1.45's test corpus (MIT, downloaded and checksum-verified) against the library, reports pass rates per spec section and fails CI only on regressions against `tests/conformance/baseline.json`. Initial result: 249 of 300 counted cases pass (83%).

### Internal

- The input decoding core moved from `bin/lib/decode.js` to `src/io/decode.js`, shared by the CLI and the asynchronous API; the serializer writes into chunks, and the string result joins them (one implementation).
- **Engine split** (task 0022): `src/xslt/engine.js` (2,537 lines) is now a thin `XsltEngine` facade of 243 lines; its methods live in 17 modules under `src/xslt/engine/` by concern (stylesheet loading, top-level declarations, template rules and invocation, instruction dispatch, control flow, variables and parameters, text and number instructions, node construction and copying, transformation entry points, function support) and are installed on the prototype. No API or behaviour change and no measurable slowdown; `splitUnionPattern` and `findMatchingTemplate` were simplified to stay under SonarCloud's cognitive complexity limit.

### Documentation

- README.md shortened from about 1,080 to 220 lines; the details moved to `docs/` (API, loaders, examples, CLI, conformance and known deviations, security limits, development, browser support, style guide) with an index in `docs/README.md`.
- `npm run docs:check` (scripts/check-links.mjs) verifies every relative link and heading anchor in the Markdown files; CI runs it.

## [1.1.3] - 2026-09-29

### Fixed

- **Empty `xsl:param` / `xsl:variable` was true in boolean tests** ([#11](https://github.com/spagu/XSLT-Processor/issues/11)) - a variable-binding element with neither `select` nor content became an empty result tree fragment, which converts to `true`. XSLT 1.0 section 11.2 gives it the empty string, so `<xsl:param name="p"/>` followed by `<xsl:if test="$p">` is now false. This applies to global and template params, variables and `xsl:with-param`; a variable whose content produces no nodes is still a (true) result tree fragment, and `setParameter()` still overrides the default.
- **Empty XHTML elements were written as `<script/>` or `<div/>`**, which breaks when XHTML is parsed as HTML. Empty elements in the XHTML namespace now follow the XHTML compatibility guidelines like libxml2 (Chrome) and Firefox: void elements as `<br />`, all others with an explicit end tag (`<script src="a.js"></script>`). Elements in other namespaces keep `<x/>`.

- **Output `encoding` was ignored**: characters the declared encoding cannot represent are now written as character references (`&#8364;`, or HTML entity names such as `&euro;` with `method="html"`; CDATA sections are split around them). The CLI writes the file and stdout as bytes in the declared encoding (UTF-16 with a BOM; unknown multi-byte encodings fall back to UTF-8 with a warning). Previously an `ISO-8859-1` declaration was followed by UTF-8 bytes.
- **`name()`, `local-name()`, `namespace-uri()`** returned `#document`, `#text` and `#comment` for unnamed nodes; they return `""` (XPath 4.1), and a processing instruction's name is its target.
- **`id()` with a node-set argument** used only the first node and could return duplicates; every node's value is split and the result is a set in document order.
- **`/` and `key()` inside `exsl:node-set()` trees** resolved against the source document instead of the fragment containing the context node.
- **`lang()`** now works from text and attribute nodes and honours only `xml:lang`, not a plain `lang` attribute.
- **`cdata-section-elements`** compares expanded names (a prefix bound to the same namespace matches; a bare name no longer matches the same local name in any namespace).
- **HTML output method** now follows libxslt/Chrome: a `Content-Type` meta is added to `head`, `&{` and `<` stay unescaped in attribute values, and non-ASCII characters in URI attributes (`href`, `src`, ...) are %-escaped as UTF-8.
- **Node-set functions** (`count()`, `sum()`, `name()`, `local-name()`, `namespace-uri()`) given a number, string or boolean now raise a type error instead of returning a made-up value.
- **CLI**: `--method` accepts only `xml`, `html`, `xhtml` or `text`; the root directory `/` (or a drive root) works as base directory.

- **Computed names are validated** (XML 1.0 5th ed. QNames): `xsl:element`/`xsl:attribute` names such as `1a`, `x{` or `a:b:c`, undeclared prefixes and `xmlns` attribute names are reported with `console.warn` and skipped, as libxslt does, instead of producing malformed output. `xsl:element name="p:e" namespace=""` creates `<e/>` in no namespace.
- **`xsl:fallback`** is instantiated for unknown XSLT instructions (XSLT 15), and forwards-compatible mode (`version` other than 1.0) ignores unknown top-level elements.
- **`xsl:number` default count** compares expanded names and processing-instruction targets.
- **`xsl:output cdata-section-elements`** names are expanded with the namespaces in scope on `xsl:output`, including the default namespace for unprefixed names (XSLT 16.1); several `xsl:output` lists are united and undeclared prefixes are reported.
- **`isNativeXSLTSupported()`** no longer reports this polyfill as native after `installGlobal()`.
- **Loaders with non-jsdom DOMs** (e.g. xmldom): XML strings returned by loaders are parsed with the new `domParser` engine option, the global `DOMParser` or the stylesheet's window, and parse errors are detected without `querySelector`.
- **Warnings** for duplicate variable bindings (XSLT 11.4/11.5) and undeclared `exclude-result-prefixes` / `extension-element-prefixes`; behaviour is unchanged (the later binding wins).
- The broken `npm run test:browser` script (it pointed to a file that does not exist) was removed; `npm test` now expands `src/**/*.test.js` itself, so test files in nested directories are no longer skipped.

### Performance

- `axis::x[n]` steps (the common `following-sibling::x[1]` / `preceding-sibling::x[1]` idiom) stop walking the axis after the n-th match: 8,000 siblings in a loop dropped from 4.7 s to 0.09 s.

- `xsl:number` is linear per transformation: 8,000 nodes with `level="any" count="i[@k='1']"` dropped from 105 s to 0.09 s, `level="single"` from 5.5 s to 0.1 s.
- `key()`/`id()` patterns cache their anchor nodes per document.

### Changed

- `count(5)`, `sum('x')` and similar calls now throw a type error; `name(/)` returns `""`; `lang()` ignores a plain `lang` attribute; HTML output gains a `Content-Type` meta; the CLI's `runTransformation()` helper returns `{ output, encoding }`.

- **Invalid patterns** in `xsl:template match`, `xsl:key match` and `xsl:number count`/`from` now make `importStylesheet()` throw an error naming the pattern (XSLT 5.2), as Chrome's native processor rejects such stylesheets; previously the template silently never matched. A failed import leaves the processor's previous stylesheet in place.
- `engine.outputSettings.cdataSectionElements` holds `{ namespaceUri, localName }` objects instead of strings.

### Added

- `XsltEngine` option `domParser`; `XsltEngine.setStylesheetLoader()`/`setDocumentLoader()` return the engine for chaining; `XPathLimits` export.
- Complete TypeScript declarations in `scripts/xslt-processor.d.ts` (`DocumentLoader`, `XSLTProcessor.setDocumentLoader`, `XPathEvaluator` options, `XPathContext` `hostContext`, ...); a test fails when a runtime export is missing from the declarations.

### Documentation

- README: corrected the Custom Security Limits example (`parseXPath` instead of the non-exported `parse`) and the Node.js loader example (jsdom with a global `DOMParser`; the xmldom version failed).
- README: new table of contents and "Module exports", "TypeScript" and "Known Deviations" sections.
- README: conformance tables corrected (`namespace::` axis not supported, `xsl:fallback` and extensions partial, `xsl:number` ignores `lang`/`letter-value`, the DOM is consumed rather than implemented); invented per-spec test counts replaced by real figures.
- README: browser minimums corrected for the ES2022 bundle (Chrome/Edge 93, Opera 79, Samsung Internet 17); the `XsltProcessorLib` CDN global and auto-install behaviour documented; development setup, Docker commands and publishing notes fixed; style-guide success and warning colours now meet WCAG 2.2 AA contrast.
- SECURITY.md and CONTRIBUTORS.md rewritten for this project (they described a different project); security reports go through GitHub private vulnerability reporting.

## [1.1.2] - 2026-09-24

### Fixed

- **`(a) or (b)` failed with `Unexpected token FUNCTION`** ([#9](https://github.com/spagu/XSLT-Processor/issues/9)) - the tokenizer classified `or`, `and`, `div` and `mod` followed by `(` as function calls before applying the XPath 1.0 operator disambiguation rule (section 3.7). The rules now run in the order the specification lists them.
- **`xsl:sort` ordering** - text keys were upper-cased and compared with `localeCompare`, so `§112` sorted before `100-00` and `case-order` folded the whole string. Text now compares by Unicode code point like libxslt (the engine of Chrome's native `XSLTProcessor`); `lang` or `case-order` switch to an `Intl.Collator`, where `case-order` only breaks ties.
- **`xsl:sort data-type="number"`** - non-numeric keys were treated as 0 and `parseFloat` accepted `12abc`. Keys now use XPath `number()` and NaN sorts before every number, as section 10 requires.
- **`xsl:sort` attribute value templates** - `order`, `data-type`, `case-order` and `lang` were read literally, so `order="{$sortOrder}"` never took effect.
- **`match="/"` also matched the document element**, so the classic catalog stylesheet (`/` template wrapping `apply-templates`, plus `match="catalog"`) rendered its wrapper twice. `/` now matches only the root node (XSLT 5.2).
- **Multi-step patterns never matched**: `c/d`, `*/d`, `r//d`, `/r/c`, `c/d[2]`, `e/@a`, `id('x')/d`, `key('k','v')//d`. Patterns are now compiled once and matched right to left (new `src/xslt/patterns.js`, `src/xslt/patternCompiler.js`).
- **Template conflicts**: with equal priority and import precedence the last template now wins, like libxslt (XSLT 5.5 recovery).
- **Diamond imports** (two imported stylesheets importing the same third one) were rejected as circular; only real cycles are errors now. `xsl:call-template` now honours import precedence.
- **Default output method**: a result whose root element is `<html>` is serialized as HTML when the stylesheet has no `xsl:output method` (XSLT 16).
- **Simplified stylesheets** (`<html xsl:version="1.0">`) dropped their literal root element.
- **Keys**: several `xsl:key` elements with the same name now all feed the index, `key()` with several values returns document order without duplicates, and the index is rebuilt for every transformation instead of going stale after DOM changes.
- **`!=` on node-sets** is existential (`@n != 1` is true when some `@n` differs), and a node-set compared with a boolean uses `boolean()` (XPath 3.4).
- **XML whitespace** is only space, tab, CR and LF: `normalize-space()` and `number()` no longer treat a non-breaking space as whitespace.
- **`number()`** follows the XPath Number grammar: `1e3`, `0x10`, `+5` and `Infinity` are NaN; `5.` and `.5` are numbers.
- **`string()` of numbers** never uses exponent notation (`1e21` gives `1000000000000000000000`).
- **Prefixed function calls** such as `exsl:node-set($rtf)` failed to parse. EXSLT `exsl:node-set()` and `msxsl:node-set()` are now available.
- **`xml:` prefix** is predeclared, so `@xml:lang` works without a declaration.
- **`@*`** no longer includes `xmlns` namespace declarations.
- **Adjacent text and CDATA** form one text node in the XPath data model (`<r>a<![CDATA[b]]>c</r>`: one `text()` with value `abc`).
- **`string-length()`, `substring()`, `translate()`** count characters, not UTF-16 code units.
- **Template parameters**: a template's `xsl:param` default was overridden by any same-named parameter in scope (the caller's own params, global params, or undeclared `xsl:with-param`s). A param now takes a same-named `with-param` from its direct caller, otherwise its own default (XSLT 11.6).
- **Variable scoping** was dynamic: a called template saw its caller's local variables, and variables declared inside `xsl:if`, `xsl:choose` or `xsl:for-each` leaked out. Scoping is now lexical (XSLT 11.5).
- **Global variables and params** may reference ones declared later (XSLT 11.4); circular definitions report a clear error.
- **`xsl:copy-of select="/"`** copied nothing, and copying attribute nodes produced an empty text node instead of the attribute. Copied elements and attributes keep their namespaces.
- **Result namespaces**: namespace prefixes declared on `xsl:template` or literal result elements were ignored in XPath expressions; `xsl:element` ignored the default namespace in scope (`<p xmlns=""/>` inside XHTML); `xsl:attribute name="xl:href"` and `namespace=` lost the namespace; literal result elements did not carry their in-scope namespace declarations.
- **`&#160;` in stylesheets** was stripped as whitespace (`<td>&#160;</td>` became `<td/>`).
- **Attribute value templates** containing `{` or `}` inside a string literal (`{concat('{', 'x')}`) were split incorrectly.
- **`xsl:number`**: `grouping-separator` and `grouping-size` were ignored, and `format` was not an attribute value template.
- **`transformToDocument()` with `method="text"`** returned `null`; it now returns `<html><head/><body><pre>…</pre></body></html>` like Chrome.
- **`xsl:attribute` after child nodes** is ignored with a warning, as libxslt does, instead of being added.
- **Serialization**: comments containing `--` and processing instructions containing `?>` are made well-formed instead of producing broken XML or throwing.
- **Deep recursion**: a recursive named template overflowed the stack after about 700 levels; it now reaches about 1,200 levels (frames per level cut from 11 to 5) and reports `Template recursion too deep` instead of leaking a `RangeError`.
- **Long XPath expressions** such as a 120-term sum failed with `Maximum recursion depth exceeded (100)` inside stylesheets; transformations now allow 1000 levels (`XSLT_MAX_EXPRESSION_DEPTH`).
- **Reverse axes in predicates** - `preceding-sibling::*[1]` and `preceding::*[1]` selected the farthest node instead of the nearest one. Reverse axes now use proximity positions (XPath 1.0 section 2.4), while node-sets are still returned in document order.
- **Axes from attribute nodes** - `parent::`, `ancestor::`, `following::` and `preceding::` returned nothing for an attribute context node.
- **Transformations of documents with more than 10,000 matching nodes returned `null`** (`Result set exceeds maximum size`). The standalone XPath API keeps its 10,000 guard for untrusted expressions; `XsltEngine` now allows 5,000,000 nodes per step (`XSLT_MAX_RESULT_SIZE`, configurable with the `maxResultSize` engine option).
- **The `xslt` command crashed for every npm user** with `ERR_MODULE_NOT_FOUND: jsdom`: the CLI imported `jsdom`, which was only a devDependency. `jsdom` is now an optional peer dependency, loaded on demand; when it is missing the CLI prints how to install it. The library itself keeps zero runtime dependencies.
- The CLI used the private `processor._engine` field instead of the public `engine` getter.
- **CLI `xsl:include`, `xsl:import` and `document()`** did not work: no loaders and no base URI were set. They now resolve relative to the referencing stylesheet, confined to the base directory; `http:`/`https:` URIs are refused, and a `document()` that cannot be loaded yields an empty node-set with a one-line warning.
- **CLI input decoding** always assumed UTF-8, so an ISO-8859-1 document came out as `caf�`. Files are now decoded per XML 1.0 Appendix F: byte order mark, then the XML declaration's `encoding`, else UTF-8 (new `bin/lib/decode.js`).

### Performance

- Trimming XML whitespace in `normalize-space()` and `number()` used a regular expression that backtracks quadratically on long whitespace runs; it is now a linear scan (400,000 spaces: 4 ms).
- Template matching is linear: `apply-templates` over 8,000 children with `match="item[@id]"` dropped from 90 s to 0.1 s, Muenchian grouping over 8,000 items from 8.5 s to 0.3 s, key lookups from 7 s to 0.2 s.
- The transformation from issue #9 (3.4 MB of HTML output) dropped from 28 s to 8 s. Axes walk `firstChild`/`nextSibling` instead of indexing jsdom `NodeList`s (each index access crosses a Proxy), step results are merged without quadratic `concat`/`unshift`, sort keys are computed once per node instead of once per comparison, and name tests only read `namespaceURI` and the document content type when the result depends on them.

### Added

- `src/xpath/axes.js` (axis traversal) and `src/xslt/sort.js` (xsl:sort), each with a full test suite, plus `src/regressions.test.js` for reported issues.
- `XSLT_MAX_RESULT_SIZE` and `XSLT_MAX_EXPRESSION_DEPTH` exports and the `maxResultSize` / `maxRecursionDepth` / `documentLoader` engine options in the TypeScript declarations.
- New modules: `src/xpath/strings.js`, `src/xslt/{patterns,patternCompiler,variables,stylesheetNamespaces,resultNamespaces,copying,avt}.js`, `bin/lib/{decode,loaders,output}.js`.

### Changed

- CLI stdout no longer gets an extra trailing newline when piped or redirected, so it is byte-identical to `-o`; a newline is only added for an interactive terminal.
- Stylesheets without `xsl:output method` whose result root is `<html>` are now serialized as HTML (no XML declaration, `<br>`); `engine.outputSettings.method` is `null` unless declared.
- Behaviour that relied on the fixed bugs changes accordingly: `/` no longer matches the document element, equal-priority templates pick the last one, `number('1e3')` is NaN, `@*` skips `xmlns` declarations.
- Templates no longer see their caller's local variables, and variables declared inside `xsl:if`/`xsl:choose`/`xsl:for-each` are not visible after them; stylesheets that relied on this now fail with `Undefined variable`, as they do in libxslt.
- Namespace declarations in scope in the stylesheet now appear on result elements (list them in `exclude-result-prefixes` to suppress them), matching libxslt.
- `XsltContext` gained `globals` and `xpathVariables`; the internal `processElement`/`processXsltElement` methods were replaced by an instruction dispatch table.
- `engine.keys[name]` is now an array of `{ match, use }` definitions.
- `xsl:sort` without `lang`/`case-order` orders `B` before `a` (code point order), matching Chrome's native `XSLTProcessor`; previously the order was case-insensitive. Add `lang="en"` to get locale collation.

### Dependencies

- `eslint` 10.10.0 -> 10.11.0, `prettier` 3.9.6 -> 3.9.9, `jsdom` 29.1.1 -> 30.1.1 (dev; jsdom is also an optional peer dependency `>=25.0.0` for the CLI).
- GitHub Actions: `docker/setup-buildx-action` 4.4.1; the Pages workflow moved from `checkout@v4`, `configure-pages@v5`, `upload-pages-artifact@v3`, `deploy-pages@v4` to the current releases, all pinned to commit SHAs, with `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24`.

## [1.1.1] - 2026-09-10

### Fixed

- **npm packaging** - the `bin` entry used a `./` prefix, which npm 11 rejects ("script name bin/xslt.js was invalid and removed"), so the published package would have had no `xslt` executable. The entry is now `bin/xslt.js`.
- **npm packaging** - test files (`src/**/*.test.js`) are excluded from the tarball via negated `files` patterns (68 -> 48 files).

- **Release workflow** - the publish step now passes the `NPM_TOKEN` secret as `NODE_AUTH_TOKEN` when it is configured, falling back to Trusted Publishing (OIDC) otherwise. The README documents that the token must be a Granular Access Token or a classic Automation token; a classic Publish token fails in CI with `EOTP`.

Version 1.1.0 was tagged on GitHub but never reached npm (the publish job ran before npm Trusted Publishing was configured); 1.1.1 is the release to install.

## [1.1.0] - 2026-09-10

Minor release: new public API (`setStylesheetLoader`, `setDocumentLoader`, `transformToString`, `engine`), the `xsl:output` serializer and the XSLT 1.0 conformance fixes below. Versions 1.0.4-1.0.8 were tagged but never published to npm, so this is the first npm release after 1.0.3.

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
- Updated `VERSION` in `src/index.js` to `1.1.0`.
- Fixed the package name in the generated declaration header (`@tradik/xslt-processor`).
- `xsl:include`/`xsl:import` failures are rethrown with `{ cause }` so the original loader/parser error and stack are preserved (ESLint 10 `preserve-caught-error`).
- GitHub Actions bumped to `actions/checkout@v7`, `actions/setup-node@v7`, `actions/upload-artifact@v7`, `docker/setup-buildx-action@v4`; `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` enabled.
- README "Publishing to npm" section rewritten to match the actual workflow (it previously claimed an `NPM_TOKEN`-based auto-publish that did not exist).
- `XsltEngine.namespaceAliases` is now a `NamespaceAliasMap` keyed by namespace URI instead of a plain prefix-to-prefix object (internal API; the previous shape never produced correct output).
- `XsltEngine.countNumber()` was replaced by `countXsltNumber()` in `src/xslt/number.js`; `XsltEngine.formatNumber()` and `XsltEngine.toRoman()` are kept as thin delegating wrappers.
- `XsltEngine.resolveUri()` delegates to `src/xslt/uri.js`, which also recognises URIs with any scheme (not just `http:`/`https:`) as absolute.
- `system-property('xsl:version')` returns the string `"1"` (previously the number `1`); XPath converts it for arithmetic and comparisons, so output is unchanged.
- Build targets raised from ES2020/Node 18 to ES2022/Node 20 (the code now uses `Object.hasOwn` and `Array.prototype.at`; browser bundle needs Chrome 92+, Firefox 92+, Safari 15.4+).
- `removeParameter()` and `clearParameters()` now restore the `xsl:param` default of the stylesheet instead of deleting the declaration (which made `$name` an undefined variable). New engine helpers `setParameterValue()`, `clearParameterValue()` and `clearParameterValues()` back this.

- `-f, --format` on the CLI is now an alias of `--indent` and drives the real serializer instead of the previous naive re-indentation.

### Security

- **CLI path validation** - input and output paths are resolved, canonicalized (`realpathSync`, so symbolic links cannot escape), confined to a trusted base directory (the working directory, or `XSLT_BASE_DIR`) and validated (regular file / existing parent directory, no NUL bytes) before any filesystem access (SonarCloud S8707). Paths outside the base directory are rejected with a hint.
- **Workflows** - every GitHub Action is pinned to a full commit SHA; the publish job installs with `npm ci --ignore-scripts`.
- **Docker** - the production image runs as the unprivileged `node` user.
- **js-yaml** (transitive via `eslint`) - GHSA-5p4m-2wfm-xmqj, vulnerable `>= 4.0.0, < 4.3.1`. Resolved by upgrading `eslint` to 10.x, which no longer pulls `@eslint/eslintrc`/`js-yaml` at all; `npm audit` reports 0 vulnerabilities.
- **brace-expansion** - GHSA-mh99-v99m-4gvg / GHSA-rgw5-rvv9-x895 (DoS), resolved via `npm audit fix` (now 5.0.9).

### Dependencies

- `eslint` `^9.0.0` -> `^10.10.0` (flat config unchanged; `@eslint/js` is now an explicit devDependency because ESLint 10 stopped bundling it).
- `jsdom` `^25.0.0` -> `^29.1.1`, `esbuild` `^0.28.0` -> `^0.28.2`, `prettier` `^3.4.0` -> `^3.9.6`.
- **Supported Node.js**: `engines.node` raised from `>=18.0.0` to `>=20.19.0` (Node.js 18 and 20 are end-of-life; jsdom 29 needs 20.19+). CI matrix is now Node.js 22, 24 and 26; Docker images use `node:26-alpine`.

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
