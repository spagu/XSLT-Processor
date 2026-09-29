# Command Line Tool

The package includes a command-line tool for transforming XML documents:

The command line tool needs a DOM implementation, so install `jsdom` next to
the package. It is an optional peer dependency: library users do not need it.
Without it, `xslt` exits with an explanation instead of a stack trace.

## Examples

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

The output is serialized according to the `xsl:output` element of the
stylesheet (see [Serializing output](API.md#serializing-output-xsloutput)); the
options below override individual `xsl:output` settings.

## Base directory

All file arguments must live inside the current working directory (symbolic
links are resolved first). To work with files elsewhere, run the command from
that directory or point `XSLT_BASE_DIR` at it:

```bash
XSLT_BASE_DIR=/srv/data xslt /srv/data/in.xml /srv/data/t.xsl -o /srv/data/out.html
```

## Includes and document()

`xsl:include`, `xsl:import` and `document()` are resolved relative to the
stylesheet that references them (relative paths, absolute paths and `file:`
URLs). The files they load must stay inside the same base directory; anything
outside it, and any `http:`/`https:` URI, is refused. A stylesheet include that
cannot be loaded stops the run with an error, while a `document()` that cannot
be loaded yields an empty node-set and a one-line warning on stderr.

## Input encodings

Input files (the XML document, the stylesheet, included stylesheets and
`document()` files) are decoded following XML 1.0 Appendix F: a byte order mark
(UTF-8, UTF-16LE, UTF-16BE) wins, then the `encoding` of the XML declaration,
otherwise UTF-8. Any WHATWG encoding label is accepted, e.g. `ISO-8859-1`,
`windows-1252`, `ISO-8859-2`, `Shift_JIS`; an unknown label is reported as an
error.

## Output

The result is written to stdout byte for byte, exactly as with `-o`; only when
stdout is an interactive terminal is a final newline added if missing.

## CLI Options

| Option | Description |
|--------|-------------|
| `-o, --output <file>` | Write output to file instead of stdout |
| `-p, --param <n>=<v>` | Set XSLT parameter (can be used multiple times) |
| `-f, --format` | Format output with indentation (same as `--indent`) |
| `--indent` | Override `xsl:output` to `indent="yes"` |
| `--method <m>` | Override the `xsl:output` method (`xml`, `html`, `xhtml`, `text`) |
| `--no-declaration` | Override `xsl:output` to omit the XML declaration |
| `-h, --help` | Show help message |
| `-v, --version` | Show version number |

A complete example is in [Complete Example](EXAMPLES.md).
