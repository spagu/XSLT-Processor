/**
 * Saved site stats: what may be shown and logged from the cache file.
 *
 * Run: node --test site/scripts/references-stats.test.mjs
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HOME_LIMIT, referencesData, validStats } from "./references.mjs";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const source = JSON.parse(
  readFileSync(join(rootDir, "site", "references", "references.json"), "utf8"),
);

describe("validStats", () => {
  it("keeps whole numbers and an ISO date, and drops anything else", () => {
    const good = {
      downloads: 1,
      stars: 2,
      fetchedAt: "2026-10-03",
      extra: "x",
    };
    assert.deepEqual(validStats(good), {
      downloads: 1,
      stars: 2,
      fetchedAt: "2026-10-03",
    });
    for (const bad of [
      null,
      { downloads: "1", stars: 2, fetchedAt: "2026-10-03" },
      { downloads: 1, stars: 2.5, fetchedAt: "2026-10-03" },
      { downloads: 1, stars: 2, fetchedAt: "3 Oct\nINJECTED" },
    ]) {
      assert.equal(validStats(bad), null);
    }
  });
});

describe("referencesData", () => {
  it("formats the numbers and the date for the page", () => {
    const data = referencesData({
      source,
      stats: { downloads: 21770, stars: 2, fetchedAt: "2026-10-03" },
    });
    assert.equal(
      data.usedBy.length,
      source.usedBy.filter((e) => e.approved === true).length,
    );
    assert.deepEqual(data.home, data.usedBy);
    assert.equal(data.builtOn, source.builtOn);
    assert.deepEqual(data.stats, {
      downloads: "21,770",
      stars: "2",
      fetchedAt: "2026-10-03",
      asOf: "3 October 2026",
    });
  });

  it("limits the home band and leaves the numbers out without stats", () => {
    const many = Array.from({ length: HOME_LIMIT + 2 }, (_, i) => ({
      name: `P${i}`,
      url: `https://p${i}.test`,
      use: "u",
      approved: true,
    }));
    const data = referencesData({
      source: { usedBy: many, builtOn: [] },
      stats: null,
    });
    assert.equal(data.usedBy.length, HOME_LIMIT + 2);
    assert.equal(data.home.length, HOME_LIMIT);
    assert.equal(data.stats, null);
  });
});
