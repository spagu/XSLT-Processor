import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DOMParser } from "@xmldom/xmldom";
import { FunctionItem } from "../../items/function.js";
import { QNameValue } from "../../xdm/qname.js";
import { evaluateXPath } from "../../xpath/index.js";
import { serialize, serializeToBytes } from "../index.js";
import { doubleText } from "./adaptive.js";

const doc = new DOMParser().parseFromString(
  '<r a="1&lt;"><!--c--><?p d?><e>x<f>y</f>&amp;</e></r>',
  "text/xml",
);
const run = (expr, params) => serialize(evaluateXPath(expr, doc), params);

describe("the adaptive output method", () => {
  const adaptive = (expr, params) =>
    run(expr, { method: "adaptive", ...params });

  it("writes atomic values", () => {
    assert.equal(
      adaptive(
        "('a\"b', xs:anyURI('u'), true(), false(), 1, 1.5, 1e0, -1.25e-3, xs:float(1), QName('urn:x', 'p:l'), xs:yearMonthDuration('P1Y'))",
      ),
      '"a""b"\n"u"\ntrue()\nfalse()\n1\n1.5\n1.0e0\n-1.25e-3\nxs:float("1")\nQ{urn:x}l\nxs:duration("P1Y")',
    );
    assert.equal(adaptive("(1, 2)", { itemSeparator: ";" }), "1;2");
    assert.deepEqual([NaN, Infinity, -Infinity, 0, -0, 1e21].map(doubleText), [
      "NaN",
      "INF",
      "-INF",
      "0.0e0",
      "-0.0e0",
      "1.0e21",
    ]);
  });

  it("writes nodes, maps, arrays and functions", () => {
    assert.equal(
      adaptive(
        "(/r/@a, /r/namespace::xml, /r/e, /r/comment(), /r/e/text()[2])",
      ),
      'a="1&lt;"\nxmlns:xml="http://www.w3.org/XML/1998/namespace"\n<e>x<f>y</f>&amp;</e>\n<!--c-->\n&amp;',
    );
    assert.equal(adaptive("map { 1: (), 'a': (1, 2) }"), 'map{1:(),"a":(1,2)}');
    assert.equal(adaptive("[1, (), [2]]"), "[1,(),[2]]");
    assert.equal(
      adaptive("(count#1, math:pi#0, function($a) { $a })"),
      "fn:count#1\nmath:pi#0\n(anonymous-function)#1",
    );
    const fn = (name) =>
      new FunctionItem({ name, arity: 0, signature: {}, invoke: () => [] });
    assert.equal(
      serialize(
        [
          fn(new QNameValue("urn:f", "g")),
          fn(new QNameValue("urn:f", "g", "p")),
          fn(new QNameValue("", "h")),
        ],
        {
          method: "adaptive",
        },
      ),
      "Q{urn:f}g#0\np:g#0\nh#0",
    );
    const xmlns = new DOMParser().parseFromString(
      '<r xmlns="urn:d"/>',
      "text/xml",
    );
    assert.equal(
      serialize(evaluateXPath("/*/namespace::*[. = 'urn:d']", xmlns), {
        method: "adaptive",
      }),
      'xmlns="urn:d"',
    );
  });
});

describe("bytes", () => {
  it("encodes the output", () => {
    assert.deepEqual(
      [
        ...serializeToBytes(evaluateXPath("'é'"), {
          method: "text",
          encoding: "UTF-16",
        }),
      ],
      [0xfe, 0xff, 0, 0xe9],
    );
    assert.deepEqual(
      [...serializeToBytes(evaluateXPath("'é'"), { method: "text" })],
      [0xc3, 0xa9],
    );
  });
});
