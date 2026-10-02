# Documentation

Guides for `@tradik/xslt-processor`, a pure JavaScript XSLT 1.0 processor that
implements the W3C `XSLTProcessor` API for browsers and Node.js and ships an
`xslt` command line tool. Installation and a quick start are in the
[project README](../README.md).

| Guide | Contents |
|-------|----------|
| [API Reference](API.md) | `XSLTProcessor` methods, parameters, `xsl:output` serialization, module exports, `XsltEngine` options, TypeScript |
| [Loaders](LOADERS.md) | `xsl:import`, `xsl:include` and the `document()` function |
| [Complete Example](EXAMPLES.md) | A product list transformed into an HTML table (browser and CLI) |
| [Command Line Tool](CLI.md) | `xslt` options, base directory, includes, input encodings |
| [Conformance](CONFORMANCE.md) | W3C compliance tables, supported elements and functions, known deviations, test coverage |
| [Security Limits](SECURITY-LIMITS.md) | XPath and XSLT limits, prototype pollution protection, input validation |
| [Browser Compatibility](BROWSER-SUPPORT.md) | Minimum browser versions, native XSLT removal timeline, feature detection |
| [XSLT 2.0 and 3.0](XSLT3.md) | `@tradik/xslt3`: one engine for XSLT 3.0 and 2.0 in a separate package; options, conformance and design |
| [Migration checker](MIGRATE-CHECK.md) | `npx xslt-migrate-check .`: finds `XSLTProcessor` usages, `<?xml-stylesheet?>` documents and stylesheets in a project, rates the Chrome risk and prints the one-line migration; `--json` and `--fail-on` for CI; online at [xslt-processor.tradik.com/check](https://xslt-processor.tradik.com/check/) |
| [Migration fixes](MIGRATE-FIX.md) | `npx xslt-migrate-check . --fix`: the polyfill import, the script tags and the dependencies written as `migration.patch` for review (`--write` applies it); `xslt-migrate-check/analyze` runs the same analysis in a browser |
| [Migration test](MIGRATE-TEST.md) | `xslt-migrate-test`: runs every XML + XSL pair on the browser's engine (Chromium) or libxslt and on this library, compares the output and reports the compatibility |
| [Benchmarks](BENCHMARKS.md) | Every version side by side (1.1.3, 1.2.0, 1.3.0, @tradik/xslt3) in one chart and table; then the detailed runs: 1.1.3 vs 1.2.0 speed-up, time and peak memory per scenario, with charts, tables and `npm run bench` to reproduce; XPath 1.0 of this package vs XPath 3.1 of @tradik/xslt3 (`npm run bench -- --suite xpath`); the XSLT 1.0 engine vs @tradik/xslt3 on the same stylesheets, idiomatic 2.0/3.0 rewrites and 3.0-only scenarios (`npm run bench -- --suite xslt`) |
| [Development](DEVELOPMENT.md) | Setup, tests, Docker, Makefile, publishing to npm |
| [Style Guide](STYLE-GUIDE.md) | Project colors with WCAG 2.2 contrast ratios |

Project files: [CHANGELOG](../CHANGELOG.md), [SECURITY](../SECURITY.md),
[CONTRIBUTORS](../CONTRIBUTORS.md), [LICENSE](../LICENSE.md).
