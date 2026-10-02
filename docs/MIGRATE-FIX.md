# Migration Fixes

What `xslt-migrate-check` can change for you, and how to run its analysis
outside Node.js. The checker itself, its ratings and its report are in
[Migration checker](MIGRATE-CHECK.md); testing the result is
[xslt-migrate-test](MIGRATE-TEST.md).

## Automatic fixes

`--fix` prints the report, then the files it would change and how, and
writes `migration.patch` into the scanned directory: a unified diff, sorted
by path, with a `#` header (tool version, risk, findings, runtime) that
`git apply` skips. Review it, then `git apply migration.patch`.

| File                                         | Change                                                                                                                            |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| ES module (`import`/`export`, `.mjs`, `.ts`) | `import "@tradik/xslt-processor/polyfill";` as the first statement, after a shebang, `"use strict"` and the leading comments      |
| CommonJS (`require(`, `.cjs`)                | `require("@tradik/xslt-processor/polyfill");` in the same place                                                                   |
| HTML page with inline `XSLTProcessor`        | The CDN `<script>` before the first `<script>` in `<head>`, or right after `<head>`                                               |
| XML document with `<?xml-stylesheet?>`       | The XHTML loader `<script>` as the first child of the document element; the XML declaration and its encoding stay as they are     |
| `package.json`                               | `"@tradik/xslt-processor": "^1.3.3"` in `dependencies` (and `"@tradik/xslt3": "^1.0.0"` with XSLT 2.0/3.0), order and indent kept |

Stylesheets are never changed. Edits work on the original bytes, so CRLF
line ends, a byte order mark, indentation and non-UTF-8 encodings survive.
Files that already load the library are not touched. Left to you, with the
reason: plain `.js` that is neither a module nor CommonJS (add the CDN tag to
the pages that load it; with `"type": "module"` in `package.json` it gets
the import), templates (`.vue`, `.php`, ...), pages without `<head>`, XML
documents whose stylesheet needs `@tradik/xslt3` or an MSXML rewrite, and
binary files.

`--fix --write` changes the files in place instead of writing the patch. It
first runs `git status --porcelain` in the scanned directory and refuses
(exit 2) when anything is uncommitted, so the change is one reviewable diff;
outside a git repository it goes ahead, and `--force` skips the check. Run
the checker again afterwards: the changed files are listed as already
migrated (LOW), including the XML documents, which since 0.3.0 count as
migrated when they load the library.

## In the browser

`xslt-migrate-check/analyze` exports the analysis without the file system:

```js
import { analyzeFiles } from "xslt-migrate-check/analyze";

const analysis = analyzeFiles([
  { path: "src/app.js", text: "new XSLTProcessor();" },
]);
analysis.risk; // "HIGH"; also findings, summary, recommendations
```

`files` lists `{ path, text }` with paths relative to the project
(`text: null` for a file that is only counted); options are `directory`,
`durationMs` and `exists(path)` for include targets outside the list. Its
imports use no Node.js built-ins (a test bundles it with esbuild for the
browser: about 19 KB minified, 7 KB gzip). The CLI runs the same code.
