# Migration Checker

`xslt-migrate-check` finds the XSLT a project depends on in the browser, the
part that stops working when Chrome 158 removes native XSLT on 17 November 2026. It rates every finding, estimates the effort, and says what to install
and which line to add. It reads files only; nothing leaves the machine. It
has no dependencies and needs Node.js 20.19 or later.

Without Node.js, the same analysis runs on the website: drop the files, a
folder or a zip on [the online check](https://xslt-processor.tradik.com/check/);
they are read in the browser and not uploaded.

```sh
npx xslt-migrate-check .
npx xslt-migrate-check . --html        # also writes xslt-migration-report.html
npx xslt-migrate-check . --fix         # writes migration.patch with the one-line changes
```

Then prove the switch: [`xslt-migrate-test`](MIGRATE-TEST.md), in the same
package, runs every stylesheet on the browser's engine and on the library and
compares the output.

## The report

A sample project with two scripts (one already importing
`@tradik/xslt-processor`), three XML pages with `<?xml-stylesheet?>`, ten
XSLT 1.0 stylesheets (one with `document()`, one with `msxsl:script`, one
with EXSLT common), one 2.0 and one 3.0 stylesheet:

```text
xslt-migrate-check 0.3.0 — scanned 17 files in ./ (0.0 s)

Found 4 XSLTProcessor usages in 1 file
Found 12 XSL stylesheets (10 × XSLT 1.0, 1 × XSLT 2.0, 1 × XSLT 3.0)
Found 3 XML documents rendered with <?xml-stylesheet?>
Found 1 file already using @tradik/xslt-processor

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

HIGH    public/catalog.xml  Uses <?xml-stylesheet?>
HIGH    public/invoice.xml  Uses <?xml-stylesheet?>
HIGH    public/orders.xml   Uses <?xml-stylesheet?>
HIGH    src/report.js       Uses native XSLTProcessor
HIGH    styles/legacy.xsl   Uses msxsl:script (MSXML); no browser runtime runs it
MEDIUM  styles/latest.xsl   Declares XSLT 3.0; needs @tradik/xslt3
MEDIUM  styles/modern.xsl   Declares XSLT 2.0; needs @tradik/xslt3
MEDIUM  styles/report.xsl   Uses document()
LOW     src/invoice.js      Already loads @tradik/xslt-processor
LOW     styles/nodeset.xsl  XSLT 1.0 with EXSLT common
LOW     styles/simple.xsl   Standard XSLT 1.0
...
```

The report then lists "What to do" (one numbered step per recommendation,
see below) and the detail sections of 0.1.0: every `XSLTProcessor` line,
the `DOMParser` calls within 20 lines of it (context, never a finding),
the XML documents with their `href`, each stylesheet with its version and
features, and the files already migrated.

- **Native XSLTProcessor**: lines that use the API in scripts that do not
  load `@tradik/xslt-processor` yet.
- **Compatible automatically**: LOW findings plus the HIGH ones the one-line
  migration fixes without touching code: `XSLTProcessor` in scripts, and
  `<?xml-stylesheet?>` documents whose stylesheet (when it is in the project)
  needs neither XSLT 2.0/3.0 nor MSXML.
- **Manual review**: everything else.
- **Estimated migration difficulty**: LOW when nothing needs review; MEDIUM
  when something does, but no stylesheet uses MSXML or XSLT 2.0/3.0; HIGH
  otherwise. The sentence under it says why.

## Ratings

Every finding (one per file) gets a rating and a one-line reason.

| Rating     | When                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **HIGH**   | `XSLTProcessor`, `importStylesheet(`, `transformToFragment(`, `transformToDocument(` (and `setParameter(` in the same file) in a script that does not load `@tradik/xslt-processor`; an XML, RSS, Atom or RDF document with `<?xml-stylesheet?>` of type `text/xsl`, `application/xslt+xml` or `application/xml`; HTML with `type="text/xsl"`; `msxsl:script`, or an MSXML function other than `msxsl:node-set`                                                                                                                                                                                         |
| **MEDIUM** | `document()` (the browser runtime fetches each file, same origin only); `version="2.0"` or `"3.0"` (needs `@tradik/xslt3`); EXSLT outside what the library runs: the functions, regular-expressions and random modules, `date:format-date`, `date:parse-date`, `dyn:map`, `exsl:document`; EXSLT dynamic (`dyn:evaluate` is off by default); calls into other extension namespaces and `extension-element-prefixes` bound to them; `xsl:include`/`xsl:import` whose file is not in the project; `disable-output-escaping` when the project calls `transformToFragment()` (the output is parsed as HTML) |
| **LOW**    | Standard XSLT 1.0, also with EXSLT common, math, sets, strings, dates-and-times (see [Conformance](CONFORMANCE.md#extension-functions-exslt)) or `msxsl:node-set`; a stylesheet without a version (runs as 1.0); files that already load `@tradik/xslt-processor`; stylesheets of a server-side project                                                                                                                                                                                                                                                                                                 |

`msxsl:node-set` rates LOW because the library implements it. Calls to the
stylesheet's own functions (`xsl:function`, `func:function`, the prefix of
an `msxsl:script`) and to W3C namespaces (`fn:`, `xs:`, `math:`, `map:`) are
not extensions.

A project is **server-side** when no browser code uses XSLT and its
`package.json` depends on `@tradik/xslt-processor`, `xslt-processor`,
`saxon-js`, `libxslt`, `xslt3` or `xsltproc`, or an npm script runs
`xsltproc`; its stylesheets then rate LOW unless they use MSXML.

The **project risk** is the highest rating (NONE when nothing is found).
Since 0.2.0 the levels are NONE, LOW, MEDIUM, HIGH; 0.1.0 rated any
stylesheet-only project MEDIUM, 0.2.0 rates standard XSLT 1.0 LOW.

The libxslt conformance corpus (584 stylesheets) rates 499 LOW and 85
MEDIUM, none HIGH.

## Recommendations

| Project                             | Step                                                                                                                                                                                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `XSLTProcessor` in JavaScript       | `npm install @tradik/xslt-processor`, then `import "@tradik/xslt-processor/polyfill";` once with a bundler, or the CDN script tag before your scripts                                                                                |
| XML pages with `<?xml-stylesheet?>` | **Browser compatibility loader**: `<script xmlns="http://www.w3.org/1999/xhtml" src="https://cdn.jsdelivr.net/npm/@tradik/xslt-processor@1/dist/xslt-processor.browser.min.js"></script>` as the first child of the document element |
| XSLT 2.0 / 3.0 stylesheets          | `npm install @tradik/xslt-processor @tradik/xslt3` and `new XSLTProcessor({ xsltVersion: "auto" })`; new code without the W3C API can use `@tradik/xslt3` alone                                                                      |
| MSXML extensions                    | No runtime runs them: `msxsl:script` becomes templates or `xsl:function`, `msxsl:format-date` becomes `format-date()` (2.0) or EXSLT `date:`                                                                                         |
| Stylesheets with no browser usage   | Render at build time with the `xslt` CLI (`npx xslt data.xml template.xsl -o page.html`)                                                                                                                                             |

The CDN script tag:
`<script src="https://cdn.jsdelivr.net/npm/@tradik/xslt-processor@1/dist/xslt-processor.browser.min.js"></script>`.

A mixed project gets every step that applies, ordered by the number of
files each asks you to change, the "(N files)" of the report. Since 0.3.0
the polyfill step counts only the scripts and pages that call
`XSLTProcessor` (0.2.0 added the stylesheets they run); its explanation
names the XSLT 1.0 stylesheets that run unchanged. The texts live in one module
(`packages/migrate-check/src/texts.js`) shared by the terminal report, the
HTML report and the website.

## HTML report

`--html` writes `xslt-migration-report.html` in the current working
directory; `--html report.html` (any name ending in `.html` or `.htm`) or
`--html=path` chooses the file. The command prints where it went (on stderr
when `--json` is also given, so stdout stays JSON).

The page has a header (project, date, tool version, risk badge), the summary
table, "What to do" with the commands and the three one-line fixes, the
findings table (rating, file:line, reason, fix) with a filter by rating and
a button that reverses the order, and links to the how-to, this page and the
package on npm. It is one file with inline CSS and a few lines of inline
script, makes no external requests and uses no web fonts. Colours are the
website tokens from the [Style Guide](STYLE-GUIDE.md), light or dark from
`prefers-color-scheme`; text pairs meet WCAG 2.2 AA and ratings are always
written out, never shown by colour alone. Every value from the scan is
HTML-escaped. It is rendered from the same analysis object as `--json`.

## Options

| Option                        | Effect                                                   |
| ----------------------------- | -------------------------------------------------------- |
| `[dir]`                       | Directory to scan (default: the current one)             |
| `--json`                      | Machine-readable output, nothing else on stdout          |
| `--html [file]`               | Also write the HTML report                               |
| `--fail-on low\|medium\|high` | Exit 1 when the risk is at or above the level            |
| `--ignore <name>`             | Skip directories with this name; repeatable, `*` allowed |
| `--fix`                       | Write `migration.patch` (see Automatic fixes)            |
| `--fix --write [--force]`     | Apply the fixes in place                                 |
| `--help`, `--version`         | Usage and version                                        |

Exit codes: 0 normally, 1 when `--fail-on` triggers, 2 for a usage error, a
directory that does not exist, an HTML file or patch that cannot be
written, or `--write` on a working tree with uncommitted changes.

The JSON object keeps the 0.1.0 keys `version`, `scannedFiles`,
`durationMs`, `risk`, `usages`, `stylesheets`, `xmlDocuments`, `migrated`,
`serverSide`, `needsXslt3`, `msxml`, `suggestion`, and adds `findings`
(`file`, `line`, `kind`, `rating`, `reason`, `fix`, `automatic`, `issues`,
`details`), `summary` (the numbers of the report) and `recommendations`
(`id`, `title`, `why`, `commands`, `snippet`, `alternative`, `runtime`,
`findings`). Usages gain `method`; stylesheets gain `exsltModules`,
`unsupportedExslt`, `msxmlScript`, `msxmlFunctions`, `extensionFunctions`,
`extensionNamespaces` and `includes` (with `found`: true, false, or null for
a URL).

Skipped by default: `node_modules`, `.git`, `dist`, `build`, `out`, `coverage`,
`vendor`, `.next`, `.nuxt`, `.svelte-kit`, `target`, anything named with
`--ignore`, files over 5 MB, and symbolic links.

## Automatic fixes and the browser entry

`--fix` writes the mechanical part of the migration as `migration.patch`, and
`xslt-migrate-check/analyze` runs the same analysis in a browser: both are in
[Migration fixes](MIGRATE-FIX.md). Comparing the output of your stylesheets on
the browser's engine and on this library is [xslt-migrate-test](MIGRATE-TEST.md).

## In a pipeline

```yaml
- run: npx xslt-migrate-check . --fail-on high
```

Once every page is migrated, the step keeps a new `new XSLTProcessor()`
without the one-line script from slipping in. `--fail-on medium` also fails
on stylesheets that need review; `--fail-on low` on any XSLT.

## Where it lives

`packages/migrate-check` in the repository, published to npm as
`xslt-migrate-check` from the same release tag as `@tradik/xslt-processor`
(`make publish-migrate-check`, see [Development](DEVELOPMENT.md)).
