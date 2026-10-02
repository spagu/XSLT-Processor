import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ORIGIN, launchBrowserEngine, serveFile } from "./browser.js";
import { createFixture, removeFixture } from "../../../test/fixtures.js";
import { SAMPLE_PROJECT } from "../../../test/sample.js";

/** A Playwright route for a URL that records how it was answered. */
function fakeRoute(url) {
  const route = { answer: null };
  route.request = () => ({ url: () => url });
  route.fulfill = async (answer) => {
    route.answer = answer;
  };
  return route;
}

/** A playwright module whose page records what it was asked. */
function fakePlaywright(log) {
  const page = {
    goto: async (url) => log.push(["goto", url]),
    evaluate: async (_fn, arg) => {
      log.push(["evaluate", arg]);
      return "<r/>";
    },
  };
  const context = {
    route: async (pattern, handler) => {
      log.push(["route", pattern, typeof handler]);
      const blank = fakeRoute(`${ORIGIN}/__xslt-migrate-test__.html`);
      await handler(blank);
      log.push(["served", blank.answer.contentType]);
    },
    newPage: async () => page,
  };
  const browser = {
    version: () => "153.0",
    newContext: async () => context,
    close: async () => log.push(["close"]),
  };
  const launch = async (options) => {
    log.push(["launch", options]);
    return browser;
  };
  return { default: { chromium: { launch } } };
}

describe("serveFile", () => {
  it("serves project files, the blank page, and 404 outside the project", async () => {
    const dir = await createFixture({
      "a b/c.xml": "<c/>",
      "p.html": "<p>",
      "s.js": "x",
    });
    try {
      const serve = async (path) => {
        const route = fakeRoute(`${ORIGIN}${path}`);
        await serveFile(dir, route);
        return route.answer;
      };
      const xml = await serve("/a%20b/c.xml");
      assert.deepEqual(
        [xml.contentType, String(xml.body)],
        ["application/xml", "<c/>"],
      );
      assert.equal((await serve("/p.html")).contentType, "text/html");
      assert.equal((await serve("/s.js")).contentType, "text/javascript");
      assert.match(
        (await serve("/x/__xslt-migrate-test__.html")).body,
        /<!doctype html>/,
      );
      assert.equal((await serve("/gone.xml")).status, 404);
      assert.equal((await serve("/../../etc/passwd")).status, 404);
    } finally {
      await removeFixture(dir);
    }
  });
});

describe("launchBrowserEngine", () => {
  it("opens a page next to the stylesheet and runs the pair there", async () => {
    const dir = await createFixture({ ...SAMPLE_PROJECT, "top.xsl": "<x/>" });
    try {
      const log = [];
      const engine = await launchBrowserEngine(fakePlaywright(log), dir);
      assert.equal(
        engine.name,
        "Chromium 153.0 (native XSLTProcessor, Playwright)",
      );
      assert.equal(
        await engine.transform({
          xml: "public/invoice.xml",
          xsl: "styles/invoice.xsl",
          params: { a: "1" },
        }),
        "<r/>",
      );
      await engine.transform({
        xml: "public/invoice.xml",
        xsl: "top.xsl",
        params: {},
      });
      await engine.close();
      assert.deepEqual(log[0], [
        "launch",
        { args: ["--enable-blink-features=XSLT"] },
      ]);
      assert.deepEqual(log[1], ["route", `${ORIGIN}/**`, "function"]);
      assert.deepEqual(log[2], ["served", "text/html"]);
      assert.deepEqual(log[3], [
        "goto",
        `${ORIGIN}/styles/__xslt-migrate-test__.html`,
      ]);
      assert.deepEqual(log[4][1], {
        xml: `${ORIGIN}/public/invoice.xml`,
        xsl: `${ORIGIN}/styles/invoice.xsl`,
        params: { a: "1" },
        textMethod: false,
      });
      assert.deepEqual(log[5], [
        "goto",
        `${ORIGIN}/__xslt-migrate-test__.html`,
      ]);
      assert.deepEqual(log.at(-1), ["close"]);
    } finally {
      await removeFixture(dir);
    }
  });

  it(
    "runs on real Chromium",
    {
      skip:
        process.env.MIGRATE_TEST_BROWSER !== "1" &&
        "set MIGRATE_TEST_BROWSER=1",
    },
    async () => {
      const dir = await createFixture({
        ...SAMPLE_PROJECT,
        "top.xsl":
          '<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform"><xsl:output method="text"/><xsl:template match="/">T<xsl:value-of select="count(//order)"/></xsl:template></xsl:stylesheet>',
      });
      const engine = await launchBrowserEngine(
        await import("@playwright/test"),
        dir,
      );
      try {
        assert.match(engine.name, /^Chromium \d+/);
        const html = await engine.transform({
          xml: "public/invoice.xml",
          xsl: "styles/invoice.xsl",
          params: {},
        });
        assert.match(html, /<total>123\.00<\/total>/);
        const text = await engine.transform({
          xml: "public/orders.xml",
          xsl: "top.xsl",
          params: {},
        });
        assert.equal(text.trim(), "T2");
      } finally {
        await engine.close();
        await removeFixture(dir);
      }
    },
  );
});
