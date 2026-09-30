# Benchmarks: 1.1.3 vs 1.2.0

How much faster and leaner 1.2.0 is than the released 1.1.3 on the same
inputs, measured with a reproducible benchmark: speed-up per scenario, time
per scenario and peak memory, each chart followed by its data table.

<!-- bench:hero -->
**1.80× faster** on 100 MB text result, string · **1.34×** geometric mean over 10 scenarios · **57% less peak memory** on 100 MB text result, string (1556 MB to 665 MB) · call-template depth 3,000: runs on 1.2.0, error on 1.1.3.
<!-- /bench:hero -->

## Contents

- [Method](#method)
- [Speed-up](#speed-up)
- [Time per scenario](#time-per-scenario)
- [Peak memory](#peak-memory)
- [Scenarios](#scenarios)
- [Notes and caveats](#notes-and-caveats)

## Method

<!-- bench:method -->
- Machine: AMD Ryzen 9 7950X 16-Core Processor, 32 logical cores, 31 GB RAM, Linux 6.18.40.1-microsoft-standard-WSL2 (linux)
- Node.js 25.9.0; DOM: jsdom 30.1.1 (library runs and both CLIs), @xmldom/xmldom 0.9.12 (xmldom CLI row)
- Runs: 2 warm-up + 7 measured per version and scenario, each pair in its own process; a run over 120 s counts as a timeout. Scenarios slower than 10 s per run use 1 warm-up + 3 runs
- Recorded 2026-09-30; the whole run took 6.09 minutes
<!-- /bench:method -->

1.2.0 is the working tree; 1.1.3 is extracted from its git tag
(`git archive v1.1.3`) into the system temporary directory and installed
with `npm ci --ignore-scripts`. Every version and scenario runs in its own
child process, so the versions never share a heap, a JIT or a module cache.
Library scenarios parse the inputs once with jsdom and time
`new XSLTProcessor()` + `importStylesheet()` + `transformToString()` (or
reading `transformToStream()` to the end), with a garbage collection before
each run. CLI scenarios time the whole `xslt in.xml t.xsl -o out.html`
process, start-up included. Peak memory is the process's maximum resident
set size (`process.resourceUsage().maxRSS`), so it includes Node.js, jsdom
and the parsed documents. The inputs are generated deterministically by
[scripts/benchmark/inputs.mjs](../scripts/benchmark/inputs.mjs); nothing is
downloaded.

Reproduce:

```bash
npm ci --ignore-scripts && npm run build
npm run bench                       # writes scripts/benchmark/results.json
node scripts/benchmark/charts.mjs   # redraws docs/benchmarks/*.svg and the tables below
```

`npm run bench -- --runs 3 --only catalog,sort` runs a subset. The charts
and tables on this page are generated from
[scripts/benchmark/results.json](../scripts/benchmark/results.json).

## Speed-up

<!-- bench:speedup -->
<img src="benchmarks/speedup.svg" width="720" alt="1.2.0 is faster than 1.1.3 in 9 of 10 compared scenarios; the largest speed-up is 1.80× (100 MB text result, string).">

| Scenario | 1.1.3 median | 1.2.0 median | Speed-up |
| --- | --- | --- | --- |
| 100 MB text result, string | 7.05 s | 3.91 s | 1.80× |
| following-sibling::x[1], 8,000 | 169 ms | 112 ms | 1.51× |
| xsl:number level="any", 8,000 | 144 ms | 97 ms | 1.48× |
| apply-templates item[@id], 8,000 | 251 ms | 174 ms | 1.45× |
| Identity transform, 5 MB | 2.85 s | 2.11 s | 1.35× |
| call-template depth 900 | 31 ms | 25 ms | 1.27× |
| CLI end to end, jsdom | 4.82 s | 3.80 s | 1.27× |
| Issue #9 catalogue (3 MB HTML) | 3.64 s | 2.88 s | 1.26× |
| Sort 20,000 by two keys | 530 ms | 419 ms | 1.26× |
| Muenchian grouping, 8,000 | 140 ms | 159 ms | 0.88× |
| call-template depth 3,000 | error | 60 ms | n/a |
| 100 MB text result, stream | 1.2.0 only | 3.84 s | n/a |
| CLI end to end, XSLT_DOM=xmldom | 1.2.0 only | 1.42 s | n/a |
| Standalone binary start-up | 1.2.0 only | 24 ms | n/a |
<!-- /bench:speedup -->

## Time per scenario

<!-- bench:time -->
<img src="benchmarks/time.svg" width="720" alt="Median wall time of each scenario for both versions; the slowest is 100 MB text result, string (7.05 s on 1.1.3).">

| Scenario | 1.1.3 median | p95 | min | warm-up + runs | 1.2.0 median | p95 | min | warm-up + runs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Issue #9 catalogue (3 MB HTML) | 3.64 s | 3.67 s | 3.58 s | 2 + 7 | 2.88 s | 2.90 s | 2.82 s | 2 + 7 |
| apply-templates item[@id], 8,000 | 251 ms | 311 ms | 235 ms | 2 + 7 | 174 ms | 179 ms | 169 ms | 2 + 7 |
| Muenchian grouping, 8,000 | 140 ms | 144 ms | 137 ms | 2 + 7 | 159 ms | 170 ms | 154 ms | 2 + 7 |
| xsl:number level="any", 8,000 | 144 ms | 167 ms | 142 ms | 2 + 7 | 97 ms | 103 ms | 93 ms | 2 + 7 |
| following-sibling::x[1], 8,000 | 169 ms | 173 ms | 161 ms | 2 + 7 | 112 ms | 138 ms | 110 ms | 2 + 7 |
| Sort 20,000 by two keys | 530 ms | 544 ms | 525 ms | 2 + 7 | 419 ms | 441 ms | 410 ms | 2 + 7 |
| Identity transform, 5 MB | 2.85 s | 2.90 s | 2.80 s | 2 + 7 | 2.11 s | 2.13 s | 2.06 s | 2 + 7 |
| call-template depth 900 | 31 ms | 33 ms | 28 ms | 2 + 7 | 25 ms | 26 ms | 23 ms | 2 + 7 |
| call-template depth 3,000 | error |  |  |  | 60 ms | 72 ms | 58 ms | 2 + 7 |
| 100 MB text result, string | 7.05 s | 7.22 s | 6.99 s | 2 + 7 | 3.91 s | 3.98 s | 3.85 s | 2 + 7 |
| CLI end to end, jsdom | 4.82 s | 4.93 s | 4.77 s | 2 + 7 | 3.80 s | 3.96 s | 3.77 s | 2 + 7 |
| 100 MB text result, stream | 1.2.0 only |  |  |  | 3.84 s | 3.94 s | 3.81 s | 2 + 7 |
| CLI end to end, XSLT_DOM=xmldom | 1.2.0 only |  |  |  | 1.42 s | 1.43 s | 1.39 s | 2 + 7 |
| Standalone binary start-up | 1.2.0 only |  |  |  | 24 ms | 30 ms | 23 ms | 2 + 7 |
<!-- /bench:time -->

## Peak memory

<!-- bench:memory -->
<img src="benchmarks/memory.svg" width="720" alt="Peak resident set size of the process of each scenario; the largest is 100 MB text result, string (1.1.3: 1556 MB, 1.2.0: 665 MB).">

| Scenario | 1.1.3 peak RSS | 1.2.0 peak RSS | Change |
| --- | --- | --- | --- |
| Issue #9 catalogue (3 MB HTML) | 913 MB | 642 MB | -30% |
| apply-templates item[@id], 8,000 | 290 MB | 280 MB | -3% |
| Muenchian grouping, 8,000 | 262 MB | 268 MB | +2% |
| xsl:number level="any", 8,000 | 281 MB | 232 MB | -17% |
| following-sibling::x[1], 8,000 | 276 MB | 248 MB | -10% |
| Sort 20,000 by two keys | 338 MB | 300 MB | -11% |
| Identity transform, 5 MB | 986 MB | 655 MB | -34% |
| call-template depth 900 | 180 MB | 188 MB | +4% |
| call-template depth 3,000 | error | 218 MB | n/a |
| 100 MB text result, string | 1556 MB | 665 MB | -57% |
| CLI end to end, jsdom | 920 MB | 628 MB | -32% |
| 100 MB text result, stream | 1.2.0 only | 549 MB | n/a |
| CLI end to end, XSLT_DOM=xmldom | 1.2.0 only | 450 MB | n/a |
| Standalone binary start-up | 1.2.0 only | not measured | n/a |
<!-- /bench:memory -->

## Scenarios

| Scenario | What it does |
|---|---|
| Issue #9 catalogue | 10,500 courses grouped by category with keys (Muenchian), sorted by title, labels looked up by key from localised strings, `format-number()`, `(a) or (b)` tests as in [#9](https://github.com/spagu/XSLT-Processor/issues/9); 3 MB of HTML |
| apply-templates | 8,000 items, every second one matched by `match="item[@id]"`, the others by `match="item"` |
| Muenchian grouping | 8,000 items in 200 groups: `generate-id() = generate-id(key(...)[1])`, `count()` and `sum()` over each group |
| `xsl:number level="any"` | 8,000 elements numbered with `count="i[@k='1']"` |
| `following-sibling::x[1]` | A loop over 8,000 siblings reading the next one |
| Sort | 20,000 items by a text key, then a numeric key descending |
| Identity transform | `@*\|node()` copied recursively through a 5 MB document |
| call-template depth | Recursive named template, 900 and 3,000 nested template instantiations (the root template included) |
| 100 MB text result | 100 million characters of `method="text"` output, returned as one string, and in 1.2.0 also read from `transformToStream()` |
| CLI end to end | `xslt in.xml t.xsl -o out.html` on the catalogue, with jsdom; 1.2.0 also with `XSLT_DOM=xmldom` |
| Standalone binary start-up | `xslt --version` with the host's single executable (1.2.0 only; built by `make binaries` when missing). Its memory is not measured: the executable ignores the `--import` hook used to read it |

## Notes and caveats

- **jsdom dominates wall time.** Every DOM access of the engine crosses
  jsdom's wrappers; parsing the inputs is excluded from library runs but not
  from CLI runs. With `XSLT_DOM=xmldom` the same CLI transformation is much
  faster, see the CLI rows.
- **Numbers vary by machine.** Compare factors, not absolute times, and
  rerun `npm run bench` on your own hardware; run-to-run spread is visible
  in the p95 and min columns.
- **What changed in 1.2.0** (see the [CHANGELOG](../CHANGELOG.md#120---unreleased)):
  - Serialization walks the result tree on an explicit stack and writes
    bounded chunks that are joined once (task 0024 and the chunked
    serializer of task 0010): the identity transform, the catalogue and the
    100 MB text result are faster, and the 100 MB result needs well under
    half the peak memory of 1.1.3.
  - `transformToStream()` (task 0010) serializes on demand, so the consumer
    never holds the whole result as one string: the streamed 100 MB row
    peaks lower than the string row of the same version.
  - Templates run from an explicit work stack (task 0005): 3,000 nested
    templates work, where 1.1.3 stops at about 1,000 to 1,400 levels with
    `Template recursion too deep`.
  - Document order is computed once per transformation
    (`DocumentOrderIndex`, task 0007) instead of calling
    `compareDocumentPosition` for each comparison.
  - The CLI can use @xmldom/xmldom (task 0007), which starts faster and
    parses faster than jsdom.
- **Muenchian grouping is the one scenario slower in 1.2.0** (about 0.9×,
  about 20 ms on this machine); the cause has not been profiled yet.
- Most of the large algorithmic fixes (linear template matching, keys,
  `xsl:number`, `axis::x[n]`) already shipped in 1.1.2 and 1.1.3, so both
  versions here are within a small factor of each other on those scenarios;
  the gains of 1.2.0 are in serialization, memory, recursion depth and the
  CLI.
