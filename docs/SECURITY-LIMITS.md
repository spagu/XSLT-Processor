# Security Limits

The XPath evaluator includes comprehensive security hardening to prevent common attack vectors. The
threat model and how to report a vulnerability are in
[SECURITY.md](../SECURITY.md#threat-model).

## DoS Prevention Limits

| `XPathEvaluator` option | Default | Description |
|-------------------------|---------|-------------|
| `maxRecursionDepth` | 100 | Prevents stack overflow from deeply nested expressions |
| `maxTemplateDepth` | 3000 (`XSLT_MAX_TEMPLATE_DEPTH`) | Deepest nesting of template instantiations; stops runaway recursion like libxslt's `xsltMaxDepth` |
| `maxResultSize` | 10,000 | Prevents memory exhaustion from large result sets |
| `maxStringLength` | 1,000,000 | Limits string processing to prevent memory issues |

Exceeding a limit throws an `Error` (`Maximum recursion depth exceeded (100)`,
`Result set exceeds maximum size (10000)`).

These limits apply to the standalone XPath API, where expressions may come
from untrusted input. `evaluateXPath`, `selectXPath` and `selectFirstXPath`
use the defaults unless you pass `maxResultSize`, `maxRecursionDepth` or
`maxStringLength` in their options (since 1.3.0), for example
`selectXPath("//item", doc, { maxResultSize: 100000 })`; `XPathEvaluator`
takes the same options. Inside an
XSLT transformation the stylesheet is trusted program code, so `XsltEngine`
allows up to 5,000,000 nodes per location step (`XSLT_MAX_RESULT_SIZE`), which
lets stylesheets process large catalogs and exports, and allows XPath
expressions nested up to 1000 levels deep (`XSLT_MAX_EXPRESSION_DEPTH`). Pass
`new XsltEngine({ maxResultSize, maxRecursionDepth })` to choose other bounds.

For the other `XsltEngine` options see
[XsltEngine options](API.md#xsltengine-options).

## Prototype Pollution Protection

The following variable names are blocked:
- `__proto__`, `constructor`, `prototype`
- `__defineGetter__`, `__defineSetter__`
- `__lookupGetter__`, `__lookupSetter__`

## Input Validation

- **AST Validation**: All AST nodes are validated before evaluation
- **Type Safety**: Strict type checking on all inputs
- **Safe Variable Lookup**: Uses `hasOwnProperty` to prevent prototype chain attacks

## Custom Security Limits

```javascript
import { XPathEvaluator, XPathContext, parseXPath } from '@tradik/xslt-processor';

const evaluator = new XPathEvaluator({
  maxRecursionDepth: 50,    // Lower for untrusted input
  maxResultSize: 1000,      // Limit result set size
  maxStringLength: 10000    // Limit string operations
});

const ast = parseXPath('//item');
const context = new XPathContext(xmlDoc);
const result = evaluator.evaluate(ast, context); // array of <item> elements
```
