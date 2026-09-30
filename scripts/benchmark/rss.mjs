/**
 * Preloaded with `node --import` into the CLI runs of the benchmark: writes
 * the peak resident set size of the process to stderr when it exits, so the
 * runner can record the memory of a process it did not write.
 *
 * @module scripts/benchmark/rss
 */

process.on("exit", () => {
  process.stderr.write(`\nBENCH_MAXRSS_KB=${process.resourceUsage().maxRSS}\n`);
});
