import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DOMParser } from "@xmldom/xmldom";
import { ITEM_KIND } from "../xdm/atomic.js";
import { deepEqualSequences } from "./deepEqual.js";
import { sequenceFunctions } from "./sequences.js";
import { compareCodepoints } from "../xdm/strings.js";
import {
  call,
  checkDefinitions,
  item,
  one,
  strings,
  throwsCode,
  v,
} from "./testing.test.js";

const f = (local, args, ctx = {}) => call(sequenceFunctions, local, args, ctx);
const s = (local, ...args) => strings(f(local, args));
const abc = ["a", "b", "c"];
const HTML =
  "http://www.w3.org/2005/xpath-functions/collation/html-ascii-case-insensitive";

describe("sequence functions", () => {
  checkDefinitions(sequenceFunctions);

  it("head, tail, reverse and unordered", () => {
    assert.deepEqual(s("head", [1n, 2n]), ["1"]);
    assert.deepEqual(s("head", []), []);
    assert.deepEqual(s("tail", [1n, 2n, 3n]), ["2", "3"]);
    assert.deepEqual(s("tail", [1n]), []);
    assert.deepEqual(s("reverse", abc), ["c", "b", "a"]);
    assert.deepEqual(s("unordered", abc), abc);
  });

  it("insert-before and remove (F&O examples)", () => {
    assert.deepEqual(s("insert-before", abc, 0n, "z"), ["z", "a", "b", "c"]);
    assert.deepEqual(s("insert-before", abc, 2n, "z"), ["a", "z", "b", "c"]);
    assert.deepEqual(s("insert-before", abc, 4n, "z"), ["a", "b", "c", "z"]);
    assert.deepEqual(s("insert-before", abc, 99n, "z"), ["a", "b", "c", "z"]);
    assert.deepEqual(s("remove", abc, 0n), abc);
    assert.deepEqual(s("remove", abc, 2n), ["a", "c"]);
    assert.deepEqual(s("remove", [], 3n), []);
  });

  it("subsequence (F&O examples)", () => {
    const seq = ["item1", "item2", "item3", "item4", "item5"];
    assert.deepEqual(s("subsequence", seq, 4), ["item4", "item5"]);
    assert.deepEqual(s("subsequence", seq, 3, 2), ["item3", "item4"]);
    assert.deepEqual(s("subsequence", seq, 1.5, 2.6), [
      "item2",
      "item3",
      "item4",
    ]);
    assert.deepEqual(s("subsequence", seq, -Infinity, Infinity), []);
  });

  it("index-of (F&O examples)", () => {
    assert.deepEqual(s("index-of", [10n, 20n, 30n, 40n], 35n), []);
    assert.deepEqual(s("index-of", [10n, 20n, 30n, 30n, 20n, 10n], 20n), [
      "2",
      "5",
    ]);
    assert.deepEqual(
      s("index-of", ["a", "sport", "and", "a", "pastime"], "a"),
      ["1", "4"],
    );
    assert.deepEqual(s("index-of", [1n, "1", v("untypedAtomic", "1")], "1"), [
      "2",
      "3",
    ]);
    assert.deepEqual(
      s("index-of", [v("double", "NaN")], v("double", "NaN")),
      [],
    );
    assert.deepEqual(s("index-of", ["A", "a"], "a", HTML), ["1", "2"]);
  });

  it("distinct-values (F&O examples)", () => {
    assert.deepEqual(s("distinct-values", [1n, 2.0, 3n, 2n]), ["1", "2", "3"]);
    assert.deepEqual(
      s("distinct-values", [
        v("untypedAtomic", "cherry"),
        v("untypedAtomic", "bar"),
        "bar",
      ]),
      ["cherry", "bar"],
    );
    assert.deepEqual(s("distinct-values", [NaN, v("float", "NaN"), 1n]), [
      "NaN",
      "1",
    ]);
    assert.deepEqual(
      s("distinct-values", [v("decimal", "1.2"), v("float", "1.2")]),
      ["1.2"],
    );
    assert.deepEqual(
      s("distinct-values", [
        v("dateTime", "2002-01-01T12:00:00Z"),
        v("dateTime", "2002-01-01T13:00:00+01:00"),
        v("date", "2002-01-01"),
        v("yearMonthDuration", "P1Y"),
        v("dayTimeDuration", "PT1H"),
        v("duration", "P12M"),
        true,
        true,
        v("QName", "a"),
      ]),
      ["2002-01-01T12:00:00Z", "2002-01-01", "P1Y", "PT1H", "true", "a"],
    );
    assert.deepEqual(s("distinct-values", ["A", "a", "b"], HTML), ["A", "b"]);
    assert.deepEqual(
      s(
        "distinct-values",
        ["a", "A"],
        "http://www.w3.org/2013/collation/UCA?strength=primary",
      ),
      ["a"],
    );
  });

  it("checks cardinalities", () => {
    assert.deepEqual(s("zero-or-one", []), []);
    assert.deepEqual(s("zero-or-one", "a"), ["a"]);
    throwsCode(() => f("zero-or-one", [abc]), "FORG0003");
    assert.deepEqual(s("one-or-more", abc), abc);
    throwsCode(() => f("one-or-more", [[]]), "FORG0004");
    assert.deepEqual(s("exactly-one", "a"), ["a"]);
    throwsCode(() => f("exactly-one", [[]]), "FORG0005");
  });

  it("rethrows errors other than XPath errors from comparisons", () => {
    const broken = { type: { primitive: { localName: "string" } } };
    assert.throws(() => f("index-of", [[item("a")], broken]), TypeError);
  });
});

describe("deep-equal", () => {
  const de = (a, b, ctx) => one(f("deep-equal", [a, b], ctx));
  it("compares atomic sequences (F&O examples)", () => {
    assert.equal(de([1n, 2n], [1.0, 2n]), "true");
    assert.equal(de([1n, 2n], [2n, 1n]), "false");
    assert.equal(de([NaN], [NaN]), "true");
    assert.equal(de(["a"], ["a", "b"]), "false");
    assert.equal(de([1n], ["1"]), "false");
    assert.equal(one(f("deep-equal", [["A"], ["a"], HTML])), "true");
  });

  const doc = (text) => new DOMParser().parseFromString(text, "text/xml");
  it("compares nodes", () => {
    const a = doc('<r xmlns:p="u"><a x="1" y="2">t<!--c--><?pi d?></a></r>');
    const b = doc('<r><a y="2" x="1">t</a></r>');
    const c = doc('<r><a y="2" x="1">u</a></r>');
    const d = doc('<r><a y="2" z="1">t</a></r>');
    const e = doc('<r><b y="2" x="1">t</b></r>');
    assert.equal(de([a], [b]), "true");
    assert.equal(de([a.documentElement], [b.documentElement]), "true");
    assert.equal(de([a], [c]), "false");
    assert.equal(de([a], [d]), "false");
    assert.equal(de([a], [e]), "false");
    assert.equal(de([a.documentElement], [b]), "false");
    assert.equal(de([a], ["t"]), "false");
    assert.equal(de(["t"], [a]), "false");
    const attr = (node) => node.documentElement.firstChild.attributes.item(0);
    assert.equal(de([attr(a)], [attr(b)]), "false");
    const pis = doc("<r><?x a?><?x a?><?y a?></r>").documentElement.childNodes;
    assert.equal(de([pis.item(0)], [pis.item(1)]), "true");
    assert.equal(de([pis.item(0)], [pis.item(2)]), "false");
    const fragment = a.createDocumentFragment();
    assert.equal(de([fragment], [b.createDocumentFragment()]), "true");
    const comments = doc("<r><!--a--><!--a--></r>").documentElement.childNodes;
    assert.equal(de([comments.item(0)], [comments.item(1)]), "true");
  });

  it("delegates maps, arrays and functions to the hook", () => {
    const map = { [ITEM_KIND]: "map" };
    throwsCode(() => de([map], [map]), "FOTY0015");
    const ctx = {
      deepEqualItem: (x, y, options) =>
        x === y && options.collation !== undefined,
    };
    assert.equal(de([map], [map], ctx), "true");
    assert.equal(
      deepEqualSequences([map], [item("a")], { collation: compareCodepoints }),
      false,
    );
  });
});
