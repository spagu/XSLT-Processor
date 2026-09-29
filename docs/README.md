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
| [Development](DEVELOPMENT.md) | Setup, tests, Docker, Makefile, publishing to npm |
| [Style Guide](STYLE-GUIDE.md) | Project colors with WCAG 2.2 contrast ratios |

Project files: [CHANGELOG](../CHANGELOG.md), [SECURITY](../SECURITY.md),
[CONTRIBUTORS](../CONTRIBUTORS.md), [LICENSE](../LICENSE.md).
