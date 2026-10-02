/**
 * Unit tests of the xslt30-test catalog model (fixture XML).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadXsltSuite,
  parseInvocation,
  parseXsltTestSet,
} from "./xsltCatalog.mjs";

const XSLT = 'xmlns="http://www.w3.org/2012/10/xslt-test-catalog"';

const xsltSet = `<test-set ${XSLT} name="format-number">
  <environment name="env1">
    <source role="."><content><![CDATA[<doc/>]]></content></source>
    <stylesheet file="common.xsl"/>
    <package file="p.xsl" role="secondary" uri="http://p" package-version="1.0"/>
  </environment>
  <dependencies><spec value="XSLT20+"/></dependencies>
  <test-case name="fn-1">
    <description>d</description>
    <environment ref="env1"/>
    <dependencies><feature value="schema_aware" satisfied="false"/><enable_assertions/></dependencies>
    <test>
      <stylesheet file="fn-1.xsl"/>
      <param name="p" select="1" static="yes"/>
      <initial-template name="main"><param name="t" select="2" tunnel="yes"/></initial-template>
      <output serialize="yes" file="out.xml"/>
    </test>
    <result><all-of><assert>/out</assert><assert-message><assert-xml>m</assert-xml></assert-message></all-of></result>
  </test-case>
  <test-case name="fn-2">
    <environment ref="nope"/>
    <test><initial-mode name="m" select="/"/><initial-function name="f:f"/>
      <posture-and-sweep><xpath part="1">.</xpath></posture-and-sweep></test>
    <result><assert-result-document uri="r.xml"><assert-string-value>x</assert-string-value></assert-result-document></result>
  </test-case>
</test-set>`;

describe("xslt30-test catalog", () => {
  it("reads dependencies, environments and invocations", () => {
    const set = parseXsltTestSet(
      xsltSet,
      "/suite/tests/fn/format-number/_set.xml",
      "fn",
    );
    assert.equal(set.family, "fn");
    assert.deepEqual(set.dependencies, [
      { type: "spec", value: "XSLT20+", satisfied: true },
    ]);
    const [one, two] = set.testCases;
    assert.equal(one.id, "format-number/fn-1");
    assert.deepEqual(one.dependencies, [
      { type: "feature", value: "schema_aware", satisfied: false },
      { type: "enable_assertions", value: "true", satisfied: true },
    ]);
    assert.equal(one.environment.sources[0].content, "<doc/>");
    assert.equal(
      one.environment.stylesheets[0].file,
      "/suite/tests/fn/format-number/common.xsl",
    );
    assert.equal(one.environment.packages[0].packageVersion, "1.0");
    assert.equal(
      one.test.stylesheets[0].file,
      "/suite/tests/fn/format-number/fn-1.xsl",
    );
    assert.equal(one.test.params[0].static, true);
    assert.equal(one.test.initialTemplate.name, "main");
    assert.equal(one.test.initialTemplate.params[0].tunnel, true);
    assert.deepEqual(one.test.output, {
      file: "out.xml",
      path: "/suite/tests/fn/format-number/out.xml",
      serialize: "yes",
    });
    assert.equal(one.test.postureAndSweep, false);
    assert.equal(one.result.children[1].kind, "assert-message");
    assert.equal(one.result.children[1].children[0].kind, "assert-xml");
    assert.match(two.environmentError, /nope/);
    assert.equal(two.test.initialMode.select, "/");
    assert.equal(two.test.initialFunction.name, "f:f");
    assert.equal(two.test.postureAndSweep, true);
    assert.equal(two.test.output, undefined);
    assert.equal(two.result.uri, "r.xml");
  });

  it("treats a missing test element as an empty invocation", () => {
    assert.deepEqual(parseInvocation(undefined, "/"), {
      stylesheets: [],
      packages: [],
      params: [],
      postureAndSweep: false,
    });
    const set = parseXsltTestSet(
      `<test-set ${XSLT} name="s"><test-case name="t"/></test-set>`,
      "/x/s.xml",
    );
    assert.equal(set.family, "");
    assert.deepEqual(set.testCases[0].dependencies, []);
  });

  it("loads a suite from disk with the family from the tests/ directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "xslt30-fixture-"));
    try {
      mkdirSync(join(dir, "tests", "fn", "format-number"), { recursive: true });
      writeFileSync(
        join(dir, "catalog.xml"),
        `<catalog ${XSLT}><test-set name="format-number" file="tests/fn/format-number/_set.xml"/></catalog>`,
      );
      writeFileSync(
        join(dir, "tests", "fn", "format-number", "_set.xml"),
        xsltSet,
      );
      const suite = loadXsltSuite(dir);
      assert.equal(suite.testSets[0].family, "fn");
      assert.equal(suite.testSets[0].testCases.length, 2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
