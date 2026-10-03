/* global AbortSignal -- Node.js global */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  approvedReferences,
  fetchStats,
  formatDate,
  GITHUB_REPO_URL,
  HOME_LIMIT,
  loadStats,
  NPM_DOWNLOADS_URL,
  referencesData,
} from "./references.mjs";

const rootDir = join(import.meta.dirname, "..", "..");
const source = JSON.parse(
  readFileSync(join(rootDir, "site", "references", "references.json"), "utf8"),
);

/** A fetch stub answering each URL with the given JSON body or status. */
function stubFetch(bodies, calls = []) {
  return async (url, init) => {
    calls.push({ url, init });
    const body = bodies[url];
    return typeof body === "number"
      ? { ok: false, status: body }
      : { ok: true, status: 200, json: async () => body };
  };
}

const apis = {
  [NPM_DOWNLOADS_URL]: { downloads: 12345 },
  [GITHUB_REPO_URL]: { stargazers_count: 7 },
};

describe("approved references", () => {
  it("publishes only entries with approved: true", () => {
    const entries = [
      { name: "A", url: "https://www.a.test/x", use: "a", approved: true },
      { name: "B", url: "https://b.test", use: "b", approved: false },
      { name: "C", url: "https://c.test", use: "c" },
      { name: "D", url: "https://d.test", use: "d", approved: "true" },
    ];
    assert.deepEqual(approvedReferences(entries), [
      { name: "A", url: "https://www.a.test/x", domain: "a.test", use: "a" },
    ]);
  });

  it("keeps the pending entries of the data file off the site", () => {
    const pending = source.usedBy.filter((e) => e.approved !== true);
    assert.ok(pending.length > 0, "the filter is exercised by real data");
    const published = approvedReferences(source.usedBy).map((e) => e.name);
    assert.deepEqual(published, ["Schema Resume", "Job Tailor"]);
    for (const entry of pending) assert.ok(!published.includes(entry.name));
  });

  it("states the conformance numbers the documentation states", () => {
    const docs = ["docs/CONFORMANCE.md", "docs/XSLT3.md"]
      .map((path) => readFileSync(join(rootDir, path), "utf8"))
      .join("\n");
    const claims = source.builtOn
      .flatMap((e) => e.detail.match(/[\d,]+ of [\d,]+/g) ?? [])
      .map((claim) => claim.split(" of "));
    assert.equal(claims.length, 3);
    for (const [passed, total] of claims) {
      assert.match(
        docs,
        new RegExp(`(${passed} of ${total}|${total} \\| ${passed})`),
      );
    }
  });
});

describe("formatDate", () => {
  it("writes day, month name and year", () => {
    assert.equal(formatDate("2026-10-03"), "3 October 2026");
  });
});

describe("fetchStats", () => {
  it("reads the downloads and the stars with a time limit", async () => {
    const calls = [];
    const stats = await fetchStats({
      fetchImpl: stubFetch(apis, calls),
      now: new Date("2026-10-03T12:00:00Z"),
    });
    assert.deepEqual(stats, {
      downloads: 12345,
      stars: 7,
      fetchedAt: "2026-10-03",
    });
    assert.deepEqual(
      calls.map((c) => c.url),
      [NPM_DOWNLOADS_URL, GITHUB_REPO_URL],
    );
    assert.ok(calls.every((c) => c.init.signal instanceof AbortSignal));
  });

  it("fails when a request outlasts the time limit", async () => {
    const hang = (url, { signal }) =>
      new Promise((resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason));
      });
    await assert.rejects(
      fetchStats({ fetchImpl: hang, timeoutMs: 20 }),
      /timed out|aborted/i,
    );
  });

  it("fails on an HTTP error or an unexpected body", async () => {
    await assert.rejects(
      fetchStats({ fetchImpl: stubFetch({ ...apis, [GITHUB_REPO_URL]: 403 }) }),
      /HTTP 403/,
    );
    await assert.rejects(
      fetchStats({
        fetchImpl: stubFetch({ ...apis, [NPM_DOWNLOADS_URL]: {} }),
      }),
      /unexpected API response/,
    );
  });
});

describe("loadStats", () => {
  const saved = { downloads: 400, stars: 2, fetchedAt: "2026-09-01" };
  const fresh = { downloads: 500, stars: 3, fetchedAt: "2026-10-03" };

  it("saves and returns freshly fetched numbers", async () => {
    const written = [];
    const stats = await loadStats({
      offline: false,
      readCache: () => saved,
      writeCache: (s) => written.push(s),
      fetchFresh: async () => fresh,
    });
    assert.deepEqual(stats, fresh);
    assert.deepEqual(written, [fresh]);
  });

  it("falls back to the saved numbers when fetching fails", async () => {
    const logged = [];
    const stats = await loadStats({
      offline: false,
      readCache: () => saved,
      writeCache: () => assert.fail("nothing to save"),
      fetchFresh: async () => {
        throw new Error("The operation was aborted due to timeout");
      },
      log: (m) => logged.push(m),
    });
    assert.deepEqual(stats, saved);
    assert.match(logged[0], /timeout\); using saved values/);
  });

  it("does not fetch offline, and returns null without saved numbers", async () => {
    const stats = await loadStats({
      offline: true,
      readCache: () => null,
      writeCache: () => assert.fail("nothing to save"),
      fetchFresh: async () => assert.fail("no fetch offline"),
    });
    assert.equal(stats, null);
  });
});

describe("referencesData", () => {
  it("formats the numbers and the date for the page", () => {
    const data = referencesData({
      source,
      stats: { downloads: 21770, stars: 2, fetchedAt: "2026-10-03" },
    });
    assert.equal(data.usedBy.length, 2);
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
