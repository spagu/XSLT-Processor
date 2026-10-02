import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { JSDOM } from "jsdom";
import { createDomTools } from "./dom.js";
import { NO_REFERENCE_REASON } from "./report.js";
import { runPair, runPairs } from "./run.js";
import { createFixture, removeFixture } from "../../test/fixtures.js";

const tools = createDomTools(JSDOM);
const fixed = (output) => async () => output;
const failing = (message) => async () => {
  throw new Error(`${message}\nsecond line`);
};

describe("runPair", () => {
  it("classifies MATCH, DIFFERENT, ERROR and SKIPPED", async () => {
    const dir = await createFixture({
      "a.xsl": '<xsl:stylesheet><xsl:output method="xml"/></xsl:stylesheet>',
    });
    try {
      const pair = { xml: "a.xml", xsl: "a.xsl", params: {}, skip: null };
      const run = (reference, tradik) =>
        runPair(pair, {
          reference: { name: "ref", ...reference },
          tradik: { tools, transform: tradik },
          rootDir: dir,
        });
      assert.equal(
        (await run({ transform: fixed("<a/>") }, fixed("<a></a>"))).status,
        "MATCH",
      );
      const different = await run(
        { transform: fixed("<a>1</a>") },
        fixed("<a>2</a>"),
      );
      assert.equal(different.status, "DIFFERENT");
      assert.equal(different.expectedOutput, "<a>1</a>");
      assert.deepEqual(await run({ transform: failing("bad") }, fixed("")), {
        xml: "a.xml",
        xsl: "a.xsl",
        params: {},
        status: "ERROR",
        engine: "ref",
        message: "bad",
      });
      const mine = await run({ transform: fixed("") }, failing("mine"));
      assert.deepEqual([mine.engine, mine.message], ["Tradik", "mine"]);
      assert.equal(
        (await run({ transform: null }, fixed(""))).reason,
        NO_REFERENCE_REASON,
      );
      const odd = await runPair(pair, {
        reference: { name: "ref", transform: () => Promise.reject("text") },
        tradik: { tools, transform: fixed("") },
        rootDir: dir,
      });
      assert.equal(odd.message, "text");
      const skipped = await runPair({ ...pair, skip: "why" }, {});
      assert.deepEqual([skipped.status, skipped.reason], ["SKIPPED", "why"]);
    } finally {
      await removeFixture(dir);
    }
  });
});

describe("runPairs", () => {
  it("runs the pairs in order", async () => {
    const order = [];
    const engines = {
      reference: { name: "ref", transform: null },
      tradik: { transform: async (pair) => order.push(pair.xml) },
      rootDir: ".",
    };
    const pairs = ["1", "2", "3"].map((xml) => ({
      xml,
      xsl: "x",
      params: {},
      skip: null,
    }));
    const results = await runPairs(pairs, engines);
    assert.deepEqual(order, ["1", "2", "3"]);
    assert.deepEqual(
      results.map((r) => r.xml),
      ["1", "2", "3"],
    );
  });
});
