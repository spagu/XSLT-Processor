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
- [XSLT 1.0 vs XSLT 3.0 engines](#xslt-10-vs-xslt-30-engines): the 1.0 package against @tradik/xslt3 on the same stylesheets, idiomatic 2.0/3.0 rewrites, 3.0-only scenarios, start-up and bundle size

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

## XSLT 1.0 vs XSLT 3.0 engines

The XSLT 1.0 engine of this package (`src/`, `XSLTProcessor`) against the
XSLT 3.0 engine of [@tradik/xslt3](XSLT3.md) (`packages/xslt3`,
`compileStylesheet()` + `transform()` + `serialize()`, in development), in
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
On jsdom, xslt3 is **1.04× slower** than the 1.0 package (geometric mean of the time ratio over 9 scenarios; from 0.22× the time on 100 MB text result to 492× on xsl:number level="any", 8,000) · on xmldom, xslt3 is **1.00× faster** than the 1.0 package (geometric mean of the time ratio over 9 scenarios; from 0.13× the time on following-sibling::x[1], 8,000 to 359× on xsl:number level="any", 8,000) · rewritten in XSLT 2.0/3.0, the same tasks run **5.32× faster** on xslt3 than their 1.0 stylesheets (geometric mean over 6 tasks on jsdom; 1,567× faster on xsl:number level="any", 8,000).
<!-- /bench:xslt-hero -->

### XSLT engines method

<!-- bench:xslt-method -->
- Machine: AMD Ryzen 9 7950X 16-Core Processor, 32 logical cores, 31 GB RAM, Linux 6.18.40.1-microsoft-standard-WSL2 (linux)
- Node.js 25.9.0; DOM: jsdom 30.1.1, @xmldom/xmldom 0.9.12
- Engines: 1.0 package 1.2.1 (`src/index.js`), xslt3 0.0.0 (`packages/xslt3/src/index.js`, in development)
- Runs: 2 warm-up + 7 measured per phase (compile, then transform), each scenario, DOM and engine in its own process; a run over 120 s counts as a timeout. Phases slower than 10 s per run use 1 warm-up + 3 runs
- Recorded 2026-10-02; the whole run took 20.62 minutes
- **Provisional**: recorded on a machine shared with other work, so single numbers may be off by tens of percent; to be re-run on an idle machine before the release
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
<img src="benchmarks/xslt-ratio.svg" width="720" alt="On jsdom, xslt3 is 492× slower than the 1.0 package on xsl:number level=&quot;any&quot;, 8,000, its largest time ratio (492×), and 4.64× faster on 100 MB text result (0.22×); the dashed line marks equal speed.">

| Scenario | 1.0 package, jsdom | xslt3, jsdom | xslt3 ÷ 1.0, jsdom | 1.0 package, xmldom | xslt3, xmldom | xslt3 ÷ 1.0, xmldom |
| --- | --- | --- | --- | --- | --- | --- |
| Issue #9 catalogue (3 MB HTML) | 2.65 s | 2.57 s | 0.97× | 991 ms | 1.09 s | 1.10× |
| apply-templates item[@id], 8,000 | 159 ms | 107 ms | 0.67× | 72 ms | 39 ms | 0.55× |
| Muenchian grouping, 8,000 | 140 ms | 135 ms | 0.97× | 67 ms | 80 ms | 1.19× |
| xsl:number level="any", 8,000 | 84 ms | 41.4 s | 492× | 29 ms | 10.3 s | 359× |
| following-sibling::x[1], 8,000 | 105 ms | 23 ms | 0.22× | 51 ms | 6.8 ms | 0.13× |
| Sort 20,000 by two keys | 404 ms | 172 ms | 0.43× | 192 ms | 109 ms | 0.57× |
| Identity transform, 5 MB | 2.05 s | 2.04 s | 0.99× | 908 ms | 731 ms | 0.81× |
| call-template depth 3,000 | 58 ms | 13 ms | 0.23× | 33 ms | 11 ms | 0.33× |
| 100 MB text result | 3.83 s | 826 ms | 0.22× | 1.50 s | 285 ms | 0.19× |
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
<img src="benchmarks/xslt-rewrite.svg" width="720" alt="Median time of each task on jsdom: the 1.0 package and xslt3 on the XSLT 1.0 stylesheet, and xslt3 on the idiomatic XSLT 2.0/3.0 rewrite; the largest gain is on xsl:number level=&quot;any&quot;, 8,000, where the rewrite (xsl:iterate) is 1,567× faster than the 1.0 stylesheet on xslt3.">

| Task | Rewrite uses | 1.0 package, jsdom | xslt3 1.0 stylesheet, jsdom | xslt3 rewrite, jsdom | 1.0 package, xmldom | xslt3 1.0 stylesheet, xmldom | xslt3 rewrite, xmldom |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Issue #9 catalogue (3 MB HTML) | xsl:for-each-group | 2.65 s | 2.57 s | 1.70 s | 991 ms | 1.09 s | 634 ms |
| Muenchian grouping, 8,000 | xsl:for-each-group | 140 ms | 135 ms | 35 ms | 67 ms | 80 ms | 18 ms |
| xsl:number level="any", 8,000 | xsl:iterate | 84 ms | 41.4 s | 26 ms | 29 ms | 10.3 s | 16 ms |
| Sort 20,000 by two keys | sort() with a key | 404 ms | 172 ms | 162 ms | 192 ms | 109 ms | 93 ms |
| Identity transform, 5 MB | on-no-match | 2.05 s | 2.04 s | 1.67 s | 908 ms | 731 ms | 493 ms |
| call-template depth 3,000 | xsl:iterate | 58 ms | 13 ms | 6.8 ms | 33 ms | 11 ms | 2.7 ms |
<!-- /bench:xslt-rewrite -->

### XSLT 3.0-only scenarios

<!-- bench:xslt-only30 -->
<img src="benchmarks/xslt-only30.svg" width="720" alt="Median time of the XSLT 3.0 scenarios that XSLT 1.0 cannot express directly; the slowest is json-to-xml, 5 MB JSON (2.96 s on jsdom).">

| Scenario | jsdom | jsdom compile | xmldom | xmldom compile |
| --- | --- | --- | --- | --- |
| group-adjacent, 50,000 | 207 ms | 1.0 ms | 89 ms | 0.9 ms |
| analyze-string, 5 MB log | 404 ms | 0.9 ms | 182 ms | 0.6 ms |
| xsl:iterate totals, 100,000 | 370 ms | 1.1 ms | 244 ms | 0.7 ms |
| json-to-xml, 5 MB JSON | 2.96 s | 1.0 ms | 1.28 s | 0.7 ms |
| parse-json, 5 MB JSON | 474 ms | 0.9 ms | 459 ms | 0.7 ms |
| xml-to-json, 5 MB JSON | 1.71 s | 0.8 ms | 489 ms | 0.7 ms |
| serialize as JSON, 29,000 maps | 243 ms | 0.9 ms | 169 ms | 0.9 ms |
| 100,000-entry map + lookups | 309 ms | 0.9 ms | 324 ms | 0.7 ms |
| sort() with a key, 20,000 | 83 ms | 0.8 ms | 58 ms | 0.6 ms |
| fold-left into a map, 20,000 | 132 ms | 1.1 ms | 95 ms | 1.0 ms |
| Accumulators, 5 MB | 900 ms | 1.3 ms | 648 ms | 1.2 ms |
| xsl:merge, 2 × 50,000 | 358 ms | 1.3 ms | 236 ms | 1.0 ms |
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
| Issue #9 catalogue (3 MB HTML) | 0.8 ms | 2.1 ms | 0.6 ms | 1.9 ms |
| apply-templates item[@id], 8,000 | 0.5 ms | 0.9 ms | 0.3 ms | 0.7 ms |
| Muenchian grouping, 8,000 | 0.5 ms | 1.2 ms | 0.3 ms | 0.8 ms |
| xsl:number level="any", 8,000 | 0.5 ms | 0.8 ms | 0.4 ms | 0.6 ms |
| following-sibling::x[1], 8,000 | 0.5 ms | 0.8 ms | 0.3 ms | 0.5 ms |
| Sort 20,000 by two keys | 0.5 ms | 1.0 ms | 0.3 ms | 0.7 ms |
| Identity transform, 5 MB | 0.5 ms | 0.8 ms | 0.4 ms | 0.8 ms |
| call-template depth 3,000 | 0.4 ms | 0.9 ms | 0.3 ms | 0.5 ms |
| 100 MB text result | 0.4 ms | 0.8 ms | 0.3 ms | 0.5 ms |
| Catalogue | n/a | 2.1 ms | n/a | 1.9 ms |
| Grouping, 8,000 | n/a | 0.8 ms | n/a | 0.5 ms |
| Numbering, 8,000 | n/a | 0.9 ms | n/a | 0.6 ms |
| Sort, 20,000 | n/a | 1.0 ms | n/a | 0.7 ms |
| Identity, 5 MB | n/a | 0.7 ms | n/a | 0.5 ms |
| Depth 3,000 | n/a | 0.8 ms | n/a | 0.5 ms |
| group-adjacent, 50,000 | n/a | 1.0 ms | n/a | 0.9 ms |
| analyze-string, 5 MB log | n/a | 0.9 ms | n/a | 0.6 ms |
| xsl:iterate totals, 100,000 | n/a | 1.1 ms | n/a | 0.7 ms |
| json-to-xml, 5 MB JSON | n/a | 1.0 ms | n/a | 0.7 ms |
| parse-json, 5 MB JSON | n/a | 0.9 ms | n/a | 0.7 ms |
| xml-to-json, 5 MB JSON | n/a | 0.8 ms | n/a | 0.7 ms |
| serialize as JSON, 29,000 maps | n/a | 0.9 ms | n/a | 0.9 ms |
| 100,000-entry map + lookups | n/a | 0.9 ms | n/a | 0.7 ms |
| sort() with a key, 20,000 | n/a | 0.8 ms | n/a | 0.6 ms |
| fold-left into a map, 20,000 | n/a | 1.1 ms | n/a | 1.0 ms |
| Accumulators, 5 MB | n/a | 1.3 ms | n/a | 1.2 ms |
| xsl:merge, 2 × 50,000 | n/a | 1.3 ms | n/a | 1.0 ms |
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
| 1.0 package (`src/index.js`) | 143.5 kB | 45.5 kB | 39.8 kB | 30 ms | 6.0 ms |
| xslt3 (`packages/xslt3/src/index.js`) | 323.9 kB | 111.2 kB | 95.1 kB | 75 ms | 22 ms |
<!-- /bench:xslt-startup -->

### XSLT engines peak memory

<!-- bench:xslt-memory -->
| Scenario | 1.0 package, jsdom | xslt3, jsdom | 1.0 package, xmldom | xslt3, xmldom |
| --- | --- | --- | --- | --- |
| Issue #9 catalogue (3 MB HTML) | 654 MB | 605 MB | 485 MB | 444 MB |
| apply-templates item[@id], 8,000 | 270 MB | 251 MB | 186 MB | 203 MB |
| Muenchian grouping, 8,000 | 253 MB | 274 MB | 151 MB | 150 MB |
| xsl:number level="any", 8,000 | 237 MB | 263 MB | 129 MB | 146 MB |
| following-sibling::x[1], 8,000 | 249 MB | 203 MB | 152 MB | 112 MB |
| Sort 20,000 by two keys | 301 MB | 282 MB | 238 MB | 233 MB |
| Identity transform, 5 MB | 660 MB | 697 MB | 536 MB | 567 MB |
| call-template depth 3,000 | 208 MB | 188 MB | 104 MB | 101 MB |
| 100 MB text result | 654 MB | 279 MB | 461 MB | 231 MB |
| Catalogue | n/a | 592 MB | n/a | 428 MB |
| Grouping, 8,000 | n/a | 210 MB | n/a | 113 MB |
| Numbering, 8,000 | n/a | 219 MB | n/a | 113 MB |
| Sort, 20,000 | n/a | 283 MB | n/a | 234 MB |
| Identity, 5 MB | n/a | 651 MB | n/a | 522 MB |
| Depth 3,000 | n/a | 193 MB | n/a | 77 MB |
| group-adjacent, 50,000 | n/a | 336 MB | n/a | 278 MB |
| analyze-string, 5 MB log | n/a | 333 MB | n/a | 286 MB |
| xsl:iterate totals, 100,000 | n/a | 372 MB | n/a | 332 MB |
| json-to-xml, 5 MB JSON | n/a | 1716 MB | n/a | 2254 MB |
| parse-json, 5 MB JSON | n/a | 611 MB | n/a | 557 MB |
| xml-to-json, 5 MB JSON | n/a | 1294 MB | n/a | 862 MB |
| serialize as JSON, 29,000 maps | n/a | 423 MB | n/a | 392 MB |
| 100,000-entry map + lookups | n/a | 351 MB | n/a | 299 MB |
| sort() with a key, 20,000 | n/a | 284 MB | n/a | 198 MB |
| fold-left into a map, 20,000 | n/a | 283 MB | n/a | 165 MB |
| Accumulators, 5 MB | n/a | 638 MB | n/a | 600 MB |
| xsl:merge, 2 × 50,000 | n/a | 403 MB | n/a | 364 MB |
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

- **One XSLT 1.0 stylesheet is pathological on xslt3: `xsl:number
  level="any"`.** For every numbered node xslt3 walks back through all
  preceding nodes and tests the `count` pattern on each
  (`numberAny()` in `packages/xslt3/src/xslt/runtime/numbering.js`), which
  is quadratic: 8,000 numbered elements take about 41 s on jsdom and 10 s
  on xmldom, against 84 ms and 29 ms in the 1.0 package. It dominates the
  geometric means in the headline; without it, xslt3 runs the 1.0
  stylesheets faster than the 1.0 package on both DOMs. The rewrite with
  `xsl:iterate` takes 26 ms.
- **On the other 1.0 stylesheets xslt3 is as fast or faster.** It is 2 to
  7 times faster on sorting, `following-sibling::x[1]` in a loop,
  recursion and the 100 MB text result (which also peaks at 280 MB of
  memory instead of 650 MB on jsdom); the catalogue, the identity transform
  and Muenchian grouping are within 20%, because building and serializing
  the result tree dominates them.
- **Rewriting pays off where the 1.0 idiom was a workaround.**
  `xsl:for-each-group` instead of Muenchian keys is about 4 times faster on
  the grouping scenario and 1.5 to 1.7 times on the catalogue;
  `on-no-match="shallow-copy"` saves 20% (jsdom) to 33% (xmldom) on the
  identity transform; `sort()` with a key function costs about the same as
  two `xsl:sort` keys.
- **JSON**: `parse-json()` reads 5 MB of JSON 6 times faster than
  `json-to-xml()` on jsdom and with a third of the memory: the XML
  representation of the JSON is a DOM tree of hundreds of thousands of
  elements, and
  the json-to-xml processes peak at 1.7 to 2.3 GB. A principal result that
  is a map or an array (`xsl:output method="json"`, a raw result) is not
  supported yet (XTDE0450), so the JSON output scenario serializes with
  `serialize(..., map { 'method': 'json' })` into a text result.
- **jsdom or xmldom**: both engines usually run 1.5 to 3 times faster on
  @xmldom/xmldom than on jsdom; the ranking of the engines does not change.
- **Compiling** a stylesheet takes 0.5 to 2 ms with either engine, so
  reusing a compiled stylesheet matters only for small transformations.
- **Start-up**: the xslt3 bundle is 2.4 times the 1.0 package's (111 kB
  against 45 kB gzip) and takes 2.5 times as long to import from source in
  Node.js (75 ms against 30 ms); the 1.0 package does not load it unless
  asked to (see [XSLT3.md](XSLT3.md), "Opt-in bridge").
- xslt3 is in development (`0.0.0`), and the run is marked provisional:
  it was recorded while other processes used the CPU. Re-run on an idle
  machine before quoting single numbers.
