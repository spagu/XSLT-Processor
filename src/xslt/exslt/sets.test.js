/**
 * EXSLT sets and common module tests. Expected values follow libexslt
 * `sets.c` / `common.c` and the libxml2 node-set primitives.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { XPathEvaluator } from "../../xpath/evaluator.js";
import { parseXML } from "../harness.test.js";
import { assertValues, runTemplate, valueOf } from "./exsltHarness.test.js";
import { inDocumentOrder } from "./arguments.js";
import { objectType } from "./common.js";

const XML = "<r><n>b</n><n>a</n><n>b</n><n>c</n><m>z</m></r>";

describe("set:difference() / set:intersection()", () => {
  it("should follow libexslt on a table", () => {
    assertValues(
      [
        ["str:concat(set:difference(//n, //n[2]))", "bbc"],
        ["str:concat(set:difference(//n, //none))", "babc"],
        ["count(set:difference(//none, //n))", "0"],
        ["str:concat(set:intersection(//n, //n[position() > 2] | //m))", "bc"],
        ["count(set:intersection(//n, //m))", "0"],
      ],
      { xml: XML },
    );
  });
});

describe("set:distinct()", () => {
  it("should keep the first node of each string value", () => {
    assertValues(
      [
        ["str:concat(set:distinct(//n))", "bac"],
        ["count(set:distinct(//n))", "3"],
        ["count(set:distinct(//n)[1]/following-sibling::n)", "3"],
        ["count(set:distinct(//none))", "0"],
      ],
      { xml: XML },
    );
  });
});

describe("set:has-same-node()", () => {
  it("should tell whether the node-sets share a node", () => {
    assertValues(
      [
        ["set:has-same-node(//n, //n[3])", "true"],
        ["set:has-same-node(//n, //m)", "false"],
        ["set:has-same-node(//none, //n)", "false"],
        ["set:has-same-node(//n, //none)", "false"],
      ],
      { xml: XML },
    );
  });
});

describe("set:leading() / set:trailing()", () => {
  it("should split around the first node of the second node-set", () => {
    assertValues(
      [
        ["str:concat(set:leading(//n, //n[3]))", "ba"],
        ["str:concat(set:trailing(//n, //n[3]))", "c"],
        ["str:concat(set:leading(//n, //n[4] | //n[2]))", "b"],
        ["str:concat(set:trailing(//n, //n[4] | //n[2]))", "bc"],
        ["str:concat(set:leading(//n, //none))", "babc"],
        ["str:concat(set:trailing(//n, //none))", "babc"],
        ["count(set:leading(//n, //m))", "0"],
        ["count(set:trailing(//n, //m))", "0"],
        ["count(set:leading(//n, //n[1]))", "0"],
        ["count(set:trailing(//n, //n[4]))", "0"],
      ],
      { xml: XML },
    );
  });
});

describe("sets argument checks", () => {
  it("should reject non node-sets and wrong arity", () => {
    assert.throws(
      () => valueOf("set:distinct('a')"),
      /set:distinct\(\) expects a node-set/,
    );
    assert.throws(
      () => valueOf("set:leading(/*)"),
      /set:leading\(\) expects 2/,
    );
    assert.throws(() => valueOf("set:difference(/*, 1)"), /expects a node-set/);
  });

  it("should sort and deduplicate node-sets", () => {
    const [first, second] = parseXML(XML).documentElement.childNodes;
    assert.deepStrictEqual(
      inDocumentOrder(new XPathEvaluator(), [second, first, second]),
      [first, second],
    );
  });
});

describe("exsl:object-type()", () => {
  it("should name the type of each XPath object", () => {
    assertValues(
      [
        ["exsl:object-type('a')", "string"],
        ["exsl:object-type(1)", "number"],
        ["exsl:object-type(1 = 1)", "boolean"],
        ["exsl:object-type(//n)", "node-set"],
        ["exsl:object-type(//none)", "node-set"],
        ["exsl:object-type(str:tokenize('a b'))", "node-set"],
        ["exsl:object-type(exsl:node-set('a'))", "node-set"],
      ],
      { xml: XML },
    );
  });

  it("should name a result tree fragment RTF", () => {
    assert.strictEqual(
      runTemplate(
        '<xsl:variable name="v"><a/></xsl:variable><xsl:value-of select="exsl:object-type($v)"/>,<xsl:value-of select="exsl:object-type(exsl:node-set($v))"/>',
      ),
      "RTF,node-set",
    );
  });

  it("should reject values that are not XPath objects", () => {
    assert.throws(() => objectType(undefined), /invalid argument/);
    assert.throws(() => valueOf("exsl:object-type()"), /expects 1/);
  });
});
