/**
 * Unit tests of the qt3tests catalog model and the assertion model
 * (fixture XML, not the real suite).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expectedOutcome, parseResult } from "./assertionModel.mjs";
import { resolveEnvironment } from "./environment.mjs";
import {
  loadQt3Suite,
  parseQt3Catalog,
  parseQt3TestSet,
} from "./qt3Catalog.mjs";
import { parseXml } from "./xmlUtil.mjs";

const QT3 = 'xmlns="http://www.w3.org/2010/09/qt-fots-catalog"';
const qt3Catalog = `<catalog ${QT3} test-suite="FOTS" version="3.1">
  <environment name="works">
    <source role="." file="docs/works.xml" uri="http://x/works.xml"><description>d</description></source>
    <source role="$staff" file="docs/staff.xml" validation="strict"/>
    <namespace prefix="ma" uri="http://example.com/ma"/>
    <static-base-uri uri="http://example.com/base/"/>
  </environment>
  <environment name="dyn">
    <param name="zero" select="0" as="xs:integer" declared="true"/>
    <decimal-format name="f" decimal-separator="|"/>
    <collation uri="http://example.com/caseblind" default="true"/>
    <resource file="res/a.json" uri="http://x/a.json" media-type="application/json" encoding="utf-8"/>
    <collection uri="http://x/c"><source file="docs/a.xml"/><query>1 to 3</query></collection>
    <schema uri="http://x/s" file="docs/s.xsd"/>
    <context-item select="'London'"/>
  </environment>
  <test-set name="fn-abs" file="fn/abs.xml"/>
</catalog>`;

const qt3Set = `<?xml version="1.0" encoding="UTF-8"?>
<test-set ${QT3} name="fn-abs">
  <description>abs</description>
  <dependency type="spec" value="XP30+ XQ30+"/>
  <environment name="local"><namespace prefix="p" uri="http://p"/></environment>
  <test-case name="abs-1">
    <description> First </description>
    <environment ref="works"/>
    <dependency type="feature" value="higherOrderFunctions" satisfied="false"/>
    <test>abs(-1)</test>
    <result><any-of><assert-eq>1</assert-eq><error code="FOAR0002"/></any-of></result>
  </test-case>
  <test-case name="abs-2">
    <environment ref="local"/>
    <test file="abs-2.xq"/>
    <module uri="http://m" file="m.xq"/>
    <result><assert-string-value normalize-space="true"> 1 </assert-string-value></result>
  </test-case>
  <test-case name="abs-3">
    <environment><source role="." file="inline.xml"/></environment>
    <test>.</test>
    <result><assert-xml file="abs-3.out" ignore-prefixes="true"/></result>
  </test-case>
  <test-case name="abs-4">
    <environment ref="missing"/>
    <test>1</test>
    <result><serialization-matches flags="i">a</serialization-matches></result>
  </test-case>
  <test-case name="abs-5"><test>1</test></test-case>
</test-set>`;

describe("qt3 catalog", () => {
  it("reads shared environments and test set entries", () => {
    const catalog = parseQt3Catalog(qt3Catalog, "/suite");
    assert.equal(catalog.version, "3.1");
    assert.deepEqual(catalog.testSets, [
      { name: "fn-abs", file: "/suite/fn/abs.xml" },
    ]);
    const works = catalog.environments.get("works");
    assert.deepEqual(works.sources[0], {
      role: ".",
      file: "/suite/docs/works.xml",
      content: undefined,
      uri: "http://x/works.xml",
      validation: undefined,
      select: undefined,
    });
    assert.equal(works.sources[1].validation, "strict");
    assert.deepEqual(works.namespaces, [
      { prefix: "ma", uri: "http://example.com/ma" },
    ]);
    assert.equal(works.staticBaseUri, "http://example.com/base/");
    const dyn = catalog.environments.get("dyn");
    assert.equal(dyn.params[0].name, "zero");
    assert.equal(dyn.params[0].declared, true);
    assert.deepEqual(dyn.decimalFormats, [
      { name: "f", "decimal-separator": "|" },
    ]);
    assert.deepEqual(dyn.collations, [
      { uri: "http://example.com/caseblind", default: true },
    ]);
    assert.equal(dyn.resources[0].file, "/suite/res/a.json");
    assert.equal(dyn.resources[0].mediaType, "application/json");
    assert.deepEqual(dyn.collections[0].queries, ["1 to 3"]);
    assert.equal(dyn.collections[0].sources[0].file, "/suite/docs/a.xml");
    assert.equal(dyn.schemas[0].file, "/suite/docs/s.xsd");
    assert.equal(dyn.contextItem, "'London'");
    assert.equal(dyn.staticBaseUri, undefined);
  });

  it("reads test cases with dependencies, environments, tests and results", () => {
    const shared = parseQt3Catalog(qt3Catalog, "/suite").environments;
    const set = parseQt3TestSet(qt3Set, "/suite/fn/abs.xml", shared);
    assert.equal(set.name, "fn-abs");
    assert.equal(set.family, "fn");
    assert.deepEqual(set.dependencies, [
      { type: "spec", value: "XP30+ XQ30+", satisfied: true },
    ]);
    const [one, two, three, four, five] = set.testCases;
    assert.equal(one.id, "fn-abs/abs-1");
    assert.equal(one.description, "First");
    assert.equal(one.environment, shared.get("works"));
    assert.deepEqual(one.dependencies, [
      { type: "feature", value: "higherOrderFunctions", satisfied: false },
    ]);
    assert.equal(one.test.text, "abs(-1)");
    assert.equal(one.result.kind, "any-of");
    assert.deepEqual(
      one.result.children.map((c) => c.kind),
      ["assert-eq", "error"],
    );
    assert.equal(one.result.children[1].code, "FOAR0002");
    assert.equal(two.environment.namespaces[0].prefix, "p");
    assert.equal(two.test.file, "/suite/fn/abs-2.xq");
    assert.equal(two.hasModules, true);
    assert.equal(two.result.normalizeSpace, true);
    assert.equal(two.description, "");
    assert.equal(three.environment.sources[0].file, "/suite/fn/inline.xml");
    assert.equal(three.result.file, "/suite/fn/abs-3.out");
    assert.equal(three.result.ignorePrefixes, true);
    assert.equal(four.environment, null);
    assert.match(four.environmentError, /Unknown environment "missing"/);
    assert.equal(four.result.flags, "i");
    assert.equal(five.result, null);
    assert.equal(five.environment, null);
  });

  it("loads a suite from disk, decoding each file's encoding", () => {
    const dir = mkdtempSync(join(tmpdir(), "qt3-fixture-"));
    try {
      mkdirSync(join(dir, "fn"));
      writeFileSync(join(dir, "catalog.xml"), qt3Catalog);
      const latin = qt3Set
        .replace('encoding="UTF-8"', 'encoding="iso-8859-1"')
        .replace("abs</description>", "abé</description>");
      writeFileSync(join(dir, "fn", "abs.xml"), Buffer.from(latin, "latin1"));
      const suite = loadQt3Suite(dir);
      assert.equal(suite.testSets.length, 1);
      assert.equal(suite.testSets[0].testCases.length, 5);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("assertion model", () => {
  const result = (xml) =>
    parseResult(parseXml(`<result>${xml}</result>`).documentElement, "/b");

  it("reads attributes of every assertion kind", () => {
    const tree = result(
      '<all-of><error code="*"/><assert-serialization method="html">x</assert-serialization>' +
        "<not><assert-empty/></not><assert-count>3</assert-count></all-of>",
    );
    assert.equal(tree.children[0].code, "*");
    assert.equal(tree.children[1].method, "html");
    assert.equal(tree.children[1].ignorePrefixes, false);
    assert.equal(tree.children[2].children[0].kind, "assert-empty");
    assert.equal(tree.children[3].value, "3");
    assert.equal(result(""), null);
    assert.equal(parseResult(undefined, "/"), null);
  });

  it("summarizes the expected outcome", () => {
    assert.deepEqual(expectedOutcome(result('<error code="XPST0003"/>')), {
      errorCodes: ["XPST0003"],
      acceptsValue: false,
    });
    assert.deepEqual(
      expectedOutcome(result("<any-of><error/><assert-true/></any-of>")),
      {
        errorCodes: ["*"],
        acceptsValue: true,
      },
    );
    assert.deepEqual(expectedOutcome(null), {
      errorCodes: [],
      acceptsValue: true,
    });
  });

  it("resolves environments", () => {
    assert.equal(resolveEnvironment(undefined, new Map(), new Map()), null);
    const inline = { sources: [] };
    assert.equal(resolveEnvironment(inline, new Map(), new Map()), inline);
    const shared = { name: "s" };
    assert.equal(
      resolveEnvironment({ ref: "s" }, new Map(), new Map([["s", shared]])),
      shared,
    );
  });
});
