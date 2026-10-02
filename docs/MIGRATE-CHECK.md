# Migration Checker

`xslt-migrate-check` finds the XSLT a project depends on in the browser, the
part that stops working when Chrome 158 removes native XSLT on 17 November
2026, and prints the risk and the one-line migration. It reads files only;
nothing leaves the machine. It has no dependencies and needs Node.js 20.19 or
later.

```sh
npx xslt-migrate-check .
```

```text
xslt-migrate-check 0.1.0 — scanned 19 files in ./ (0.0 s)

Found 5 XSLTProcessor usages in 2 files
Found 12 XSL stylesheets (10 × XSLT 1.0, 1 × XSLT 2.0, 1 × XSLT 3.0)
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

After the summary, every finding is listed with its file and line. The
how-to that goes with it: [Migrating from native XSLT](https://xslt-processor.tradik.com/blog/migrating-from-native-xslt/).

## What it looks for

| Finding | Files | What counts |
|---------|-------|-------------|
| `XSLTProcessor` usages | `.js .mjs .cjs .jsx .ts .tsx .vue .svelte .astro .html .htm .php .erb .ejs .hbs .twig .cshtml .jsp` | Lines with `XSLTProcessor`, `importStylesheet(`, `transformToFragment(` or `transformToDocument(`; comment lines are skipped. Files that already mention `@tradik/xslt-processor` or `XsltProcessorLib` are listed separately as migrated |
| XML documents rendered by the browser | `.xml .rdf .rss .atom` | `<?xml-stylesheet?>` with type `text/xsl`, `application/xslt+xml` or `application/xml` in the first 4 KB; the highest risk, Chrome shows them as raw XML |
| HTML pointing at XSL | `.html .htm` | `type="text/xsl"` or `<?xml-stylesheet` |
| Stylesheets | `.xsl .xslt`, and `.xml` whose first 4 KB contain `<xsl:stylesheet` or `<xsl:transform` | The declared `version`, EXSLT namespaces, `disable-output-escaping`, `document(`, `xsl:key`, and MSXML extensions (`msxsl:`), which no browser polyfill can run |
| Server-side signals | `package.json` | `@tradik/xslt-processor`, `xslt-processor`, `saxon-js`, `libxslt`, `xslt3`, `xsltproc` among the dependencies, listed to lower false alarms |

Skipped by default: `node_modules`, `.git`, `dist`, `build`, `out`, `coverage`,
`vendor`, `.next`, `.nuxt`, `.svelte-kit`, `target`, anything named with
`--ignore`, files over 5 MB, and symbolic links.

## Risk levels

| Level | When |
|-------|------|
| **HIGH** | An XML document with `<?xml-stylesheet?>`, an `XSLTProcessor` usage that is not migrated yet, or HTML with `type="text/xsl"` |
| **MEDIUM** | Stylesheets, but no usage the scanner can see: a server may run them, or code it does not read |
| **NONE** | Nothing found |

Two flags are reported besides: *needs @tradik/xslt3* when a stylesheet
declares version 2.0 or 3.0, and *MSXML extensions* when `msxsl:` is used.

## Options

| Option | Effect |
|--------|--------|
| `[dir]` | Directory to scan (default: the current one) |
| `--json` | Machine-readable output, nothing else on stdout |
| `--fail-on high` | Exit 1 when the risk is HIGH (for pipelines) |
| `--fail-on medium` | Exit 1 when the risk is MEDIUM or HIGH |
| `--ignore <name>` | Skip directories with this name; repeatable |
| `--help`, `--version` | Usage and version |

Exit codes: 0 normally, 1 when `--fail-on` triggers, 2 for a usage error or
a directory that does not exist.

The JSON object: `version`, `scannedFiles`, `durationMs`, `risk`, `usages`,
`stylesheets`, `xmlDocuments`, `migrated`, `needsXslt3`, `msxml` and
`suggestion` (the lines of the suggested migration).

## In a pipeline

```yaml
- run: npx xslt-migrate-check . --fail-on high
```

Once every page is migrated, the step keeps a new `new XSLTProcessor()`
without the one-line script from slipping in.

## Where it lives

`packages/migrate-check` in the repository, published to npm as
`xslt-migrate-check` from the same release tag as `@tradik/xslt-processor`
(`make publish-migrate-check`, see [Development](DEVELOPMENT.md)).
