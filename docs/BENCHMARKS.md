# Benchmarks: 1.1.3 vs 1.2.0

How much faster and leaner 1.2.0 is than the released 1.1.3 on the same
inputs, measured with a reproducible benchmark: speed-up per scenario, time
per scenario and peak memory, each chart followed by its data table.

<!-- bench:hero -->
**1.81× faster** on 100 MB text result, string · **1.39×** geometric mean over 10 scenarios · **58% less peak memory** on 100 MB text result, string (1557 MB to 650 MB) · call-template depth 3,000: runs on 1.2.0, error on 1.1.3.
<!-- /bench:hero -->

## Contents

- [Method](#method)
- [Speed-up](#speed-up)
- [Time per scenario](#time-per-scenario)
- [Peak memory](#peak-memory)
- [Scenarios](#scenarios)
- [Notes and caveats](#notes-and-caveats)
- [XPath 1.0 vs XPath 3.1](#xpath-10-vs-xpath-31): the 1.0 package against @tradik/xslt3

## Method

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

## Speed-up

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

## Time per scenario

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

## Peak memory

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
`compileXPath()` / `evaluateXPath()`, in development), on the same
expressions over the same DOM.

<!-- bench:xpath-hero -->
On jsdom, xslt3 is **1.10× slower** than the 1.0 package (geometric mean of the time ratio over 11 scenarios; from 0.46× the time on following-sibling::item[1] × 20,000 to 2.40× on //item[last()]) · on xmldom, xslt3 is **27.0× faster** than the 1.0 package (geometric mean of the time ratio over 11 scenarios; from 0.0011× the time on //item to 1.03× on //item[last()]).
<!-- /bench:xpath-hero -->

### XPath method

<!-- bench:xpath-method -->
- Machine: AMD Ryzen 9 7950X 16-Core Processor, 32 logical cores, 31 GB RAM, Linux 6.18.40.1-microsoft-standard-WSL2 (linux)
- Node.js 25.9.0; DOM: jsdom 30.1.1, @xmldom/xmldom 0.9.12
- Engines: 1.0 package 1.2.1 (`src/index.js`), xslt3 0.0.0 (`packages/xslt3/src/index.js`, in development)
- Runs: 2 warm-up + 7 measured per phase (compiled, then one-shot), each scenario, DOM and engine in its own process; a run over 120 s counts as a timeout. Phases slower than 10 s per run use 1 warm-up + 3 runs
- Recorded 2026-10-01; the whole run took 21.86 minutes
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
<img src="benchmarks/xpath-ratio.svg" width="720" alt="On jsdom, xslt3 is 2.40× slower than the 1.0 package on //item[last()], its largest time ratio (2.40×), and 2.16× faster on following-sibling::item[1] × 20,000 (0.46×); the dashed line marks equal speed.">

| Scenario | Expression | jsdom | jsdom one-shot | xmldom | xmldom one-shot |
| --- | --- | --- | --- | --- | --- |
| //item[last()] | `//item[last()]` | 2.40× | 2.40× | 1.03× | 1.03× |
| //a \| //b | `//a \| //b` | 1.96× | 2.02× | 0.0023× | 0.0023× |
| //item[contains(name, 'abc')] | `//item[contains(name, 'abc')]` | 1.36× | 1.27× | 0.13× | 0.13× |
| count(//item[@price > 50]) | `count(//item[@price > 50])` | 1.20× | 1.19× | 0.0051× | 0.0050× |
| sum(//item/@price) | `sum(//item/@price)` | 1.15× | 1.16× | 0.0014× | 0.0014× |
| //item[@id = 'i10000'] | `//item[@id = 'i10000']` | 1.08× | 1.11× | 0.54× | 0.54× |
| //item | `//item` | 1.05× | 1.04× | 0.0011× | 0.0011× |
| translate/concat/substring × 20,000 | `concat(translate(name, 'abcdef', 'ABCDEF'), '-', substring(@id, 2, 3))` | 1.04× | 2.00× | 0.81× | 2.30× |
| (//item)[1000] | `(//item)[1000]` | 0.82× | 0.84× | 0.0011× | 0.0011× |
| ancestor::* from 1,000 deep nodes | `ancestor::*` | 0.69× | 0.92× | 0.49× | 1.01× |
| following-sibling::item[1] × 20,000 | `following-sibling::item[1]` | 0.46× | 1.13× | 0.30× | 1.15× |
<!-- /bench:xpath-ratio -->

### XPath time on jsdom

<!-- bench:xpath-time-jsdom -->
<img src="benchmarks/xpath-time-jsdom.svg" width="720" alt="Median time of each compiled expression on jsdom: xslt3 (XPath 3.1) is slower than the 1.0 package (XPath 1.0) in 8 of 11 scenarios.">

| Scenario | 1.0 package | xslt3 | xslt3 ÷ 1.0 | 1.0 one-shot | xslt3 one-shot | xslt3 ÷ 1.0 one-shot |
| --- | --- | --- | --- | --- | --- | --- |
| //item | 87 ms | 92 ms | 1.05× | 87 ms | 90 ms | 1.04× |
| //item[@id = 'i10000'] | 144 ms | 155 ms | 1.08× | 143 ms | 158 ms | 1.11× |
| //item[last()] | 82 ms | 197 ms | 2.40× | 81 ms | 195 ms | 2.40× |
| (//item)[1000] | 91 ms | 75 ms | 0.82× | 87 ms | 74 ms | 0.84× |
| count(//item[@price > 50]) | 150 ms | 180 ms | 1.20× | 151 ms | 180 ms | 1.19× |
| sum(//item/@price) | 158 ms | 181 ms | 1.15× | 155 ms | 181 ms | 1.16× |
| //item[contains(name, 'abc')] | 136 ms | 185 ms | 1.36× | 140 ms | 178 ms | 1.27× |
| //a \| //b | 181 ms | 354 ms | 1.96× | 177 ms | 357 ms | 2.02× |
| following-sibling::item[1] × 20,000 | 68 ms | 32 ms | 0.46× | 105 ms | 119 ms | 1.13× |
| ancestor::* from 1,000 deep nodes | 9.9 ms | 6.8 ms | 0.69× | 14 ms | 13 ms | 0.92× |
| translate/concat/substring × 20,000 | 177 ms | 184 ms | 1.04× | 258 ms | 516 ms | 2.00× |
<!-- /bench:xpath-time-jsdom -->

### XPath time on xmldom

<!-- bench:xpath-time-xmldom -->
<img src="benchmarks/xpath-time-xmldom.svg" width="720" alt="Median time of each compiled expression on xmldom: xslt3 (XPath 3.1) is slower than the 1.0 package (XPath 1.0) in 1 of 11 scenarios.">

| Scenario | 1.0 package | xslt3 | xslt3 ÷ 1.0 | 1.0 one-shot | xslt3 one-shot | xslt3 ÷ 1.0 one-shot |
| --- | --- | --- | --- | --- | --- | --- |
| //item | 14.2 s | 15 ms | 0.0011× | 14.1 s | 16 ms | 0.0011× |
| //item[@id = 'i10000'] | 59 ms | 31 ms | 0.54× | 56 ms | 30 ms | 0.54× |
| //item[last()] | 40 ms | 41 ms | 1.03× | 40 ms | 42 ms | 1.03× |
| (//item)[1000] | 14.1 s | 16 ms | 0.0011× | 14.1 s | 16 ms | 0.0011× |
| count(//item[@price > 50]) | 7.67 s | 39 ms | 0.0051× | 7.69 s | 38 ms | 0.0050× |
| sum(//item/@price) | 27.9 s | 40 ms | 0.0014× | 28.3 s | 39 ms | 0.0014× |
| //item[contains(name, 'abc')] | 292 ms | 38 ms | 0.13× | 288 ms | 38 ms | 0.13× |
| //a \| //b | 33.3 s | 77 ms | 0.0023× | 33.3 s | 78 ms | 0.0023× |
| following-sibling::item[1] × 20,000 | 51 ms | 16 ms | 0.30× | 91 ms | 105 ms | 1.15× |
| ancestor::* from 1,000 deep nodes | 7.4 ms | 3.7 ms | 0.49× | 12 ms | 12 ms | 1.01× |
| translate/concat/substring × 20,000 | 94 ms | 76 ms | 0.81× | 173 ms | 398 ms | 2.30× |
<!-- /bench:xpath-time-xmldom -->

### XPath 3.1-only expressions

What XPath 1.0 cannot express at all, on xslt3 alone.

<!-- bench:xpath-only31 -->
<img src="benchmarks/xpath-only31.svg" width="720" alt="Median time of the compiled XPath 3.1 expressions that XPath 1.0 cannot express; the slowest is distinct-values grouping + sum (7.83 s on jsdom).">

| Scenario | Expression | jsdom | jsdom one-shot | xmldom | xmldom one-shot |
| --- | --- | --- | --- | --- | --- |
| for + let over //item | `for $x in //item return let $p := number($x/@price) return if ($p > 50) then string($x/@id) else ()` | 209 ms | 210 ms | 51 ms | 47 ms |
| distinct-values grouping + sum | `for $c in distinct-values(//item/@cat) return sum(//item[@cat = $c]/@price)` | 7.83 s | 7.81 s | 1.44 s | 1.73 s |
| sort() with a key function | `sort(//item, (), function($i) { number($i/@price) })` | 200 ms | 188 ms | 71 ms | 66 ms |
| map:merge of 20,000 maps | `map:merge(//item ! map { string(@id): number(@price) })` | 236 ms | 240 ms | 54 ms | 53 ms |
| string-join(//item/@id) | `string-join(//item/@id, ',')` | 171 ms | 170 ms | 32 ms | 31 ms |
| //item[matches(name, ...)] | `//item[matches(name, '^[a-c]{3}')]` | 145 ms | 151 ms | 36 ms | 37 ms |
| tokenize(string-join(//name)) | `tokenize(string-join(//name, ' '), '\s+')` | 130 ms | 132 ms | 32 ms | 32 ms |
| format-number × 20,000 | `//item ! format-number(number(@price), '#,##0.00')` | 219 ms | 218 ms | 102 ms | 99 ms |
| fold-left sum of //item/@price | `fold-left(//item/@price, 0, function($a, $b) { $a + $b })` | 167 ms | 169 ms | 40 ms | 40 ms |
<!-- /bench:xpath-only31 -->

### XPath peak memory

<!-- bench:xpath-memory -->
| Scenario | 1.0 package, jsdom | xslt3, jsdom | 1.0 package, xmldom | xslt3, xmldom |
| --- | --- | --- | --- | --- |
| //item | 350 MB | 371 MB | 708 MB | 242 MB |
| //item[@id = 'i10000'] | 348 MB | 380 MB | 237 MB | 280 MB |
| //item[last()] | 348 MB | 375 MB | 271 MB | 289 MB |
| (//item)[1000] | 348 MB | 362 MB | 662 MB | 241 MB |
| count(//item[@price > 50]) | 349 MB | 385 MB | 733 MB | 279 MB |
| sum(//item/@price) | 351 MB | 395 MB | 706 MB | 277 MB |
| //item[contains(name, 'abc')] | 349 MB | 384 MB | 506 MB | 251 MB |
| //a \| //b | 353 MB | 404 MB | 699 MB | 298 MB |
| following-sibling::item[1] × 20,000 | 345 MB | 350 MB | 286 MB | 284 MB |
| ancestor::* from 1,000 deep nodes | 343 MB | 343 MB | 239 MB | 235 MB |
| translate/concat/substring × 20,000 | 362 MB | 368 MB | 293 MB | 294 MB |
| for + let over //item | n/a | 391 MB | n/a | 289 MB |
| distinct-values grouping + sum | n/a | 402 MB | n/a | 296 MB |
| sort() with a key function | n/a | 383 MB | n/a | 288 MB |
| map:merge of 20,000 maps | n/a | 391 MB | n/a | 280 MB |
| string-join(//item/@id) | n/a | 381 MB | n/a | 263 MB |
| //item[matches(name, ...)] | n/a | 377 MB | n/a | 255 MB |
| tokenize(string-join(//name)) | n/a | 378 MB | n/a | 264 MB |
| format-number × 20,000 | n/a | 388 MB | n/a | 290 MB |
| fold-left sum of //item/@price | n/a | 380 MB | n/a | 287 MB |
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
- **On xmldom the 1.0 package's standalone XPath API is the outlier,
  not xslt3.** Every expression that returns or sorts a large node-set
  (`//item`, `(//item)[1000]`, `sum(//item/@price)`, `//a | //b`) takes 7
  to 33 s, where xslt3 needs 15 to 80 ms. `XPathEvaluator.sortByDocumentOrder()`
  builds its `DocumentOrderIndex` only when the DOM has no
  `compareDocumentPosition`; @xmldom/xmldom 0.9 has one, written in
  JavaScript and walking ancestors on every comparison, so sorting
  20,000 nodes takes seconds. Given an index, the same `sum(//item/@price)`
  runs in about 70 ms. Transformations are not affected: the XSLT engine
  gives every transformation its own index (see the 1.1.3 vs 1.2.0
  results above).
- **XPath 3.1-only expressions** run in the same range as the shared ones,
  except `distinct-values` grouping written as a nested loop: 50
  categories × a scan of 20,000 items is a million comparisons of
  untyped attributes (7.8 s on jsdom, 1.4 s on xmldom); in XSLT 3.0
  `xsl:for-each-group` or a map built in one pass avoids it.
- **Same answers.** Results are compared by count and by a hash of every
  item; numbers compare by value, so `count()` (a JS number in 1.0, an
  `xs:integer` BigInt in 3.1) and `sum()` (both IEEE doubles, added in
  document order) must agree to the last bit, and do.
- **Memory** is dominated by the DOM: jsdom processes peak at 340 to
  400 MB with either engine. The xmldom processes of the 1.0 package that
  sort large node-sets reach 500 to 730 MB, against 240 to 300 MB for
  xslt3.
- xslt3 is in development (`0.0.0`); these numbers are a baseline for
  its optimisation, not a release comparison.
