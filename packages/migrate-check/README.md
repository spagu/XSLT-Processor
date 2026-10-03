# xslt-migrate-check

[![npm version](https://img.shields.io/npm/v/xslt-migrate-check.svg)](https://www.npmjs.com/package/xslt-migrate-check)
[![License](https://img.shields.io/npm/l/xslt-migrate-check.svg)](https://opensource.org/licenses/BSD-3-Clause)
[![Node.js](https://img.shields.io/node/v/xslt-migrate-check.svg)](https://nodejs.org/)
[![Dependencies: 0](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](package.json)

Chrome 158 (17 November 2026) stops running XSLT; by Chrome 176 (17 August 2027) the code is gone. Pages that call `XSLTProcessor`, and XML files that
start with `<?xml-stylesheet type="text/xsl" ...?>`, stop rendering then.

`xslt-migrate-check` scans a project, rates every place that depends on the
browser's XSLT, tells you what to install and which line to add, and with
`--fix` writes those lines as a patch. `xslt-migrate-test` then runs every
stylesheet on the browser's engine and on the library and compares the
output. No dependencies; it reads files and sends nothing anywhere.

```sh
npx xslt-migrate-check .
npx xslt-migrate-check . --html        # also writes xslt-migration-report.html
npx xslt-migrate-check . --fix         # writes migration.patch; git apply it
npx -p xslt-migrate-check -p @tradik/xslt-processor -p jsdom xslt-migrate-test .
```

With another package manager:

```sh
yarn dlx xslt-migrate-check .     # Yarn 4; Yarn 1: npx as above
pnpm dlx xslt-migrate-check .
bunx xslt-migrate-check .
pnpm dlx --package xslt-migrate-check --package @tradik/xslt-processor --package jsdom xslt-migrate-test .
bunx --package xslt-migrate-check xslt-migrate-test .   # with the library and jsdom installed in the project
```

As a dev dependency: `npm install -D xslt-migrate-check`,
`yarn add -D xslt-migrate-check`, `pnpm add -D xslt-migrate-check` or
`bun add -d xslt-migrate-check`. Yarn 4 does not install a release in its
first day (`npmMinimalAgeGate`, 1440 minutes); right after a release,
`yarn dlx` reports "quarantined" until then.

## Output

```
Chrome 158 Migration Report

Risk: HIGH
  Chrome 158 (17 November 2026) stops running XSLT; these pages break then.

Native XSLTProcessor:      4 usages
xml-stylesheet:            3 files
Stylesheets:               12
Compatible automatically:  13
Manual review:             4

Recommended runtime:       @tradik/xslt-processor + @tradik/xslt3
Estimated migration difficulty: HIGH
  Some stylesheets need real work: 1 with MSXML extensions to rewrite, and 2 in XSLT 2.0/3.0 to test on @tradik/xslt3.

Found 17 XSLT usages

HIGH    public/invoice.xml  Uses <?xml-stylesheet?>
HIGH    src/report.js       Uses native XSLTProcessor
HIGH    styles/legacy.xsl   Uses msxsl:script (MSXML); no browser runtime runs it
MEDIUM  styles/modern.xsl   Declares XSLT 2.0; needs @tradik/xslt3
MEDIUM  styles/report.xsl   Uses document()
LOW     src/invoice.js      Already loads @tradik/xslt-processor
LOW     styles/simple.xsl   Standard XSLT 1.0
```

The report starts with the 0.1.0 "Found ..." lines, then the block above,
then "What to do" (one numbered step per recommendation, with the commands
and the line to add) and the detail sections: every usage with its line,
the `DOMParser` calls next to it (context only), the XML documents, each
stylesheet's version and features, and the files already migrated.

**Compatible automatically** counts the LOW findings plus the HIGH ones the
one-line migration fixes without touching code (`XSLTProcessor` in scripts,
`<?xml-stylesheet?>` documents whose stylesheet is XSLT 1.0). **Manual
review** is the rest. Difficulty is LOW when nothing needs review, MEDIUM
when something does but no MSXML and no XSLT 2.0/3.0, HIGH otherwise.

## Ratings

| Rating | Finding                                                                                                                                                                                                                                                                                                                                                                                     |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HIGH   | `XSLTProcessor` (`new`, `importStylesheet`, `transformToFragment`, `transformToDocument`, `setParameter`) in a script that does not load `@tradik/xslt-processor`; an XML document with `<?xml-stylesheet?>`; HTML with `type="text/xsl"`; `msxsl:script` or MSXML functions other than `msxsl:node-set`                                                                                    |
| MEDIUM | `document()`; `version="2.0"` or `"3.0"`; EXSLT the library lacks (functions, regular-expressions, random, `date:format-date`, `date:parse-date`, `dyn:map`, `exsl:document`) or keeps off (`dyn:evaluate`); calls into other extension namespaces; `xsl:include`/`xsl:import` whose target is not in the project; `disable-output-escaping` when the project calls `transformToFragment()` |
| LOW    | Standard XSLT 1.0, with EXSLT common, math, sets, strings, dates-and-times or `msxsl:node-set`; files that already load `@tradik/xslt-processor`; stylesheets of a project that runs XSLT only on the server                                                                                                                                                                                |

The project risk is the highest rating found (NONE when nothing is found).
A project counts as server-side when no browser code uses XSLT and its
`package.json` depends on `@tradik/xslt-processor`, `xslt-processor`,
`saxon-js`, `libxslt`, `xslt3` or `xsltproc`, or an npm script runs
`xsltproc`.

Files read: scripts and templates (`.js .mjs .cjs .jsx .ts .tsx .vue .svelte
.astro .html .htm .php .erb .ejs .hbs .twig .cshtml .jsp`), stylesheets
(`.xsl .xslt`, and `.xml` with an `xsl:stylesheet` root) and XML documents
(`.xml .rdf .rss .atom`, first 4 KB). `node_modules`, `.git`, `dist`,
`build`, `out`, `coverage`, `vendor`, `.next`, `.nuxt`, `.svelte-kit` and
`target` are skipped, as are files over 5 MB and symbolic links.

## Recommendations

| Project                             | Recommended                                                                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `XSLTProcessor` in JavaScript       | `npm install @tradik/xslt-processor` and `import "@tradik/xslt-processor/polyfill";`, or the script tag below without a bundler |
| XML pages with `<?xml-stylesheet?>` | Browser compatibility loader: the XHTML script line as the first child of the document element                                  |
| XSLT 2.0 / 3.0 stylesheets          | `npm install @tradik/xslt-processor @tradik/xslt3` and `new XSLTProcessor({ xsltVersion: "auto" })`                             |
| MSXML extensions                    | No runtime runs them: rewrite as templates, `xsl:function` or EXSLT                                                             |
| Stylesheets with no browser usage   | Render on the server with the `xslt` CLI at build time                                                                          |

A mixed project gets every step that applies, the one with the most files
to change first; "(N files)" counts the files you edit (the polyfill step:
the scripts and pages, not the stylesheets they run).

```html
<script src="https://cdn.jsdelivr.net/npm/@tradik/xslt-processor@1/dist/xslt-processor.browser.min.js"></script>
<!-- inside an XML document, as the first child of the root element: -->
<script
  xmlns="http://www.w3.org/1999/xhtml"
  src="https://cdn.jsdelivr.net/npm/@tradik/xslt-processor@1/dist/xslt-processor.browser.min.js"
></script>
```

## Options

```
xslt-migrate-check [dir] [options]

  --json              JSON instead of the report
  --html [file.html]  Also write the HTML report (default:
                      ./xslt-migration-report.html in the working directory)
  --fail-on <level>   Exit 1 at this risk: none (default), low, medium, high
  --ignore <dir>      Skip directories with this name (repeatable; * allowed)
  --fix               Write <dir>/migration.patch with the automatic fixes
  --fix --write       Apply them in place (needs a clean git tree, or --force)
  -h, --help          Usage
  -v, --version       Version
```

`--html` takes the next argument as the file name only when it ends in
`.html` or `.htm` (or write `--html=path`). The page is self-contained (inline
CSS, a few lines of inline script for the rating filter, no external
requests), follows the light or dark system theme and is rendered from the
same data as `--json`. With `--json`, the "HTML report written to" line goes
to stderr so stdout stays valid JSON.

The JSON keeps the 0.1.0 keys (`version`, `scannedFiles`, `durationMs`,
`risk`, `usages`, `stylesheets`, `xmlDocuments`, `migrated`, `serverSide`,
`needsXslt3`, `msxml`, `suggestion`) and adds `findings` (file, line, kind,
rating, reason, fix, automatic, issues, details), `summary` (the numbers of
the report) and `recommendations` (id, title, why, commands, snippet,
alternative, runtime, findings).

Exit codes: 0, or 1 when the risk reaches `--fail-on`; 2 for a bad command
line, a directory that does not exist, a file that cannot be written, or
`--write` on uncommitted changes.

## Automatic fixes

`--fix` writes `migration.patch` (unified diff, sorted, `git apply`-ready):
`import "@tradik/xslt-processor/polyfill";` (or `require(...)`) as the first
statement of each script, the CDN tag in the `<head>` of pages with inline
`XSLTProcessor`, the loader as the first child of each `<?xml-stylesheet?>`
document, and the packages in `package.json`. Stylesheets are never changed;
CRLF, BOM and indentation are kept. `--fix --write` edits in place after
`git status` says the tree is clean. Details:
[docs/MIGRATE-CHECK.md](https://github.com/spagu/XSLT-Processor/blob/main/docs/MIGRATE-CHECK.md#automatic-fixes).

## Compatibility test

`xslt-migrate-test` runs each `<?xml-stylesheet?>` pair (or `--pairs
pairs.json`, or `--xml a.xml --xsl a.xsl`) on Chromium's native XSLT through
Playwright, else `xsltproc`, else alone (smoke test), and on
`@tradik/xslt-processor` (an optional peer, with jsdom), then compares the
parsed outputs: MATCH, DIFFERENT OUTPUT (first differing node), ERROR,
SKIPPED, and `Compatibility: 93.6%`. `--json`, `--html`, `--diff full`,
`--fail-under 95`. Details:
[docs/MIGRATE-TEST.md](https://github.com/spagu/XSLT-Processor/blob/main/docs/MIGRATE-TEST.md).

## In the browser

```js
import { analyzeFiles } from "xslt-migrate-check/analyze";
const analysis = analyzeFiles([
  { path: "app.js", text: "new XSLTProcessor()" },
]);
```

The same analysis as the CLI (findings, summary, recommendations, risk),
with no Node.js built-ins in its imports.

## In CI

```sh
npx xslt-migrate-check . --fail-on high
```

Since 0.2.0 a project with only standard XSLT 1.0 stylesheets rates LOW
(0.1.0 said MEDIUM), so `--fail-on medium` now fails only when a stylesheet
needs review; use `--fail-on low` to fail on any XSLT at all.

Step by step: <https://xslt-processor.tradik.com/blog/migrating-from-native-xslt/>.
Full documentation: [docs/MIGRATE-CHECK.md](https://github.com/spagu/XSLT-Processor/blob/main/docs/MIGRATE-CHECK.md).

## Licence

BSD-3-Clause, see [LICENSE.md](LICENSE.md). Part of the
[XSLT-Processor](https://github.com/spagu/XSLT-Processor) repository.
