# Benchmarks

How fast each release of @tradik/xslt-processor is, and how the XSLT 3.0
engine @tradik/xslt3 compares, on the same stylesheets and the same
machine. Start with [All versions](#all-versions): one chart and one table
with every version. The sections after it are the detailed runs those
numbers come from.

## Contents

- [All versions](#all-versions): 1.1.3, 1.2.0, 1.3.0 and @tradik/xslt3 side by side
- [1.1.3 vs 1.2.0](#113-vs-120): the 1.2.0 release run, including CLI, streaming and the standalone binary
- [XPath 1.0 vs XPath 3.1](#xpath-10-vs-xpath-31): the 1.0 package against @tradik/xslt3
- [XSLT 1.0 vs XSLT 3.0 engines](#xslt-10-vs-xslt-30-engines): the 1.0 package against @tradik/xslt3 on the same stylesheets, idiomatic 2.0/3.0 rewrites, 3.0-only scenarios, start-up and bundle size

## All versions

<!-- bench:overview-hero -->
Against 1.1.3, on the same 9 XSLT 1.0 stylesheets (geometric mean): 1.2.0 **1.40× faster** · 1.3.0 **1.49× faster** · xslt3 1.0.0 **2.89× faster**.
<!-- /bench:overview-hero -->

Every version runs the same XSLT 1.0 stylesheets on jsdom. Lower is
faster; the fastest version of each row is in bold. 1.2.1 changed no
library code, so 1.2.0 stands for both.

<!-- bench:overview -->
<img src="benchmarks/overview.svg" width="720" alt="Median time of 9 XSLT 1.0 scenarios on 1.1.3, 1.2.0, 1.3.0, xslt3 1.0.0; further left is faster.">

| Scenario | 1.1.3 | 1.2.0 | 1.3.0 | xslt3 1.0.0 |
| --- | --- | --- | --- | --- |
| 100 MB text result | 7.14 s | 3.94 s | 3.93 s | **824 ms** |
| Issue #9 catalogue (3 MB HTML) | 3.73 s | 2.83 s | 2.68 s | **2.67 s** |
| Identity transform, 5 MB | 2.88 s | 2.13 s | 2.10 s | **2.02 s** |
| Sort 20,000 by two keys | 548 ms | 407 ms | 411 ms | **166 ms** |
| apply-templates item[@id], 8,000 | 240 ms | 178 ms | 157 ms | **103 ms** |
| following-sibling::x[1], 8,000 | 168 ms | 113 ms | 106 ms | **23 ms** |
| Muenchian grouping, 8,000 | 157 ms | 144 ms | **134 ms** | 138 ms |
| xsl:number level="any", 8,000 | 153 ms | 96 ms | 83 ms | **34 ms** |
| call-template depth 3,000 | error | 62 ms | 58 ms | **15 ms** |
| Speed vs 1.1.3 (geometric mean) | 1.00× | 1.40× | 1.49× | 2.89× |
<!-- /bench:overview -->

Peak memory (maximum resident set size of the process, including Node.js,
jsdom and the parsed documents):

<!-- bench:overview-memory -->
| Scenario | 1.1.3 | 1.2.0 | 1.3.0 | xslt3 1.0.0 |
| --- | --- | --- | --- | --- |
| 100 MB text result | 1557 MB | 650 MB | 659 MB | 287 MB |
| Issue #9 catalogue (3 MB HTML) | 922 MB | 636 MB | 661 MB | 614 MB |
| Identity transform, 5 MB | 993 MB | 658 MB | 666 MB | 702 MB |
| Sort 20,000 by two keys | 326 MB | 307 MB | 308 MB | 292 MB |
| apply-templates item[@id], 8,000 | 297 MB | 277 MB | 278 MB | 260 MB |
| following-sibling::x[1], 8,000 | 279 MB | 260 MB | 258 MB | 208 MB |
| Muenchian grouping, 8,000 | 267 MB | 264 MB | 262 MB | 282 MB |
| xsl:number level="any", 8,000 | 269 MB | 239 MB | 230 MB | 243 MB |
| call-template depth 3,000 | error | 217 MB | 215 MB | 192 MB |
<!-- /bench:overview-memory -->

The numbers come from two runs on the same machine, Node.js and jsdom:
1.1.3 and 1.2.0 from the [1.1.3 vs 1.2.0](#113-vs-120) run (30 September
2026), 1.3.0 and @tradik/xslt3 from the
[XSLT engines](#xslt-10-vs-xslt-30-engines) run (2 October 2026). The first
times stylesheet import and transformation together; for the second the
table adds its compile and transform medians. Differences of a few percent
between the two runs are noise, not a change.

## 1.1.3 vs 1.2.0

How much faster and leaner 1.2.0 is than the released 1.1.3 on the same
inputs: speed-up per scenario, time per scenario and peak memory, each
chart followed by its data table.

<!-- bench:hero -->
**1.81× faster** on 100 MB text result, string · **1.39×** geometric mean over 10 scenarios · **58% less peak memory** on 100 MB text result, string (1557 MB to 650 MB) · call-template depth 3,000: runs on 1.2.0, error on 1.1.3.
<!-- /bench:hero -->

### Method

<!-- bench:method -->
- Machine: AMD Ryzen 9 7950X 16-Core Processor, 32 logical cores, 31 GB RAM, Linux 6.18.40.1-microsoft-standard-WSL2 (linux)
- Node.js 25.9.0; DOM: jsdom 30.1.1 (library runs and both CLIs), @xmldom/xmldom 0.9.12 (xmldom CLI row)
- Runs: 2 warm-up + 7 measured per version and scenario, each pair in its own process; a run over 120 s counts as a timeout. Scenarios slower than 10 s per run use 1 warm-up + 3 runs
- Recorded 2026-09-30; the whole run took 6.2 minutes
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

### Speed-up

<!-- bench:speedup -->
<img src="benchmarks/speedup.svg" width="720" alt="1.2.0 is faster than 1.1.3 in 10 of 10 compared scenarios; the largest speed-up is 1.81× (100 MB text result, string).">

| Scenario | 1.1.3 median | 1.2.0 median | Speed-up |
| --- | --- | --- | --- |
| 100 MB text result, string | 7.14 s | 3.94 s | 1.81× |
| xsl:number level="any", 8,000 | 153 ms | 96 ms | 1.59× |
| following-sibling::x[1], 8,000 | 168 ms | 113 ms | 1.50× |
| Identity transform, 5 MB | 2.88 s | 2.13 s | 1.35× |
| apply-templates item[@id], 8,000 | 240 ms | 178 ms | 1.35× |
| Sort 20,000 by two keys | 548 ms | 407 ms | 1.34× |
| Issue #9 catalogue (3 MB HTML) | 3.73 s | 2.83 s | 1.32× |
| CLI end to end, jsdom | 4.86 s | 3.70 s | 1.31× |
| call-template depth 900 | 31 ms | 24 ms | 1.30× |
| Muenchian grouping, 8,000 | 157 ms | 144 ms | 1.09× |
| call-template depth 3,000 | error | 62 ms | n/a |
| 100 MB text result, stream | 1.2.0 only | 3.89 s | n/a |
| CLI end to end, XSLT_DOM=xmldom | 1.2.0 only | 1.42 s | n/a |
| Standalone binary start-up | 1.2.0 only | 28 ms | n/a |
<!-- /bench:speedup -->

### Time per scenario

<!-- bench:time -->
<img src="benchmarks/time.svg" width="720" alt="Median wall time of each scenario for both versions; the slowest is 100 MB text result, string (7.14 s on 1.1.3).">

| Scenario | 1.1.3 median | p95 | min | warm-up + runs | 1.2.0 median | p95 | min | warm-up + runs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Issue #9 catalogue (3 MB HTML) | 3.73 s | 3.84 s | 3.67 s | 2 + 7 | 2.83 s | 2.88 s | 2.79 s | 2 + 7 |
| apply-templates item[@id], 8,000 | 240 ms | 253 ms | 227 ms | 2 + 7 | 178 ms | 181 ms | 163 ms | 2 + 7 |
| Muenchian grouping, 8,000 | 157 ms | 179 ms | 149 ms | 2 + 7 | 144 ms | 157 ms | 139 ms | 2 + 7 |
| xsl:number level="any", 8,000 | 153 ms | 178 ms | 147 ms | 2 + 7 | 96 ms | 99 ms | 90 ms | 2 + 7 |
| following-sibling::x[1], 8,000 | 168 ms | 173 ms | 159 ms | 2 + 7 | 113 ms | 115 ms | 104 ms | 2 + 7 |
| Sort 20,000 by two keys | 548 ms | 577 ms | 531 ms | 2 + 7 | 407 ms | 432 ms | 401 ms | 2 + 7 |
| Identity transform, 5 MB | 2.88 s | 2.92 s | 2.78 s | 2 + 7 | 2.13 s | 2.17 s | 2.08 s | 2 + 7 |
| call-template depth 900 | 31 ms | 33 ms | 28 ms | 2 + 7 | 24 ms | 25 ms | 23 ms | 2 + 7 |
| call-template depth 3,000 | error |  |  |  | 62 ms | 77 ms | 60 ms | 2 + 7 |
| 100 MB text result, string | 7.14 s | 7.20 s | 7.02 s | 2 + 7 | 3.94 s | 3.96 s | 3.88 s | 2 + 7 |
| CLI end to end, jsdom | 4.86 s | 4.89 s | 4.82 s | 2 + 7 | 3.70 s | 3.73 s | 3.65 s | 2 + 7 |
| 100 MB text result, stream | 1.2.0 only |  |  |  | 3.89 s | 3.95 s | 3.82 s | 2 + 7 |
| CLI end to end, XSLT_DOM=xmldom | 1.2.0 only |  |  |  | 1.42 s | 1.43 s | 1.41 s | 2 + 7 |
| Standalone binary start-up | 1.2.0 only |  |  |  | 28 ms | 30 ms | 25 ms | 2 + 7 |
<!-- /bench:time -->

### Peak memory

<!-- bench:memory -->
<img src="benchmarks/memory.svg" width="720" alt="Peak resident set size of the process of each scenario; the largest is 100 MB text result, string (1.1.3: 1557 MB, 1.2.0: 650 MB).">

| Scenario | 1.1.3 peak RSS | 1.2.0 peak RSS | Change |
| --- | --- | --- | --- |
| Issue #9 catalogue (3 MB HTML) | 922 MB | 636 MB | -31% |
| apply-templates item[@id], 8,000 | 297 MB | 277 MB | -7% |
| Muenchian grouping, 8,000 | 267 MB | 264 MB | -1% |
| xsl:number level="any", 8,000 | 269 MB | 239 MB | -11% |
| following-sibling::x[1], 8,000 | 279 MB | 260 MB | -7% |
| Sort 20,000 by two keys | 326 MB | 307 MB | -6% |
| Identity transform, 5 MB | 993 MB | 658 MB | -34% |
| call-template depth 900 | 181 MB | 185 MB | +2% |
| call-template depth 3,000 | error | 217 MB | n/a |
| 100 MB text result, string | 1557 MB | 650 MB | -58% |
| CLI end to end, jsdom | 921 MB | 627 MB | -32% |
| 100 MB text result, stream | 1.2.0 only | 550 MB | n/a |
| CLI end to end, XSLT_DOM=xmldom | 1.2.0 only | 453 MB | n/a |
| Standalone binary start-up | 1.2.0 only | not measured | n/a |
<!-- /bench:memory -->

### Scenarios

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

### Notes and caveats

- **jsdom dominates wall time.** Every DOM access of the engine crosses
  jsdom's wrappers; parsing the inputs is excluded from library runs but not
  from CLI runs. With `XSLT_DOM=xmldom` the same CLI transformation is much
  faster, see the CLI rows.
- **Numbers vary by machine.** Compare factors, not absolute times, and
  rerun `npm run bench` on your own hardware; run-to-run spread is visible
  in the p95 and min columns.
- **What changed in 1.2.0** (see the [CHANGELOG](../CHANGELOG.md#120---2026-09-30)):
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
    parses faster than jsdom. jsdom stays the default because it expands
    entities declared in an internal DTD subset and xmldom does not.
  - Sorting nodes in document order no longer reads every attribute's index
    in its element, and name tests read the document's content type only
    when it matters. Before that fix Muenchian grouping was the one scenario
    slower than 1.1.3 (about 0.88×); it is now faster too.
- Most of the large algorithmic fixes (linear template matching, keys,
  `xsl:number`, `axis::x[n]`) already shipped in 1.1.2 and 1.1.3, so both
  versions here are within a small factor of each other on those scenarios;
  the gains of 1.2.0 are in serialization, memory, recursion depth and the
  CLI.

## XPath 1.0 vs XPath 3.1

XPath 1.0 of this package (`src/`, `parseXPath()` / `evaluateXPath()`)
against XPath 3.1 of [@tradik/xslt3](XSLT3.md) (`packages/xslt3`,
`compileXPath()` / `evaluateXPath()`), on the same
expressions over the same DOM.

<!-- bench:xpath-hero -->
On jsdom, xslt3 is **3.21× faster** than the 1.0 package (geometric mean of the time ratio over 11 scenarios; from 0.17× the time on (//item)[1000] to 0.67× on ancestor::* from 1,000 deep nodes) · on xmldom, xslt3 is **2.65× faster** than the 1.0 package (geometric mean of the time ratio over 11 scenarios; from 0.18× the time on //item to 0.83× on translate/concat/substring × 20,000).
<!-- /bench:xpath-hero -->

### XPath method

<!-- bench:xpath-method -->
- Machine: AMD Ryzen 9 7950X 16-Core Processor, 32 logical cores, 31 GB RAM, Linux 6.18.40.1-microsoft-standard-WSL2 (linux)
- Node.js 25.9.0; DOM: jsdom 30.1.1, @xmldom/xmldom 0.9.12
- Engines: 1.0 package 1.3.0 (`src/index.js`), xslt3 1.0.0 (`packages/xslt3/src/index.js`)
- Runs: 2 warm-up + 7 measured per phase (compiled, then one-shot), each scenario, DOM and engine in its own process; a run over 120 s counts as a timeout. Phases slower than 10 s per run use 1 warm-up + 3 runs
- Recorded 2026-10-02; the whole run took 2.66 minutes
<!-- /bench:xpath-method -->

The document is generated by
[scripts/benchmark/xpathScenarios.mjs](../scripts/benchmark/xpathScenarios.mjs):
20,000 `item` elements (an `id`, a category, a price from 0.00 to 99.99
and a `name`; an `a` child in every second item, a `b` child in every
third, a chain of 12 nested elements in every 20th), about 2.4 MB, parsed
once per process with jsdom or @xmldom/xmldom (not timed). Each scenario
is measured twice:

- **compiled**: the expression is compiled once (`parseXPath()` in the
  1.0 package, `compileXPath()` in xslt3), then each run evaluates it
  (a new `XPathEvaluator` and `XPathContext` per evaluation in the 1.0
  package, as `evaluateXPath()` does; `compiled.evaluate(node)` in
  xslt3). Neither engine keeps state between evaluations, so each builds
  its own document order index;
- **one-shot**: each run calls `evaluateXPath(expression, node)`, which
  parses and evaluates.

Scenarios marked × 20,000 or "from 1,000 deep nodes" evaluate the
expression once per element in a JavaScript loop, so they also measure
the per-call cost. The 1.0 package caps a node-set at 10,000 nodes by
default (`XPathLimits.MAX_RESULT_SIZE`, a guard for untrusted
expressions) and `evaluateXPath()` takes no option for it, so the
benchmark raises the exported limit to the XSLT engine's 5,000,000. Peak
memory is the process's maximum resident set size, so it includes Node.js,
the DOM and the parsed document; one process runs both phases.

Reproduce:

```bash
npm ci --ignore-scripts
npm run bench -- --suite xpath                # writes scripts/benchmark/results-xpath.json
node scripts/benchmark/charts.mjs --suite xpath   # redraws docs/benchmarks/xpath-*.svg and the tables below
```

`npm run bench -- --suite xpath --dom jsdom --runs 3 --only sum,union`
runs a subset. Before measuring, a pre-check evaluates every scenario once
per engine and DOM and stops the run when the engines disagree (item count
and a hash of every item, nodes by name and `id`, numbers by value), or
when an XPath 3.1-only expression fails; `--allow-mismatch` measures anyway
and records the differences.

#### Pre-check

<!-- bench:xpath-check -->
Both engines returned the same result (item count and a hash of every item) for every shared scenario on every DOM, and every xslt3-only expression evaluated without an error.
<!-- /bench:xpath-check -->

### XPath time ratio

<!-- bench:xpath-ratio -->
<img src="benchmarks/xpath-ratio.svg" width="720" alt="On jsdom, xslt3 is 1.49× faster than the 1.0 package on ancestor::* from 1,000 deep nodes, its largest time ratio (0.67×), and 5.90× faster on (//item)[1000] (0.17×); the dashed line marks equal speed.">

| Scenario | Expression | jsdom | jsdom one-shot | xmldom | xmldom one-shot |
| --- | --- | --- | --- | --- | --- |
| ancestor::* from 1,000 deep nodes | `ancestor::*` | 0.67× | 0.49× | 0.55× | 0.43× |
| translate/concat/substring × 20,000 | `concat(translate(name, 'abcdef', 'ABCDEF'), '-', substring(@id, 2, 3))` | 0.59× | 0.42× | 0.83× | 0.51× |
| //a \| //b | `//a \| //b` | 0.39× | 0.41× | 0.43× | 0.43× |
| //item[last()] | `//item[last()]` | 0.36× | 0.34× | 0.44× | 0.48× |
| following-sibling::item[1] × 20,000 | `following-sibling::item[1]` | 0.30× | 0.31× | 0.36× | 0.28× |
| //item[contains(name, 'abc')] | `//item[contains(name, 'abc')]` | 0.29× | 0.28× | 0.37× | 0.35× |
| count(//item[@price > 50]) | `count(//item[@price > 50])` | 0.27× | 0.26× | 0.36× | 0.35× |
| sum(//item/@price) | `sum(//item/@price)` | 0.26× | 0.28× | 0.39× | 0.33× |
| //item[@id = 'i10000'] | `//item[@id = 'i10000']` | 0.25× | 0.26× | 0.41× | 0.40× |
| //item | `//item` | 0.18× | 0.19× | 0.18× | 0.17× |
| (//item)[1000] | `(//item)[1000]` | 0.17× | 0.17× | 0.18× | 0.18× |
<!-- /bench:xpath-ratio -->

### XPath time on jsdom

<!-- bench:xpath-time-jsdom -->
<img src="benchmarks/xpath-time-jsdom.svg" width="720" alt="Median time of each compiled expression on jsdom: xslt3 (XPath 3.1) is slower than the 1.0 package (XPath 1.0) in 0 of 11 scenarios.">

| Scenario | 1.0 package | xslt3 | xslt3 ÷ 1.0 | 1.0 one-shot | xslt3 one-shot | xslt3 ÷ 1.0 one-shot |
| --- | --- | --- | --- | --- | --- | --- |
| //item | 123 ms | 23 ms | 0.18× | 116 ms | 23 ms | 0.19× |
| //item[@id = 'i10000'] | 154 ms | 39 ms | 0.25× | 154 ms | 40 ms | 0.26× |
| //item[last()] | 82 ms | 29 ms | 0.36× | 85 ms | 29 ms | 0.34× |
| (//item)[1000] | 132 ms | 22 ms | 0.17× | 129 ms | 22 ms | 0.17× |
| count(//item[@price > 50]) | 190 ms | 51 ms | 0.27× | 191 ms | 50 ms | 0.26× |
| sum(//item/@price) | 208 ms | 54 ms | 0.26× | 205 ms | 57 ms | 0.28× |
| //item[contains(name, 'abc')] | 178 ms | 52 ms | 0.29× | 179 ms | 50 ms | 0.28× |
| //a \| //b | 204 ms | 79 ms | 0.39× | 202 ms | 83 ms | 0.41× |
| following-sibling::item[1] × 20,000 | 68 ms | 21 ms | 0.30× | 106 ms | 33 ms | 0.31× |
| ancestor::* from 1,000 deep nodes | 11 ms | 7.2 ms | 0.67× | 17 ms | 8.2 ms | 0.49× |
| translate/concat/substring × 20,000 | 188 ms | 111 ms | 0.59× | 281 ms | 117 ms | 0.42× |
<!-- /bench:xpath-time-jsdom -->

### XPath time on xmldom

<!-- bench:xpath-time-xmldom -->
<img src="benchmarks/xpath-time-xmldom.svg" width="720" alt="Median time of each compiled expression on xmldom: xslt3 (XPath 3.1) is slower than the 1.0 package (XPath 1.0) in 0 of 11 scenarios.">

| Scenario | 1.0 package | xslt3 | xslt3 ÷ 1.0 | 1.0 one-shot | xslt3 one-shot | xslt3 ÷ 1.0 one-shot |
| --- | --- | --- | --- | --- | --- | --- |
| //item | 74 ms | 13 ms | 0.18× | 73 ms | 13 ms | 0.17× |
| //item[@id = 'i10000'] | 61 ms | 25 ms | 0.41× | 61 ms | 24 ms | 0.40× |
| //item[last()] | 44 ms | 20 ms | 0.44× | 41 ms | 20 ms | 0.48× |
| (//item)[1000] | 69 ms | 13 ms | 0.18× | 76 ms | 14 ms | 0.18× |
| count(//item[@price > 50]) | 94 ms | 33 ms | 0.36× | 92 ms | 32 ms | 0.35× |
| sum(//item/@price) | 95 ms | 38 ms | 0.39× | 98 ms | 32 ms | 0.33× |
| //item[contains(name, 'abc')] | 87 ms | 32 ms | 0.37× | 87 ms | 30 ms | 0.35× |
| //a \| //b | 113 ms | 48 ms | 0.43× | 113 ms | 48 ms | 0.43× |
| following-sibling::item[1] × 20,000 | 52 ms | 19 ms | 0.36× | 95 ms | 27 ms | 0.28× |
| ancestor::* from 1,000 deep nodes | 9.0 ms | 4.9 ms | 0.55× | 13 ms | 5.7 ms | 0.43× |
| translate/concat/substring × 20,000 | 99 ms | 83 ms | 0.83× | 183 ms | 93 ms | 0.51× |
<!-- /bench:xpath-time-xmldom -->

### XPath 3.1-only expressions

What XPath 1.0 cannot express at all, on xslt3 alone.

<!-- bench:xpath-only31 -->
<img src="benchmarks/xpath-only31.svg" width="720" alt="Median time of the compiled XPath 3.1 expressions that XPath 1.0 cannot express; the slowest is distinct-values grouping + sum (652 ms on jsdom).">

| Scenario | Expression | jsdom | jsdom one-shot | xmldom | xmldom one-shot |
| --- | --- | --- | --- | --- | --- |
| for + let over //item | `for $x in //item return let $p := number($x/@price) return if ($p > 50) then string($x/@id) else ()` | 64 ms | 65 ms | 47 ms | 43 ms |
| distinct-values grouping + sum | `for $c in distinct-values(//item/@cat) return sum(//item[@cat = $c]/@price)` | 652 ms | 704 ms | 564 ms | 574 ms |
| sort() with a key function | `sort(//item, (), function($i) { number($i/@price) })` | 78 ms | 80 ms | 64 ms | 65 ms |
| map:merge of 20,000 maps | `map:merge(//item ! map { string(@id): number(@price) })` | 77 ms | 74 ms | 50 ms | 49 ms |
| string-join(//item/@id) | `string-join(//item/@id, ',')` | 45 ms | 46 ms | 30 ms | 27 ms |
| //item[matches(name, ...)] | `//item[matches(name, '^[a-c]{3}')]` | 54 ms | 53 ms | 31 ms | 32 ms |
| tokenize(string-join(//name)) | `tokenize(string-join(//name, ' '), '\s+')` | 39 ms | 38 ms | 28 ms | 26 ms |
| format-number × 20,000 | `//item ! format-number(number(@price), '#,##0.00')` | 119 ms | 125 ms | 97 ms | 95 ms |
| fold-left sum of //item/@price | `fold-left(//item/@price, 0, function($a, $b) { $a + $b })` | 61 ms | 61 ms | 38 ms | 36 ms |
<!-- /bench:xpath-only31 -->

### XPath peak memory

<!-- bench:xpath-memory -->
| Scenario | 1.0 package, jsdom | xslt3, jsdom | 1.0 package, xmldom | xslt3, xmldom |
| --- | --- | --- | --- | --- |
| //item | 364 MB | 312 MB | 279 MB | 263 MB |
| //item[@id = 'i10000'] | 347 MB | 309 MB | 236 MB | 265 MB |
| //item[last()] | 347 MB | 320 MB | 273 MB | 264 MB |
| (//item)[1000] | 356 MB | 305 MB | 281 MB | 264 MB |
| count(//item[@price > 50]) | 353 MB | 308 MB | 241 MB | 266 MB |
| sum(//item/@price) | 363 MB | 317 MB | 247 MB | 266 MB |
| //item[contains(name, 'abc')] | 352 MB | 312 MB | 245 MB | 264 MB |
| //a \| //b | 360 MB | 322 MB | 272 MB | 270 MB |
| following-sibling::item[1] × 20,000 | 343 MB | 322 MB | 284 MB | 280 MB |
| ancestor::* from 1,000 deep nodes | 341 MB | 309 MB | 251 MB | 278 MB |
| translate/concat/substring × 20,000 | 361 MB | 335 MB | 292 MB | 287 MB |
| for + let over //item | n/a | 334 MB | n/a | 283 MB |
| distinct-values grouping + sum | n/a | 339 MB | n/a | 286 MB |
| sort() with a key function | n/a | 308 MB | n/a | 266 MB |
| map:merge of 20,000 maps | n/a | 332 MB | n/a | 276 MB |
| string-join(//item/@id) | n/a | 309 MB | n/a | 265 MB |
| //item[matches(name, ...)] | n/a | 310 MB | n/a | 265 MB |
| tokenize(string-join(//name)) | n/a | 311 MB | n/a | 264 MB |
| format-number × 20,000 | n/a | 328 MB | n/a | 285 MB |
| fold-left sum of //item/@price | n/a | 319 MB | n/a | 266 MB |
<!-- /bench:xpath-memory -->

### XPath notes

- **On jsdom the engines are close; xslt3 is slower on most single
  expressions.** Both spend most of their time walking jsdom's wrappers.
  A CPU profile of xslt3 shows two costs the 1.0 package avoids:
  `childrenOf()` iterates `node.childNodes`, and in jsdom every indexed
  `childNodes` access goes through a Proxy (the 1.0 package walks
  `firstChild` / `nextSibling` for exactly this reason, see
  `src/xpath/axes.js`); and `//a | //b` and `//item[last()]` number the
  whole tree, attributes included, for document order on every evaluation
  (`DocumentOrder.index()`, 16% of the union's profile). Typed atomic
  values (each untyped `@price` cast to `xs:double`, `count()` as an
  `xs:integer` BigInt) did not show up as a major cost in the profiles of
  `count(//item[@price > 50])` and `//item[last()]`: the tree walk does.
- **xslt3 is faster on per-node loops.** Its compiled evaluation of
  `following-sibling::item[1]` and `ancestor::*` costs less per call than
  a new `XPathEvaluator` and `XPathContext`; one-shot it is slower,
  because parsing an XPath 3.1 expression (a much larger grammar) costs
  more: `translate/concat/substring` compiled 20,000 times takes about
  twice as long as in the 1.0 package. Compile once and reuse the
  expression.
- **On xmldom the 1.0 package's standalone XPath API used to be the
  outlier.** Before 1.3.0 every expression that returned or sorted a large
  node-set (`//item`, `(//item)[1000]`, `sum(//item/@price)`, `//a | //b`)
  took 7 to 33 s there, because `XPathEvaluator` sorted with xmldom's
  `compareDocumentPosition`, which is written in JavaScript and walks
  ancestors on every comparison. 1.3.0 numbers the tree once per evaluation
  unless the DOM's method is native (task 0036): the same expressions now
  take 60 to 115 ms with the 1.0 package and 13 to 50 ms with xslt3.
- **XPath 3.1-only expressions** run in the same range as the shared ones.
  The slowest is `distinct-values` grouping written as a nested loop (50
  categories × 20,000 items, 0.65 s on jsdom, 0.56 s on xmldom), which
  per-evaluation caching of descendant results (task 0037) brought down
  from 7.8 s; in XSLT 3.0 `xsl:for-each-group` or a map built in one pass
  avoids the nested loop altogether.
- **Same answers.** Results are compared by count and by a hash of every
  item; numbers compare by value, so `count()` (a JS number in 1.0, an
  `xs:integer` BigInt in 3.1) and `sum()` (both IEEE doubles, added in
  document order) must agree to the last bit, and do.
- **Memory** is dominated by the DOM: jsdom processes peak at 300 to
  370 MB and xmldom processes at 230 to 290 MB with either engine.

## XSLT 1.0 vs XSLT 3.0 engines

The XSLT 1.0 engine of this package (`src/`, `XSLTProcessor`) against the
XSLT 3.0 engine of [@tradik/xslt3](XSLT3.md) (`packages/xslt3`,
`compileStylesheet()` + `transform()` + `serialize()`), in
three groups:

1. **The same XSLT 1.0 stylesheets** as the 1.1.3 vs 1.2.0 suite, run by
   both engines; they declare `version="1.0"`, so xslt3 runs them in
   backwards-compatible mode.
2. **The same tasks rewritten idiomatically** in XSLT 2.0/3.0, run by
   xslt3: is rewriting a 1.0 stylesheet worth it?
3. **XSLT 3.0-only tasks** that 1.0 cannot express directly: grouping,
   regular expressions, iteration with state, JSON in and out, maps,
   higher-order functions, accumulators, merging.

<!-- bench:xslt-hero -->
On jsdom, xslt3 is **2.13× faster** than the 1.0 package (geometric mean of the time ratio over 9 scenarios; from 0.21× the time on 100 MB text result to 1.02× on Muenchian grouping, 8,000) · on xmldom, xslt3 is **1.94× faster** than the 1.0 package (geometric mean of the time ratio over 9 scenarios; from 0.16× the time on following-sibling::x[1], 8,000 to 1.13× on Muenchian grouping, 8,000) · rewritten in XSLT 2.0/3.0, the same tasks run **1.66× faster** on xslt3 than their 1.0 stylesheets (geometric mean over 6 tasks on jsdom; 3.91× faster on Muenchian grouping, 8,000).
<!-- /bench:xslt-hero -->

### XSLT engines method

<!-- bench:xslt-method -->
- Machine: AMD Ryzen 9 7950X 16-Core Processor, 32 logical cores, 31 GB RAM, Linux 6.18.40.1-microsoft-standard-WSL2 (linux)
- Node.js 25.9.0; DOM: jsdom 30.1.1, @xmldom/xmldom 0.9.12
- Engines: 1.0 package 1.3.0 (`src/index.js`), xslt3 1.0.0 (`packages/xslt3/src/index.js`)
- Runs: 2 warm-up + 7 measured per phase (compile, then transform), each scenario, DOM and engine in its own process; a run over 120 s counts as a timeout. Phases slower than 10 s per run use 1 warm-up + 3 runs
- Recorded 2026-10-02; the whole run took 8.25 minutes
<!-- /bench:xslt-method -->

Inputs are generated deterministically, the 1.0 ones by
[scripts/benchmark/inputs.mjs](../scripts/benchmark/inputs.mjs) (the same
bytes as the 1.1.3 vs 1.2.0 suite), the rewrites by
[xsltRewrites.mjs](../scripts/benchmark/xsltRewrites.mjs) and the 3.0-only
ones by [xslt30Inputs.mjs](../scripts/benchmark/xslt30Inputs.mjs) and
[xsltJson.mjs](../scripts/benchmark/xsltJson.mjs). Each worker process
parses the source and the stylesheet once (not timed) with jsdom or
@xmldom/xmldom, installed globally as the `xslt` CLI does, and measures two
phases:

- **compile**: `new XSLTProcessor()` + `importStylesheet()` in the 1.0
  package, `compileStylesheet()` in xslt3;
- **transform**: one transformation with the compiled stylesheet, including
  serialization to a string (`transformToString()` in the 1.0 package;
  `transform()` + `serialize()` with the stylesheet's output parameters in
  xslt3). The charts and the time tables show this phase.

Peak memory is the process's maximum resident set size, so it includes
Node.js, the DOM and the parsed documents; one process runs both phases.

Reproduce:

```bash
npm ci --ignore-scripts
node scripts/benchmark/run.mjs --suite xslt        # writes scripts/benchmark/results-xslt.json
node scripts/benchmark/charts.mjs --suite xslt     # redraws docs/benchmarks/xslt-*.svg and the tables below
```

`node scripts/benchmark/run.mjs --suite xslt --dom jsdom --runs 3 --only catalog,catalogRewrite`
runs a subset (the scenario ids are in
[xsltScenarios.mjs](../scripts/benchmark/xsltScenarios.mjs));
`--no-startup` skips the bundle and import measurements.

#### XSLT engines pre-check

Before anything is timed, every scenario runs once per engine and DOM and
the outputs are compared: both engines on each 1.0 stylesheet, and each
rewrite against the 1.0 package's output of the original stylesheet; every
3.0-only stylesheet must run, and xslt3 must write the same output on every
DOM. Two serializer defaults are removed before comparing, because they are
not results: the line break the 1.0 package writes after the XML
declaration (as libxslt does), and the `<!DOCTYPE html>` that XSLT 3.0
writes for the html output method (HTML5 by default). Anything else stops
the run, unless `--allow-mismatch` records it.

<!-- bench:xslt-check -->
Both engines wrote the same output for every XSLT 1.0 stylesheet on every DOM, every rewrite reproduced the 1.0 package's output of the original stylesheet, every XSLT 3.0-only stylesheet ran without an error, and xslt3 wrote the same output on every DOM.
<!-- /bench:xslt-check -->

### XSLT 1.0 stylesheets on both engines

<!-- bench:xslt-ratio -->
<img src="benchmarks/xslt-ratio.svg" width="720" alt="On jsdom, xslt3 is 1.02× slower than the 1.0 package on Muenchian grouping, 8,000, its largest time ratio (1.02×), and 4.77× faster on 100 MB text result (0.21×); the dashed line marks equal speed.">

| Scenario | 1.0 package, jsdom | xslt3, jsdom | xslt3 ÷ 1.0, jsdom | 1.0 package, xmldom | xslt3, xmldom | xslt3 ÷ 1.0, xmldom |
| --- | --- | --- | --- | --- | --- | --- |
| Issue #9 catalogue (3 MB HTML) | 2.68 s | 2.66 s | 1.00× | 972 ms | 1.04 s | 1.07× |
| apply-templates item[@id], 8,000 | 157 ms | 102 ms | 0.65× | 70 ms | 44 ms | 0.62× |
| Muenchian grouping, 8,000 | 133 ms | 136 ms | 1.02× | 71 ms | 80 ms | 1.13× |
| xsl:number level="any", 8,000 | 83 ms | 33 ms | 0.40× | 30 ms | 22 ms | 0.72× |
| following-sibling::x[1], 8,000 | 106 ms | 23 ms | 0.21× | 51 ms | 7.9 ms | 0.16× |
| Sort 20,000 by two keys | 410 ms | 165 ms | 0.40× | 192 ms | 116 ms | 0.61× |
| Identity transform, 5 MB | 2.10 s | 2.02 s | 0.96× | 904 ms | 702 ms | 0.78× |
| call-template depth 3,000 | 57 ms | 14 ms | 0.24× | 31 ms | 11 ms | 0.34× |
| 100 MB text result | 3.93 s | 824 ms | 0.21× | 1.53 s | 293 ms | 0.19× |
<!-- /bench:xslt-ratio -->

### Rewritten in XSLT 2.0/3.0

Each task keeps its source document and must produce the same output; only
the stylesheet changes:

| Task | XSLT 1.0 | XSLT 2.0/3.0 rewrite |
|---|---|---|
| Catalogue, grouping | Muenchian method: `key()` + `generate-id()` | `xsl:for-each-group group-by` |
| Numbering | `xsl:number level="any" count="i[@k='1']"` | a running count in `xsl:iterate` |
| Sort by two keys | two `xsl:sort` | `sort()` with a key function returning both keys |
| Identity | the identity template | `xsl:mode on-no-match="shallow-copy"` |
| Recursion | `xsl:call-template` calling itself 3,000 deep | `xsl:iterate` |

<!-- bench:xslt-rewrite -->
<img src="benchmarks/xslt-rewrite.svg" width="720" alt="Median time of each task on jsdom: the 1.0 package and xslt3 on the XSLT 1.0 stylesheet, and xslt3 on the idiomatic XSLT 2.0/3.0 rewrite; the largest gain is on Muenchian grouping, 8,000, where the rewrite (xsl:for-each-group) is 3.91× faster than the 1.0 stylesheet on xslt3.">

| Task | Rewrite uses | 1.0 package, jsdom | xslt3 1.0 stylesheet, jsdom | xslt3 rewrite, jsdom | 1.0 package, xmldom | xslt3 1.0 stylesheet, xmldom | xslt3 rewrite, xmldom |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Issue #9 catalogue (3 MB HTML) | xsl:for-each-group | 2.68 s | 2.66 s | 1.74 s | 972 ms | 1.04 s | 647 ms |
| Muenchian grouping, 8,000 | xsl:for-each-group | 133 ms | 136 ms | 35 ms | 71 ms | 80 ms | 19 ms |
| xsl:number level="any", 8,000 | xsl:iterate | 83 ms | 33 ms | 27 ms | 30 ms | 22 ms | 15 ms |
| Sort 20,000 by two keys | sort() with a key | 410 ms | 165 ms | 152 ms | 192 ms | 116 ms | 92 ms |
| Identity transform, 5 MB | on-no-match | 2.10 s | 2.02 s | 1.70 s | 904 ms | 702 ms | 500 ms |
| call-template depth 3,000 | xsl:iterate | 57 ms | 14 ms | 6.4 ms | 31 ms | 11 ms | 2.9 ms |
<!-- /bench:xslt-rewrite -->

### XSLT 3.0-only scenarios

<!-- bench:xslt-only30 -->
<img src="benchmarks/xslt-only30.svg" width="720" alt="Median time of the XSLT 3.0 scenarios that XSLT 1.0 cannot express directly; the slowest is json-to-xml, 5 MB JSON (3.05 s on jsdom).">

| Scenario | jsdom | jsdom compile | xmldom | xmldom compile |
| --- | --- | --- | --- | --- |
| group-adjacent, 50,000 | 216 ms | 1.0 ms | 91 ms | 0.8 ms |
| analyze-string, 5 MB log | 409 ms | 0.9 ms | 184 ms | 0.6 ms |
| xsl:iterate totals, 100,000 | 384 ms | 1.0 ms | 250 ms | 0.8 ms |
| json-to-xml, 5 MB JSON | 3.05 s | 1.0 ms | 1.10 s | 0.7 ms |
| parse-json, 5 MB JSON | 286 ms | 0.9 ms | 272 ms | 0.7 ms |
| xml-to-json, 5 MB JSON | 1.69 s | 0.7 ms | 483 ms | 0.6 ms |
| serialize as JSON, 29,000 maps | 249 ms | 1.1 ms | 168 ms | 0.8 ms |
| 100,000-entry map + lookups | 323 ms | 1.0 ms | 310 ms | 0.7 ms |
| sort() with a key, 20,000 | 84 ms | 0.9 ms | 63 ms | 0.8 ms |
| fold-left into a map, 20,000 | 141 ms | 1.2 ms | 94 ms | 0.9 ms |
| Accumulators, 5 MB | 692 ms | 1.3 ms | 487 ms | 1.2 ms |
| xsl:merge, 2 × 50,000 | 346 ms | 1.1 ms | 241 ms | 1.0 ms |
<!-- /bench:xslt-only30 -->

| Scenario | What it does |
|---|---|
| group-adjacent | 50,000 log entries grouped into runs of the same type |
| analyze-string | the WARN and ERROR lines of a 5 MB log picked with a regular expression (`flags="m"`) |
| xsl:iterate totals | an exact `xs:decimal` running total of 100,000 amounts |
| json-to-xml, parse-json | the same summary of 37,500 orders (5 MB of JSON, a string parameter) through the XML representation of JSON and through maps and arrays |
| xml-to-json | the XML representation of the same 5 MB of JSON written as JSON |
| serialize as JSON | 29,000 records as an array of maps, written with `serialize(..., map { 'method': 'json' })` |
| map + lookups | `map:merge` of 100,000 entries, then 100,000 lookups |
| sort() with a key, fold-left | higher-order functions over 20,000 items: a sort by price; per-category totals folded into a map |
| Accumulators | a record counter and an `xs:decimal` sum over the 5 MB identity document |
| xsl:merge | two sources of 50,000 items each, sorted by an integer key |

### XSLT engines compile time

<!-- bench:xslt-compile -->
| Scenario | 1.0 package, jsdom | xslt3, jsdom | 1.0 package, xmldom | xslt3, xmldom |
| --- | --- | --- | --- | --- |
| Issue #9 catalogue (3 MB HTML) | 0.7 ms | 2.5 ms | 0.5 ms | 2.2 ms |
| apply-templates item[@id], 8,000 | 0.5 ms | 0.8 ms | 0.3 ms | 0.6 ms |
| Muenchian grouping, 8,000 | 0.5 ms | 1.1 ms | 0.3 ms | 0.8 ms |
| xsl:number level="any", 8,000 | 0.5 ms | 0.8 ms | 0.3 ms | 0.5 ms |
| following-sibling::x[1], 8,000 | 0.5 ms | 0.7 ms | 0.3 ms | 0.4 ms |
| Sort 20,000 by two keys | 0.5 ms | 0.9 ms | 0.3 ms | 0.7 ms |
| Identity transform, 5 MB | 0.6 ms | 1.1 ms | 0.4 ms | 0.8 ms |
| call-template depth 3,000 | 0.4 ms | 0.8 ms | 0.3 ms | 0.5 ms |
| 100 MB text result | 0.4 ms | 0.8 ms | 0.3 ms | 0.5 ms |
| Catalogue | n/a | 2.3 ms | n/a | 1.9 ms |
| Grouping, 8,000 | n/a | 0.8 ms | n/a | 0.6 ms |
| Numbering, 8,000 | n/a | 0.8 ms | n/a | 0.5 ms |
| Sort, 20,000 | n/a | 0.9 ms | n/a | 0.8 ms |
| Identity, 5 MB | n/a | 0.7 ms | n/a | 0.5 ms |
| Depth 3,000 | n/a | 0.8 ms | n/a | 0.5 ms |
| group-adjacent, 50,000 | n/a | 1.0 ms | n/a | 0.8 ms |
| analyze-string, 5 MB log | n/a | 0.9 ms | n/a | 0.6 ms |
| xsl:iterate totals, 100,000 | n/a | 1.0 ms | n/a | 0.8 ms |
| json-to-xml, 5 MB JSON | n/a | 1.0 ms | n/a | 0.7 ms |
| parse-json, 5 MB JSON | n/a | 0.9 ms | n/a | 0.7 ms |
| xml-to-json, 5 MB JSON | n/a | 0.7 ms | n/a | 0.6 ms |
| serialize as JSON, 29,000 maps | n/a | 1.1 ms | n/a | 0.8 ms |
| 100,000-entry map + lookups | n/a | 1.0 ms | n/a | 0.7 ms |
| sort() with a key, 20,000 | n/a | 0.9 ms | n/a | 0.8 ms |
| fold-left into a map, 20,000 | n/a | 1.2 ms | n/a | 0.9 ms |
| Accumulators, 5 MB | n/a | 1.3 ms | n/a | 1.2 ms |
| xsl:merge, 2 × 50,000 | n/a | 1.1 ms | n/a | 1.0 ms |
<!-- /bench:xslt-compile -->

### Start-up and bundle size

Each package bundled as one minified ES module for browsers, the way the
website bundles @tradik/xslt3 for its playground
([site/scripts/vendor.mjs](../site/scripts/vendor.mjs)), and the time a
fresh Node.js process takes to `import()` it, from source and from that
bundle (median of the runs, one process each).

<!-- bench:xslt-startup -->
| Engine | Bundle | gzip | Brotli | Node.js import(), source | Node.js import(), bundle |
| --- | --- | --- | --- | --- | --- |
| 1.0 package (`src/index.js`) | 147.0 kB | 46.5 kB | 40.7 kB | 29 ms | 6.1 ms |
| xslt3 (`packages/xslt3/src/index.js`) | 339.0 kB | 116.7 kB | 99.9 kB | 77 ms | 21 ms |
<!-- /bench:xslt-startup -->

### XSLT engines peak memory

<!-- bench:xslt-memory -->
| Scenario | 1.0 package, jsdom | xslt3, jsdom | 1.0 package, xmldom | xslt3, xmldom |
| --- | --- | --- | --- | --- |
| Issue #9 catalogue (3 MB HTML) | 661 MB | 614 MB | 485 MB | 443 MB |
| apply-templates item[@id], 8,000 | 278 MB | 260 MB | 187 MB | 203 MB |
| Muenchian grouping, 8,000 | 262 MB | 282 MB | 150 MB | 150 MB |
| xsl:number level="any", 8,000 | 230 MB | 243 MB | 128 MB | 146 MB |
| following-sibling::x[1], 8,000 | 258 MB | 208 MB | 152 MB | 113 MB |
| Sort 20,000 by two keys | 308 MB | 292 MB | 237 MB | 234 MB |
| Identity transform, 5 MB | 666 MB | 702 MB | 542 MB | 566 MB |
| call-template depth 3,000 | 215 MB | 192 MB | 106 MB | 100 MB |
| 100 MB text result | 659 MB | 287 MB | 465 MB | 233 MB |
| Catalogue | n/a | 599 MB | n/a | 426 MB |
| Grouping, 8,000 | n/a | 214 MB | n/a | 115 MB |
| Numbering, 8,000 | n/a | 229 MB | n/a | 114 MB |
| Sort, 20,000 | n/a | 282 MB | n/a | 232 MB |
| Identity, 5 MB | n/a | 658 MB | n/a | 523 MB |
| Depth 3,000 | n/a | 188 MB | n/a | 76 MB |
| group-adjacent, 50,000 | n/a | 343 MB | n/a | 275 MB |
| analyze-string, 5 MB log | n/a | 338 MB | n/a | 286 MB |
| xsl:iterate totals, 100,000 | n/a | 378 MB | n/a | 328 MB |
| json-to-xml, 5 MB JSON | n/a | 1391 MB | n/a | 2018 MB |
| parse-json, 5 MB JSON | n/a | 382 MB | n/a | 322 MB |
| xml-to-json, 5 MB JSON | n/a | 1298 MB | n/a | 851 MB |
| serialize as JSON, 29,000 maps | n/a | 423 MB | n/a | 393 MB |
| 100,000-entry map + lookups | n/a | 358 MB | n/a | 302 MB |
| sort() with a key, 20,000 | n/a | 283 MB | n/a | 198 MB |
| fold-left into a map, 20,000 | n/a | 291 MB | n/a | 164 MB |
| Accumulators, 5 MB | n/a | 521 MB | n/a | 477 MB |
| xsl:merge, 2 × 50,000 | n/a | 410 MB | n/a | 364 MB |
<!-- /bench:xslt-memory -->

### SaxonJS

SaxonJS 3, Saxonica's XSLT 3.0 processor for JavaScript, is the reference
the milestone in [XSLT3.md](XSLT3.md) names. On npm it is `saxonjs-he` with
the `xslt3-he` compiler (3.0.0-beta2; `saxon-js` and `xslt3` are SaxonJS 2).
Its licence (Saxonica's "SaxonJS licence", version 2.0, December 2024,
shipped as `LICENSE.txt`) allows use and redistribution in binary form but
says nothing about publishing benchmark results, and the package is a
preview beta. This page therefore publishes no SaxonJS numbers, and SaxonJS
is not a dependency of this repository. To compare locally, install it
outside the repository and point the benchmark at it; its results are
written to the system temporary directory, never to `results-xslt.json`:

```bash
npm install --prefix /tmp/saxon saxonjs-he xslt3-he
node scripts/benchmark/run.mjs --suite xslt --saxon-dir /tmp/saxon
```

Each stylesheet is then compiled to SEF with `xslt3-he -export -nogo`
(timed separately), and `SaxonJS.transform()` of the SEF is timed on a
tree SaxonJS parsed itself; its outputs are compared with xslt3's, ignoring
whitespace between tags (SaxonJS indents HTML by default).

### XSLT engines notes

- **xslt3 runs the 1.0 stylesheets faster than the 1.0 package** on both
  DOMs: 2 to 7 times on sorting, `following-sibling::x[1]` in a loop,
  recursion, `xsl:number level="any"` and the 100 MB text result (which
  also peaks at 290 MB of memory instead of 660 MB on jsdom). The
  catalogue, the identity transform and Muenchian grouping are within 15%,
  because building and serializing the result tree dominates them.
  `xsl:number level="any"` was quadratic in xslt3 before release (8,000
  nodes took 41 s); it now remembers the last number per instruction and
  takes 35 ms (task 0038).
- **Rewriting pays off where the 1.0 idiom was a workaround.**
  `xsl:for-each-group` instead of Muenchian keys is almost 4 times faster on
  the grouping scenario and 1.5 times on the catalogue;
  `on-no-match="shallow-copy"` saves 20% (jsdom) to 30% (xmldom) on the
  identity transform; `sort()` with a key function costs about the same as
  two `xsl:sort` keys.
- **JSON**: `parse-json()` reads 5 MB of JSON 10 times faster than
  `json-to-xml()` on jsdom and with a quarter of the memory: the XML
  representation of the JSON is a DOM tree of hundreds of thousands of
  elements, and the json-to-xml processes peak at 1.4 GB (jsdom) to 2 GB
  (xmldom), mostly in the DOM library itself.
- **Accumulators** over a 29,000-element document take 0.7 s on jsdom and
  0.5 s on xmldom.
- **jsdom or xmldom**: both engines usually run 1.5 to 3 times faster on
  @xmldom/xmldom than on jsdom; the ranking of the engines does not change.
- **Compiling** a stylesheet takes 0.5 to 2 ms with either engine, so
  reusing a compiled stylesheet matters only for small transformations.
- **Start-up**: the xslt3 bundle is 2.5 times the 1.0 package's (117 kB
  against 47 kB gzip) and takes 2.6 times as long to import from source in
  Node.js (78 ms against 30 ms); the 1.0 package does not load it unless
  asked to (see [XSLT3.md](XSLT3.md), "Opt-in bridge").
