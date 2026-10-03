/**
 * Saved site stats: what may be shown and logged from the cache file.
 *
 * Run: node --test site/scripts/references-stats.test.mjs
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validStats } from "./references.mjs";

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
