import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { atomic, ITEM_KIND, itemKind } from "../xdm/atomic.js";
import { fromLexical } from "../xdm/lexical.js";
import { XdmArray } from "./array.js";
import { FunctionItem } from "./function.js";
import { XdmMap } from "./map.js";
import { exactDecimal, mapKey } from "./mapKey.js";

const L = (type, text) => fromLexical(type, text);
const same = (a, b) => mapKey(a) === mapKey(b);

describe("map keys (op:same-key)", () => {
  it("compares strings, URIs and untyped values as strings", () => {
    assert.ok(same(L("xs:string", "a"), L("xs:untypedAtomic", "a")));
    assert.ok(same(L("xs:anyURI", "a"), L("xs:string", "a")));
    assert.ok(!same(L("xs:string", "1"), L("xs:integer", "1")));
  });

  it("compares numbers by exact value", () => {
    assert.ok(same(L("xs:integer", "1"), L("xs:double", "1")));
    assert.ok(same(L("xs:decimal", "1.5"), L("xs:float", "1.5")));
    assert.ok(!same(L("xs:decimal", "0.1"), L("xs:double", "0.1")));
    assert.ok(same(L("xs:double", "NaN"), L("xs:float", "NaN")));
    assert.ok(same(L("xs:double", "INF"), L("xs:float", "INF")));
    assert.ok(!same(L("xs:double", "INF"), L("xs:double", "-INF")));
    assert.ok(same(L("xs:double", "-0"), L("xs:integer", "0")));
    assert.equal(exactDecimal(-0.5).toString(), "-0.5");
    assert.equal(exactDecimal(2 ** 60).toString(), String(2n ** 60n));
    assert.equal(exactDecimal(Number.MIN_VALUE).scale, 1074);
  });

  it("compares other types within their primitive", () => {
    assert.ok(same(L("xs:boolean", "1"), L("xs:boolean", "true")));
    assert.ok(same(L("xs:dayTimeDuration", "PT1H"), L("xs:duration", "PT60M")));
    assert.ok(same(L("xs:hexBinary", "0F"), L("xs:hexBinary", "0f")));
    assert.ok(!same(L("xs:hexBinary", "0F"), L("xs:base64Binary", "Dw==")));
    assert.ok(same(L("xs:QName", "a"), L("xs:QName", "a")));
    assert.ok(
      same(
        L("xs:dateTime", "2000-01-01T01:00:00+01:00"),
        L("xs:dateTime", "2000-01-01T00:00:00Z"),
      ),
    );
    assert.ok(
      !same(
        L("xs:dateTime", "2000-01-01T00:00:00Z"),
        L("xs:dateTime", "2000-01-01T00:00:00"),
      ),
    );
    assert.ok(!same(L("xs:date", "2000-01-01"), L("xs:gYear", "2000")));
  });
});

describe("XdmMap", () => {
  const map = XdmMap.from([
    [L("xs:string", "a"), [atomic("xs:integer", 1)]],
    [L("xs:integer", "2"), []],
  ]);

  it("is a map item and a function of arity 1", () => {
    assert.equal(itemKind(map), "map");
    assert.equal(map[ITEM_KIND], "map");
    assert.equal(map.arity, 1);
    assert.equal(map.name, null);
    assert.equal(map.size, 2);
  });

  it("gets, puts and removes entries without changing the map", () => {
    assert.equal(map.get(L("xs:untypedAtomic", "a"))[0].value, 1n);
    assert.equal(map.get(L("xs:string", "b")), undefined);
    assert.ok(map.has(L("xs:double", "2")));
    const bigger = map.put(L("xs:string", "b"), []);
    assert.equal(bigger.size, 3);
    assert.equal(map.size, 2);
    assert.equal(map.remove([L("xs:string", "a")]).size, 1);
    assert.deepEqual(
      map.keys().map((k) => k.value),
      ["a", 2n],
    );
  });

  it("is called with one atomic key", () => {
    assert.equal(map.invoke([[L("xs:string", "a")]])[0].value, 1n);
    assert.deepEqual(map.invoke([[L("xs:string", "z")]]), []);
    assert.throws(() => map.invoke([[]]), { code: "XPTY0004" });
  });

  it("reports duplicate keys on request", () => {
    const pairs = [
      [L("xs:integer", "1"), []],
      [L("xs:double", "1"), []],
    ];
    assert.equal(XdmMap.from(pairs).size, 1);
    assert.throws(() =>
      XdmMap.from(pairs, () => {
        throw new Error("dup");
      }),
    );
    assert.equal(new XdmMap().size, 0);
  });
});

describe("XdmArray", () => {
  const array = new XdmArray([[atomic("xs:integer", 1)], []]);

  it("is an array item and a function of arity 1", () => {
    assert.equal(itemKind(array), "array");
    assert.equal(array.arity, 1);
    assert.equal(array.name, null);
    assert.equal(array.size, 2);
    assert.equal(new XdmArray().size, 0);
  });

  it("gets members by position", () => {
    assert.equal(array.get(1n)[0].value, 1n);
    assert.deepEqual(array.get(2), []);
    assert.throws(() => array.get(3), { code: "FOAY0001" });
    assert.throws(() => array.get(0), { code: "FOAY0001" });
  });

  it("is called with one integer", () => {
    assert.equal(array.invoke([[L("xs:untypedAtomic", "1")]])[0].value, 1n);
    assert.throws(() => array.invoke([[L("xs:string", "1")]]), {
      code: "XPTY0004",
    });
    assert.throws(() => array.invoke([[]]), { code: "XPTY0004" });
  });
});

describe("FunctionItem", () => {
  it("is a function item", () => {
    const f = new FunctionItem({
      arity: 0,
      signature: { params: [], returns: null },
      invoke: () => [],
    });
    assert.equal(itemKind(f), "function");
    assert.equal(f.name, null);
    assert.deepEqual(f.invoke([]), []);
  });
});
