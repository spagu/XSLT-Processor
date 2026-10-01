import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { atomic, ITEM_KIND } from "./atomic.js";
import { fromLexical } from "./lexical.js";
import {
  atomize,
  effectiveBooleanValue,
  nodeStringValue,
  stringValue,
  typedValue,
} from "./nodes.js";
import { types } from "./types.js";

// DOM-like nodes with only the properties the data model reads
const leaf = (nodeType, value) => ({
  nodeType,
  nodeValue: value,
  childNodes: [],
});
const text = (value) => leaf(3, value);
const parent = (nodeType, ...childNodes) => ({
  nodeType,
  nodeValue: null,
  childNodes,
});

const doc = parent(
  9,
  parent(
    1,
    text("a"),
    leaf(8, "comment"),
    parent(1, text("b"), leaf(4, "c")),
    leaf(7, "pi"),
  ),
);

describe("string values and typed values of nodes", () => {
  it("concatenates descendant text of elements and documents", () => {
    assert.equal(nodeStringValue(doc), "abc");
    assert.equal(nodeStringValue(doc.childNodes[0]), "abc");
    assert.equal(nodeStringValue(parent(11, text("x"))), "x");
    assert.equal(nodeStringValue(parent(1)), "");
  });

  it("uses nodeValue of other nodes", () => {
    assert.equal(nodeStringValue(leaf(2, "attr")), "attr");
    assert.equal(nodeStringValue(leaf(8, "c")), "c");
    assert.equal(nodeStringValue({ nodeType: 3 }), "");
  });

  it("types values as untypedAtomic or string", () => {
    assert.equal(typedValue(doc).type, types.untypedAtomic);
    assert.equal(typedValue(leaf(2, "1")).type, types.untypedAtomic);
    assert.equal(typedValue(text("1")).type, types.untypedAtomic);
    assert.equal(typedValue(leaf(8, "c")).type, types.string);
    assert.equal(typedValue(leaf(7, "p")).type, types.string);
    assert.equal(typedValue(leaf(13, "urn:x")).type, types.string);
  });
});

describe("atomize", () => {
  it("keeps atomic values, types nodes and flattens arrays", () => {
    const one = atomic("xs:integer", 1);
    const array = {
      [ITEM_KIND]: "array",
      members: [
        [one],
        [],
        [text("t"), { [ITEM_KIND]: "array", members: [[one]] }],
      ],
    };
    const result = atomize([one, doc, array]);
    assert.deepEqual(
      result.map((v) => stringValue(v)),
      ["1", "abc", "1", "t", "1"],
    );
    assert.deepEqual(atomize([]), []);
  });

  it("raises FOTY0013 for maps and functions", () => {
    assert.throws(() => atomize([{ [ITEM_KIND]: "map" }]), {
      code: "FOTY0013",
    });
    assert.throws(() => atomize([{ [ITEM_KIND]: "function" }]), {
      code: "FOTY0013",
    });
  });
});

describe("stringValue", () => {
  it("returns canonical strings and node string values", () => {
    assert.equal(stringValue(fromLexical("xs:double", "1e10")), "1.0E10");
    assert.equal(stringValue(doc), "abc");
    assert.throws(() => stringValue({ [ITEM_KIND]: "array", members: [] }), {
      code: "FOTY0014",
    });
  });
});

describe("effectiveBooleanValue", () => {
  const ebv = (...items) => effectiveBooleanValue(items);
  const L = (type, value) => fromLexical(type, value);

  it("follows the rules of XPath 3.1 2.4.3", () => {
    assert.equal(ebv(), false);
    assert.equal(ebv(text(""), atomic("xs:integer", 0)), true);
    assert.equal(ebv(L("xs:boolean", "false")), false);
    assert.equal(ebv(L("xs:boolean", "true")), true);
    assert.equal(ebv(L("xs:string", "")), false);
    assert.equal(ebv(L("xs:untypedAtomic", "0")), true);
    assert.equal(ebv(L("xs:anyURI", "")), false);
    assert.equal(ebv(L("xs:NCName", "a")), true);
    assert.equal(ebv(L("xs:integer", "0")), false);
    assert.equal(ebv(L("xs:byte", "-1")), true);
    assert.equal(ebv(L("xs:decimal", "0.0")), false);
    assert.equal(ebv(L("xs:decimal", "0.5")), true);
    assert.equal(ebv(L("xs:double", "NaN")), false);
    assert.equal(ebv(L("xs:double", "-0")), false);
    assert.equal(ebv(L("xs:float", "INF")), true);
  });

  it("raises FORG0006 otherwise", () => {
    assert.throws(() => ebv(L("xs:date", "2000-01-01")), { code: "FORG0006" });
    assert.throws(() => ebv(L("xs:boolean", "true"), L("xs:boolean", "true")), {
      code: "FORG0006",
    });
    assert.throws(() => ebv({ [ITEM_KIND]: "map" }), { code: "FORG0006" });
  });
});
