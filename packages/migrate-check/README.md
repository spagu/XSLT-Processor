# xslt-migrate-check

[![npm version](https://img.shields.io/npm/v/xslt-migrate-check.svg)](https://www.npmjs.com/package/xslt-migrate-check)
[![License: BSD-3-Clause](https://img.shields.io/badge/License-BSD--3--Clause-blue.svg)](https://opensource.org/licenses/BSD-3-Clause)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.19-brightgreen.svg)](https://nodejs.org/)

Chrome 158 (17 November 2026) stops running XSLT; by Chrome 176 (17 August
2027) the code is gone. Pages that call `XSLTProcessor`, and XML files that
start with `<?xml-stylesheet type="text/xsl" ...?>`, stop rendering then.

`xslt-migrate-check` scans a project directory, lists every place that
depends on the browser's XSLT and prints the one-line migration. No
dependencies, nothing is sent anywhere.

```sh
npx xslt-migrate-check .
```

## What it finds

- **XSLTProcessor usages** in scripts and templates (`.js .mjs .cjs .jsx .ts
  .tsx .vue .svelte .astro .html .htm .php .erb .ejs .hbs .twig .cshtml
  .jsp`): `XSLTProcessor`, `importStylesheet(`, `transformToFragment(`,
  `transformToDocument(`; comment lines are skipped. Files that already load
  `@tradik/xslt-processor` are listed apart as migrated.
- **XML documents rendered by the browser**: `.xml .rdf .rss .atom` files
  whose first 4 KB hold `<?xml-stylesheet?>` with type `text/xsl`,
  `application/xslt+xml` or `application/xml`. Chrome will show them as raw
  XML, so they rate HIGH.
- **HTML linking XSL** (`type="text/xsl"` or `<?xml-stylesheet`).
- **XSL stylesheets** (`.xsl .xslt`, and `.xml` files with an
  `xsl:stylesheet` root): declared version, EXSLT, `disable-output-escaping`,
  `document()`, `xsl:key`, and `msxsl:` extensions, which no browser polyfill
  can run.
- **Server-side packages** in `package.json` (`@tradik/xslt-processor`,
  `xslt-processor`, `saxon-js`, `libxslt`, `xslt3`, `xsltproc`), noted so a
  server-only project is not mistaken for a browser one.

`node_modules`, `.git`, `dist`, `build`, `out`, `coverage`, `vendor`,
`.next`, `.nuxt`, `.svelte-kit` and `target` are skipped, as are files over
5 MB and symbolic links.

## Output

```
xslt-migrate-check 0.1.0 — scanned 1,284 files in ./ (0.4 s)

Found 8 XSLTProcessor usages in 5 files
Found 14 XSL stylesheets (12 × XSLT 1.0, 2 × XSLT 2.0)
Found 3 XML documents rendered with <?xml-stylesheet?>
Chrome compatibility risk: HIGH
  Chrome 158 (17 November 2026) stops running XSLT; these pages break then.

Suggested migration: @tradik/xslt-processor
  One line, before your other scripts, keeps XSLTProcessor working:
  <script src="https://cdn.jsdelivr.net/npm/@tradik/xslt-processor@1/dist/xslt-processor.browser.min.js"></script>
  Inside an XML document rendered with <?xml-stylesheet?>, right after the processing instruction:
  <script xmlns="http://www.w3.org/1999/xhtml" src="https://cdn.jsdelivr.net/npm/@tradik/xslt-processor@1/dist/xslt-processor.browser.min.js"></script>
  XSLT 2.0/3.0 stylesheets: also install @tradik/xslt3 and pass { xsltVersion: "auto" }.
  How-to: https://xslt-processor.tradik.com/blog/migrating-from-native-xslt/
```

Detail sections follow, one line per finding as `path:line  text`:
"XSLTProcessor usages", "XML documents with <?xml-stylesheet?>", "XSL
stylesheets" (version and flags) and "Already using @tradik/xslt-processor".
Empty sections are left out.

Risk levels:

| Level | Meaning |
|---|---|
| HIGH | An XML document with `<?xml-stylesheet?>`, an `XSLTProcessor` usage that is not migrated, or HTML with `type="text/xsl"` |
| MEDIUM | Stylesheets found but nothing visible uses them (a server, or code outside the scanned directory, may) |
| NONE | Nothing found |

## Options

```
xslt-migrate-check [dir] [options]

  --json              JSON instead of the report: { version, scannedFiles,
                      durationMs, risk, usages, stylesheets, xmlDocuments,
                      migrated, serverSide, needsXslt3, msxml, suggestion }
  --fail-on <level>   Exit 1 at this risk: none (default), medium, high
  --ignore <dir>      Skip directories with this name (repeatable; * allowed)
  -h, --help          Usage
  -v, --version       Version
```

Exit codes: 0, or 1 when the risk reaches `--fail-on`; 2 for an unknown
option or a directory that does not exist.

## In CI

```sh
npx xslt-migrate-check . --fail-on high
```

The job fails as soon as a browser-side usage or a rendered XML document
appears. `--fail-on medium` also fails on stylesheets alone.

## The migration

One script tag, loaded before the code that uses `XSLTProcessor`, keeps the
same API working in every browser:

```html
<script src="https://cdn.jsdelivr.net/npm/@tradik/xslt-processor@1/dist/xslt-processor.browser.min.js"></script>
```

An XML document rendered with `<?xml-stylesheet?>` gets the same tag, in the
XHTML namespace, right after the processing instruction. Stylesheets that
declare `version="2.0"` or `"3.0"` also need `@tradik/xslt3` with
`new XSLTProcessor({ xsltVersion: "auto" })`.

Step by step: <https://xslt-processor.tradik.com/blog/migrating-from-native-xslt/>.
Library and playground: <https://xslt-processor.tradik.com/>.

## Licence

BSD-3-Clause, see [LICENSE.md](LICENSE.md). Part of the
[XSLT-Processor](https://github.com/spagu/XSLT-Processor) repository.
