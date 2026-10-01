# @tradik/xslt-processor

[![GitHub](https://img.shields.io/badge/GitHub-Repository-181717?logo=github)](https://github.com/spagu/XSLT-Processor)
[![GitHub stars](https://img.shields.io/github/stars/spagu/XSLT-Processor?style=social)](https://github.com/spagu/XSLT-Processor/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/spagu/XSLT-Processor?style=social)](https://github.com/spagu/XSLT-Processor/network/members)

[![CI](https://github.com/spagu/XSLT-Processor/actions/workflows/test.yml/badge.svg)](https://github.com/spagu/XSLT-Processor/actions/workflows/test.yml)
[![Browser tests](https://github.com/spagu/XSLT-Processor/actions/workflows/browser.yml/badge.svg)](https://github.com/spagu/XSLT-Processor/actions/workflows/browser.yml)
[![Release](https://github.com/spagu/XSLT-Processor/actions/workflows/release.yml/badge.svg)](https://github.com/spagu/XSLT-Processor/actions/workflows/release.yml)
[![npm version](https://img.shields.io/npm/v/@tradik/xslt-processor.svg)](https://www.npmjs.com/package/@tradik/xslt-processor)
[![License: BSD-3-Clause](https://img.shields.io/badge/License-BSD--3--Clause-blue.svg)](https://opensource.org/licenses/BSD-3-Clause)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.19.0-brightgreen.svg)](https://nodejs.org/)
[![Quality Gate](https://sonarcloud.io/api/project_badges/measure?project=spagu_XSLT-Processor&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=spagu_XSLT-Processor)
[![Line Coverage](https://img.shields.io/badge/line%20coverage-100%25-brightgreen.svg)](docs/CONFORMANCE.md#test-coverage)
[![TypeScript](https://img.shields.io/badge/types-included-3178c6.svg?logo=typescript&logoColor=white)](docs/API.md#typescript)

> **Source Code:** [github.com/spagu/XSLT-Processor](https://github.com/spagu/XSLT-Processor)

JavaScript implementation of XSLTProcessor for browser environments and Node.js CLI. This package provides a complete implementation of the W3C XSLTProcessor API that can be used as a drop-in replacement for the native browser implementation.

## Background

Chrome and other browsers are removing native XSLT ([Chrome's announcement](https://developer.chrome.com/docs/web-platform/deprecating-xslt)):
- **Chrome 143 (December 2025)**: `XSLTProcessor` and `<?xml-stylesheet type="text/xsl"?>` are deprecated, with warnings in the console
- **Chrome 158 (17 November 2026)**: XSLT stops working in stable Chrome, except for sites in the origin trial and browsers under the enterprise policy
- **Chrome 176 (17 August 2027)**: the origin trial and the enterprise policy end; XSLT is off everywhere
- Firefox and WebKit support the removal but have not announced dates

This library ensures your XSLT-based applications continue to work regardless of browser support.

## Features

- **1:1 Native API Compatibility**: Drop-in replacement for native `XSLTProcessor`
- **XSLT 1.0**: Every element and function of the W3C XSLT 1.0 Recommendation, with the few gaps listed under [Known Deviations](docs/CONFORMANCE.md#known-deviations)
- **XPath 1.0 Engine**: Built-in XPath evaluator with all core functions
- **`xsl:output` Serialization**: `transformToString()` honors method, indent, doctype, CDATA sections and `disable-output-escaping`
- **Zero Dependencies**: The library has no runtime dependencies; only the `xslt` command line tool needs `jsdom` (an optional peer dependency)
- **Multiple Formats**: ESM, CommonJS, and browser IIFE bundles
- **TypeScript Support**: Includes TypeScript declarations

## Documentation

The documentation is also published as a website with an interactive playground: <https://xslt-processor.tradik.com/> ([playground](https://xslt-processor.tradik.com/playground/): XSLT 1.0 transformations, and XPath 3.1 expressions with the in-development `@tradik/xslt3` at [?mode=xpath](https://xslt-processor.tradik.com/playground/?mode=xpath); [blog](https://xslt-processor.tradik.com/blog/) with an [RSS feed](https://xslt-processor.tradik.com/blog/rss.xml)).

| Guide | Contents |
|-------|----------|
| [API Reference](docs/API.md) | `XSLTProcessor` methods, parameters, `xsl:output` serialization, module exports, `XsltEngine` options, TypeScript |
| [Loaders](docs/LOADERS.md) | `xsl:import`, `xsl:include` and the `document()` function |
| [Complete Example](docs/EXAMPLES.md) | A product list transformed into an HTML table (browser and CLI) |
| [Command Line Tool](docs/CLI.md) | `xslt` options, base directory, includes, input encodings |
| [Conformance](docs/CONFORMANCE.md) | W3C compliance tables, supported elements and functions, known deviations, test coverage |
| [Security Limits](docs/SECURITY-LIMITS.md) | XPath and XSLT limits, prototype pollution protection, input validation |
| [Browser Compatibility](docs/BROWSER-SUPPORT.md) | Minimum browser versions, native XSLT removal timeline, feature detection |
| [XSLT 2.0 and 3.0](docs/XSLT3.md) | In development: one engine for XSLT 3.0 and 2.0 in a separate package, `@tradik/xslt3`; design, scope and milestones |
| [Benchmarks](docs/BENCHMARKS.md) | 1.1.3 vs 1.2.0: speed-up, time and peak memory per scenario, with charts, tables and `npm run bench` to reproduce |
| [Development](docs/DEVELOPMENT.md) | Setup, tests, Docker, Makefile, publishing to npm |
| [Style Guide](docs/STYLE-GUIDE.md) | Project colors with WCAG 2.2 contrast ratios |

All guides are listed in the [documentation index](docs/README.md).

## Installation

```bash
npm install @tradik/xslt-processor
```

The library itself has no dependencies. The `xslt` command line tool also
needs `jsdom` (an optional peer dependency, `>=25`), see [CLI Usage](#cli-usage).

## Quick Start

### Browser via CDN (Recommended)

Use a CDN for the easiest browser integration - no build step required:

```html
<!-- jsDelivr (recommended) -->
<script src="https://cdn.jsdelivr.net/npm/@tradik/xslt-processor@1/dist/xslt-processor.browser.min.js"></script>

<!-- or unpkg -->
<script src="https://unpkg.com/@tradik/xslt-processor@1/dist/xslt-processor.browser.min.js"></script>

<script>
  // XSLTProcessor is the native one, or this polyfill when native XSLT is unavailable
  const processor = new XSLTProcessor();

  // Load and transform XML
  const parser = new DOMParser();
  const xslt = parser.parseFromString(xsltString, 'application/xml');
  const xml = parser.parseFromString(xmlString, 'application/xml');

  processor.importStylesheet(xslt);
  const result = processor.transformToFragment(xml, document);
  document.getElementById('output').appendChild(result);
</script>
```

The bundle defines the global `XsltProcessorLib` (all [module exports](docs/API.md#module-exports))
and calls `installGlobal()`: `window.XSLTProcessor` is replaced only when the
browser has no working native implementation. To always use this
implementation, call `XsltProcessorLib.installGlobal(true)` or use
`new XsltProcessorLib.XSLTProcessor()`.

**CDN URLs:**

| CDN | URL |
|-----|-----|
| jsDelivr | `https://cdn.jsdelivr.net/npm/@tradik/xslt-processor@1/dist/xslt-processor.browser.min.js` |
| unpkg | `https://unpkg.com/@tradik/xslt-processor@1/dist/xslt-processor.browser.min.js` |

> **Tip:** Use `@1` for the latest 1.x version, or an exact version such as `@1.1.3` for pinning.

### Browser (Local Install)

If you prefer local installation:

```html
<script src="node_modules/@tradik/xslt-processor/dist/xslt-processor.browser.min.js"></script>
<script>
  // XSLTProcessor is now available globally
  const processor = new XSLTProcessor();
  // ...
</script>
```

### ESM Module

```javascript
import { XSLTProcessor, installGlobal } from '@tradik/xslt-processor';

// Optional: Force install as global XSLTProcessor
installGlobal();

// Or use directly
const processor = new XSLTProcessor();
const parser = new DOMParser();

// Load and parse XSLT stylesheet
const xsltText = await fetch('template.xsl').then(r => r.text());
const xsltDoc = parser.parseFromString(xsltText, 'application/xml');
processor.importStylesheet(xsltDoc);

// Load and parse XML source
const xmlText = await fetch('data.xml').then(r => r.text());
const xmlDoc = parser.parseFromString(xmlText, 'application/xml');

// Transform
const fragment = processor.transformToFragment(xmlDoc, document);
document.getElementById('output').appendChild(fragment);
```

### CommonJS

```javascript
const { XSLTProcessor } = require('@tradik/xslt-processor');

const processor = new XSLTProcessor();
// ...
```

### Node.js

Node.js has no DOM, so bring one such as `jsdom`. The
[filesystem loader example](docs/LOADERS.md#nodejs-example-filesystem-loader)
is a complete Node.js script, and the [API Reference](docs/API.md) covers every
method.

## CLI Usage

The package includes a command-line tool for transforming XML documents.

Without Node.js, use the standalone executable attached to every GitHub
release (Linux x64/arm64, macOS x64/arm64, Windows x64), installed with a
checksum check:

```bash
curl -fsSL https://raw.githubusercontent.com/spagu/XSLT-Processor/main/scripts/install.sh | bash
```

See [Standalone executables](docs/CLI.md#standalone-executables) for manual
installation. With Node.js, the command line tool needs a DOM implementation, so install `jsdom` next to
the package. It is an optional peer dependency: library users do not need it.
Without it, `xslt` exits with an explanation instead of a stack trace.

```bash
# Global installation
npm install -g @tradik/xslt-processor jsdom

# Transform XML with XSLT
xslt data.xml template.xsl

# Save output to file
xslt data.xml template.xsl -o result.html

# With parameters
xslt data.xml template.xsl -p title="My Page" -p count=10

# Format output with indentation
xslt data.xml template.xsl -f -o output.html

# Override the output method and drop the XML declaration
xslt data.xml template.xsl --method text
xslt data.xml template.xsl --no-declaration
```

See [Command Line Tool](docs/CLI.md) for all options, the base directory,
`xsl:include`/`document()` resolution and input encodings.

## Known Deviations

The main differences from XSLT 1.0 / XPath 1.0 and from libxslt:

- `xsl:number` ignores `lang` and `letter-value`;
- `unparsed-entity-uri()` always returns `''`;
- numbers convert to strings in the XPath 1.0 form (`10000000000`), where libxslt writes `1e+10`.

Details and workarounds: [Known Deviations](docs/CONFORMANCE.md#known-deviations).

## Contributing and Security

- [CONTRIBUTORS.md](CONTRIBUTORS.md) - how to contribute
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- [SECURITY.md](SECURITY.md) - reporting vulnerabilities and the threat model
- [CHANGELOG.md](CHANGELOG.md) - release history

## License

BSD-3-Clause License - see [LICENSE.md](LICENSE.md) for details.

## Related

- [MDN XSLTProcessor](https://developer.mozilla.org/en-US/docs/Web/API/XSLTProcessor)
- [libxslt](https://gitlab.gnome.org/GNOME/libxslt) - Reference implementation in C
