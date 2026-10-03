/**
 * The results table of scripts/package-managers.mjs: one row per manager,
 * one column per check (✓, ✗, or - when not run), then the output of each
 * failed check.
 *
 * @module scripts/package-managers/report
 */

/**
 * Print the results table and the errors under it.
 *
 * @param {Array<{name: string, version: string, results: Array}>} rows - Rows
 * @returns {void}
 */
/**
 * The table mark of one check: passed, failed, or not run.
 *
 * @param {{ok: boolean}|undefined} found - The check's result, if it ran
 * @returns {string} "✓", "✗" or "-"
 */
function mark(found) {
  if (!found) return "-";
  return found.ok ? "✓" : "✗";
}

export function report(rows) {
  const checks = [
    ...new Set(rows.flatMap((row) => row.results.map((r) => r.check))),
  ];
  const header = ["manager", "version", ...checks];
  const lines = rows.map((row) => [
    row.name,
    row.version,
    ...checks.map((name) => mark(row.results.find((r) => r.check === name))),
  ]);
  const widths = header.map((h, i) =>
    Math.max(h.length, ...lines.map((l) => l[i].length)),
  );
  for (const line of [header, ...lines]) {
    console.log(line.map((cell, i) => cell.padEnd(widths[i])).join(" | "));
  }
  for (const row of rows) {
    for (const { check, ok, out } of row.results) {
      if (!ok) console.log(`\n✗ ${row.name} ${check}:\n${out.slice(-1500)}`);
    }
  }
}
