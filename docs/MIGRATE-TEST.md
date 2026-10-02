# Migration Test

`xslt-migrate-test` is the proof before the switch. It finds the XML + XSLT
pairs of a project, transforms each one with a reference engine (the
browser's own XSLT, or libxslt) and with `@tradik/xslt-processor`, compares
the two outputs and reports how many match. It ships in the
`xslt-migrate-check` package next to the [checker](MIGRATE-CHECK.md).

```sh
npx -p xslt-migrate-check -p @tradik/xslt-processor -p jsdom xslt-migrate-test .
```

The library and jsdom are optional peer dependencies: the checker itself
stays dependency-free. In a project that already has them installed,
`npx xslt-migrate-test .` is enough; without them the command prints the
line above and exits 2. With `@tradik/xslt3` installed, the library runs in
`xsltVersion: "auto"` mode and XSLT 2.0/3.0 stylesheets are tested too.

## Output

```text
Reference engine: xsltproc (libxslt 10145)

47 transformations tested

MATCH:             44
DIFFERENT OUTPUT:   2
ERROR:              1

Compatibility: 93.6%

invoice.xsl
  Input:     public/invoice.xml
  Expected:  <total>123.00</total>
  Tradik:    <total>123</total>
  At:        /html/body/p/total/text()
```

Every transformation is one of:

| Result               | Meaning                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------- |
| **MATCH**            | Both engines produced the same output                                                       |
| **DIFFERENT OUTPUT** | The XPath of the first differing node, and both sides of it (at most three lines each)      |
| **ERROR**            | One engine failed: which one, and its message                                               |
| **SKIPPED**          | Nothing to compare: the stylesheet is a URL or missing, or no reference engine is available |

Compatibility is MATCH / (tested − SKIPPED), with one decimal; `n/a` when
nothing was compared. A block follows for every result that is not a MATCH;
`--diff full` replaces the first difference with a unified diff of the two
outputs.

## The pairs

- **`<?xml-stylesheet?>` documents** of the project (`.xml`, `.rss`, `.atom`,
  `.rdf`) with the stylesheet their `href` names, also after the migration
  (the loader line does not change what the stylesheet sees).
- **`--pairs pairs.json`**: `[{ "xml": "a.xml", "xsl": "a.xsl", "params": { "lang": "en" } }]`,
  paths relative to the directory argument.
- **`--xml a.xml --xsl a.xsl`**: one pair.

`--param name=value` (repeatable) passes a top-level parameter to every
pair; a list entry's own `params` win.

## Reference engines

In this order, and the report names the one used:

1. **Chromium** through Playwright, when `@playwright/test` or `playwright`
   is installed in the project (or `--browser`). The project is served from
   a private origin, so `xsl:include` and `document()` resolve as on the
   site, and Chromium starts with `--enable-blink-features=XSLT`, so this
   keeps working after Chrome 158 turns XSLT off by default. Needs
   `npx playwright install chromium`.
2. **xsltproc** (libxslt, the engine inside Chrome) when it is on `PATH`,
   with `--stringparam` for the parameters.
3. **None**: a smoke test. The library runs alone and only its errors are
   reported; every other pair is SKIPPED.

`--reference browser|xsltproc|none` forces one and exits 2 when it is not
available; `--browser` is `--reference browser`. When Chromium is found but
does not start, the automatic choice falls back to xsltproc with a note on
stderr. xsltproc implements XSLT 1.0 only, so XSLT 2.0/3.0 stylesheets show
as ERROR against it.

## What counts as a difference

Both outputs are parsed with the same parser and compared as trees: XML
output with the XML parser (wrapped, since a result may be a fragment),
HTML output with jsdom's HTML parser, text output line by line. Not
differences:

- attribute order, the XML declaration, a doctype;
- whitespace-only text between elements (indentation) and trailing
  whitespace;
- the `<meta http-equiv="Content-Type">` or `<meta charset>` element that
  libxml2 and other serializers add to HTML output.

Text content, element and attribute names, namespaces, attribute values,
comments and processing instructions are compared exactly. The output
method comes from `xsl:output`, else HTML when the result starts with
`<html>`.

## Options

| Option                      | Effect                                            |
| --------------------------- | ------------------------------------------------- |
| `[dir]`                     | Project directory (default: the current one)      |
| `--pairs <file.json>`       | Run the listed pairs instead of discovering them  |
| `--xml <file> --xsl <file>` | Run one pair                                      |
| `--param <name=value>`      | Stylesheet parameter, repeatable                  |
| `--reference <engine>`      | `auto` (default), `browser`, `xsltproc` or `none` |
| `--browser`                 | Same as `--reference browser`                     |
| `--diff full`               | Unified diff instead of the first difference      |
| `--json`                    | JSON: counts, `compatibility`, and every result   |
| `--html [file]`             | Also write `xslt-migration-test.html`             |
| `--fail-under <pct>`        | Exit 1 when the compatibility is below `pct`      |
| `--ignore <name>`           | Skip directories with this name while discovering |
| `--help`, `--version`       | Usage and version                                 |

Exit codes: 0, or 1 below `--fail-under` (nothing compared counts as 0%);
2 for a bad command line, a missing library or jsdom, an unavailable forced
reference engine, a bad pairs file or an HTML file that cannot be written.

The HTML report uses the checker's page style: the counts, the
compatibility, and one table row per transformation with its result.

## In a pipeline

```yaml
- run: sudo apt-get install -y xsltproc
- run: npx -p xslt-migrate-check -p @tradik/xslt-processor -p jsdom xslt-migrate-test . --reference xsltproc --fail-under 95
```

## Where it lives

`packages/migrate-check/src/compat/` in the repository: `pairs.js`
(discovery), `compare.js` and `nodes.js` (the tree comparison), `report.js`
and `html.js`, `engines/` (Tradik, xsltproc, Chromium) and `cli.js`. The
Chromium test runs only with `MIGRATE_TEST_BROWSER=1`; the xsltproc test is
skipped when xsltproc is not installed.
