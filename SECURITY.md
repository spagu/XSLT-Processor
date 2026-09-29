# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.1.x   | :white_check_mark: |
| < 1.1   | :x:                |

Security fixes are released as patch versions of the latest minor line
(e.g. 1.1.4). Upgrade with `npm install @tradik/xslt-processor@latest`.

## Reporting a Vulnerability

Please report vulnerabilities privately through GitHub:
[Report a vulnerability](https://github.com/spagu/XSLT-Processor/security/advisories/new)
(repository **Security** tab -> **Advisories** -> **Report a vulnerability**).

**Please do not open a public GitHub issue for security vulnerabilities.**

### What to Include

1. **Description**: what the vulnerability is and which API or CLI option is affected
2. **Steps to reproduce**: the XML, XSLT or XPath input and the calling code
3. **Impact**: e.g. denial of service, file disclosure, prototype pollution
4. **Version**: the `@tradik/xslt-processor` version and the environment
   (browser, or Node.js version and DOM implementation such as `jsdom`)

### Response Timeline

- **Initial Response**: Within 48 hours
- **Status Update**: Within 7 days
- **Fix Release**: Within 30 days for critical issues

## Threat Model

- **XPath API** (`evaluateXPath`, `selectXPath`, `XPathEvaluator`): expressions
  may come from untrusted input and are bounded by recursion, result size and
  string length limits (see "Security Features" in the [README](README.md)).
- **XSLT stylesheets** are treated as trusted program code: inside a
  transformation the XPath limits are much higher (`XSLT_MAX_RESULT_SIZE`,
  `XSLT_MAX_EXPRESSION_DEPTH`) and a stylesheet can loop or recurse until the
  JavaScript stack is exhausted. Do not run stylesheets from untrusted sources
  without your own time and memory limits (e.g. a worker you can terminate).
- **Loaders**: `xsl:import`, `xsl:include` and `document()` only load what your
  `setStylesheetLoader()` / `setDocumentLoader()` callbacks return. Validate
  the URIs they receive before reading files or fetching URLs.
- **CLI** (`xslt`): input, output, included and `document()` files are confined
  to the current directory or `XSLT_BASE_DIR` (after resolving symbolic links),
  and `http:`/`https:` URIs are refused.
- **Output**: the result is markup produced by the stylesheet.
  `disable-output-escaping="yes"` emits text unescaped; when a stylesheet copies
  user-provided content into HTML, escape or sanitize it before rendering.

## Built-in Security Features

- **DoS limits** on XPath recursion depth, node-set size and string length
- **Prototype pollution protection**: variable names such as `__proto__`,
  `constructor` and `prototype` are rejected, and variables are looked up with
  own-property checks
- **AST validation** before XPath evaluation
- **No `eval`**: expressions and stylesheets are interpreted, never compiled
  to JavaScript
- **Zero runtime dependencies**

## Acknowledgments

We appreciate security researchers who responsibly disclose vulnerabilities.
Reporters are acknowledged in the release notes unless they prefer to remain
anonymous.
