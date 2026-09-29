# XSLT 1.0 conformance suite

This suite runs the processor against the regression tests of
[libxslt](https://gitlab.gnome.org/GNOME/libxslt), the XSLT engine used by
Chrome, Safari and `xsltproc`, and compares the results with libxslt's
expected outputs.

## Corpus

- Source: the `tests/` tree of the libxslt **1.1.45** release tarball
  (`download.gnome.org`), pinned by SHA-256 in `scripts/fetch-conformance.mjs`.
- Licence: MIT (the `Copyright` file is extracted alongside the tests). The
  corpus is downloaded on demand into `tests/conformance/corpus/`, which is
  git-ignored. It is not committed and not published to npm.
- Directories: `REC`, `REC2`, `general`, `keys`, `numbers`, `namespaces`,
  `documents`, `encoding`, `reports`. The EXSLT, extension, plugin, XInclude
  and DocBook directories are not part of plain XSLT 1.0 and are left out.

## Running

```sh
npm run test:conformance                     # fetch corpus if needed, run, compare with the baseline
npm run test:conformance -- --filter bug-12  # only the case ids that contain "bug-12"
npm run test:conformance -- --update-baseline
npm run test:conformance:unit                # unit tests of the runner itself
```

Each case runs in a worker thread with a 10 second limit (`--timeout <ms>`).
libxslt's runtest passes the parameters `test='passed_value'` and
`test2='passed_value2'`, and so does the runner.

## Files

| File | Committed | Content |
|---|---|---|
| `baseline.json` | yes | Known failing case ids. The run fails only on failures outside this list. |
| `exclusions.json` | yes | Cases whose expected output is implementation-defined, needs a libxslt/EXSLT extension, or needs DTD processing the jsdom parser lacks. They are reported as `skip` and left out of the pass rate. |
| `report.json`, `report.md` | no | Results of the last run, per category (REC cases per chapter of the XSLT 1.0 Recommendation). |

## Comparison rules

The output is compared after these normalisations, and nothing else:

- CR LF becomes LF, and trailing whitespace at the end of the output is dropped;
- the XML declaration is rebuilt (a missing encoding means UTF-8, and labels
  are compared ignoring case); an output that is only a declaration counts as empty;
- attributes and namespace declarations of each start tag are sorted;
- `<meta http-equiv="Content-Type" content="...; charset=X">` equals `<meta charset="X">`;
- for indented output (`indent="yes"`, or the HTML method), whitespace-only
  runs between two tags are dropped.

A case with no `.out` file expects an empty result, or a rejection when its
`.err` file reports an error. The text of libxslt's messages is not compared.

## Updating the baseline

When a fix makes baseline cases pass, the run lists them as "newly passing".
Run `npm run test:conformance -- --update-baseline` and commit the smaller
`baseline.json`. To move to a newer libxslt release, update the version and
SHA-256 in `scripts/fetch-conformance.mjs`, run with `--update-baseline` and
review the difference.
