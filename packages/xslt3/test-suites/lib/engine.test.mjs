import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { pathToFileURL, URL } from "node:url";
import * as engine from "../../src/xpath/index.js";
import {
  ENGINE_MODULE,
  loadAdapter,
  PARSER_MODULE,
  toBoolean,
  toText,
} from "./adapter.mjs";
import { NotRunError } from "./assertions.mjs";
import { createEngineAdapter, parseXml } from "./engineAdapter.mjs";
import { serializeXml } from "./serialize.mjs";

describe("the engine adapter", () => {
  it("is the default adapter when the engine exists", async () => {
    const adapter = await loadAdapter(undefined, PARSER_MODULE, ENGINE_MODULE);
    assert.equal(adapter.name, "xslt3");
    const dir = mkdtempSync(join(tmpdir(), "engine-"));
    try {
      const fake = join(dir, "engine.mjs");
      writeFileSync(fake, "export const other = 1;");
      const fallback = await loadAdapter(undefined, PARSER_MODULE, fake);
      assert.equal(fallback.name, "xslt3-parser");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("parses with static analysis", () => {
    const adapter = createEngineAdapter(engine);
    assert.equal(adapter.parse("$x + 1", { variables: ["x"] }), true);
    assert.throws(() => adapter.parse("$x", {}), { code: "XPST0008" });
    const namespaces = [{ prefix: "p", uri: "urn:p" }];
    assert.equal(adapter.parse("//p:x", { namespaces }), true);
    assert.throws(() => adapter.parse("//q:x", { namespaces }), {
      code: "XPST0081",
    });
  });

  it("evaluates with variables, context item and documents", () => {
    const adapter = createEngineAdapter(engine);
    const doc = adapter.loadDocument({
      content: "<r><a>1</a></r>",
      uri: "d.xml",
    });
    assert.equal(doc.documentURI, "d.xml");
    const context = {
      variables: { v: 2n },
      contextItem: doc,
      documents: { "d.xml": doc },
      staticBaseUri: "http://example.org/x/",
    };
    assert.equal(
      toText(adapter.evaluateXPath("string(/r/a) || $v", context)),
      "12",
    );
    assert.equal(
      toBoolean(adapter.evaluateXPath("doc('d.xml') is /", context)),
      true,
    );
    assert.throws(() => adapter.evaluateXPath("doc('other.xml')", context), {
      code: "FODC0002",
    });
    const file = new URL("../constants.mjs", import.meta.url);
    assert.throws(() => adapter.evaluateXPath(`doc('${file.href}')`, {}), {
      code: "FODC0002",
    });
    assert.equal(toBoolean(adapter.evaluateXPath("true()", {})), true);
    assert.equal(toBoolean([{ type: {}, value: false }]), false);
  });

  it("loads source files once and normalizes them", () => {
    const dir = mkdtempSync(join(tmpdir(), "engine-"));
    try {
      const file = join(dir, "doc.xml");
      writeFileSync(file, '﻿<?xml version="1.0"?>\n<!--c-->\n<r/>\n');
      const adapter = createEngineAdapter(engine);
      const doc = adapter.loadDocument({ file });
      assert.equal(adapter.loadDocument({ file }), doc);
      assert.deepEqual(
        [...doc.childNodes].map((n) => n.nodeType),
        [8, 1],
      );
      assert.equal(doc.documentURI, pathToFileURL(file).href);
      const loaded = adapter.evaluateXPath(
        `doc('${pathToFileURL(file).href}')`,
        {},
      );
      assert.equal(loaded[0], doc);
      assert.throws(() => adapter.loadDocument({}), { code: "FODC0002" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reports XML that is not well-formed as FODC0002", () => {
    assert.throws(() => parseXml("<a>"), { code: "FODC0002" });
    assert.throws(() => parseXml("<a></b>"), { code: "FODC0002" });
  });

  it("serializes as XML only", () => {
    const adapter = createEngineAdapter(engine);
    assert.equal(adapter.serialize(engine.evaluateXPath("1, 2"), {}), "1 2");
    assert.equal(adapter.serialize([], { method: "xml" }), "");
    assert.throws(() => adapter.serialize([], { method: "json" }), NotRunError);
  });
});

describe("XML serialization of results", () => {
  it("normalizes sequences", () => {
    const doc = parseXml("<!DOCTYPE r><r a='1'>x<b/></r>");
    const items = engine.evaluateXPath("(1, 'a', /r/b, [2, [3]], /)", doc);
    assert.equal(serializeXml(items), '1 a<b/>2 3<r a="1">x<b/></r>');
    assert.equal(serializeXml(engine.evaluateXPath("1")[0]), "1");
  });

  it("rejects attributes, namespace nodes, maps and functions", () => {
    const doc = parseXml("<r a='1'/>");
    for (const expr of ["/r/@a", "/r/namespace::*", "map{}", "count#1"]) {
      assert.throws(() => serializeXml(engine.evaluateXPath(expr, doc)), {
        code: "SENR0001",
      });
    }
  });
});
