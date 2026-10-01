import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { XdmArray } from "../../items/array.js";
import { atomic } from "../../xdm/atomic.js";
import { DateTimeValue } from "../../xdm/datetime.js";
import { compileXPath, evaluateXPath } from "../index.js";
import { code, parse, show, xs } from "../testing.test.js";
import { compileNode, withinLimits } from "./compiler.js";
import { dateTimeOf } from "./dynamicContext.js";
import { resolveUri } from "./uris.js";
import { rootScope } from "./scope.js";
import {
  CODEPOINT_COLLATION,
  createStaticContext,
  variableKey,
} from "./staticContext.js";
import { toSequence } from "./values.js";

describe("the static context", () => {
  it("predeclares namespaces and takes more in several forms", () => {
    const sc = createStaticContext(
      { namespaces: new Map([["a", "urn:a"]]) },
      null,
    );
    assert.equal(sc.namespaces.get("a"), "urn:a");
    assert.equal(sc.namespaces.get("xs"), "http://www.w3.org/2001/XMLSchema");
    assert.equal(sc.defaultElementNamespace, "");
    const listed = createStaticContext(
      { namespaces: [{ uri: "urn:d" }], defaultFunctionNamespace: "urn:f" },
      null,
    );
    assert.equal(listed.defaultElementNamespace, "urn:d");
    assert.equal(listed.defaultFunctionNamespace, "urn:f");
  });

  it("supports only the codepoint collation", () => {
    const sc = createStaticContext(
      { defaultCollation: CODEPOINT_COLLATION },
      null,
    );
    assert.equal(sc.defaultCollation, CODEPOINT_COLLATION);
    assert.throws(
      () => createStaticContext({ defaultCollation: "urn:other" }, null),
      { code: "FOCH0002" },
    );
  });

  it("reads variable names", () => {
    const sc = createStaticContext({ namespaces: { p: "urn:p" } }, null);
    assert.equal(variableKey("x", sc), "{}x");
    assert.equal(variableKey("p:x", sc), "{urn:p}x");
    assert.equal(variableKey("Q{urn:q}x", sc), "{urn:q}x");
    assert.throws(() => variableKey("z:x", sc), { code: "XPST0081" });
  });

  it("uses the default function namespace for unprefixed calls", () => {
    const options = { defaultFunctionNamespace: "urn:none" };
    assert.equal(code("count(1)", null, options), "XPST0017");
    assert.equal(xs("fn:count(1)", null, options), "1");
  });
});

describe("the dynamic context", () => {
  it("gives the current date and time, stable during an evaluation", () => {
    const now = new Date(Date.UTC(2020, 1, 3, 4, 5, 6, 789));
    const options = { currentDateTime: now, implicitTimezone: 60 };
    assert.equal(
      xs("current-dateTime()", null, options),
      "2020-02-03T05:05:06.789+01:00",
    );
    assert.equal(
      xs("current-date(), current-time()", null, options),
      "2020-02-03+01:00 05:05:06.789+01:00",
    );
    assert.equal(xs("implicit-timezone()", null, options), "PT1H");
    const fixed = dateTimeOf(now, 0);
    assert.ok(fixed instanceof DateTimeValue);
    assert.equal(
      xs("current-dateTime()", null, { currentDateTime: fixed }),
      "2020-02-03T04:05:06.789Z",
    );
    assert.equal(xs("current-dateTime() eq current-dateTime()"), "true");
  });

  it("loads documents once per evaluation, resolving URIs", () => {
    const loaded = [];
    const doc = parse("<d/>");
    const options = {
      baseUri: "http://example.com/dir/",
      documentLoader: (uri) => {
        loaded.push(uri);
        return uri.endsWith("missing.xml") ? null : doc;
      },
    };
    assert.equal(xs("doc('a.xml') is doc('a.xml')", null, options), "true");
    assert.deepEqual(loaded, ["http://example.com/dir/a.xml"]);
    assert.equal(code("doc('missing.xml')", null, options), "FODC0002");
    assert.equal(code("doc(':/')", null, options), "FODC0005");
    const failing = {
      documentLoader: () => {
        throw new Error("io");
      },
    };
    assert.equal(code("doc('x.xml')", null, failing), "FODC0002");
    assert.equal(code("doc('x.xml')"), "FODC0002");
  });

  it("resolves URIs and keeps those it cannot resolve", () => {
    assert.equal(resolveUri("b", "http://x.org/a/"), "http://x.org/a/b");
    assert.equal(resolveUri("b", undefined), "b");
  });

  it("sends fn:trace output to the trace option", () => {
    const traced = [];
    const trace = (value, label) => traced.push([value.map(show), label]);
    assert.equal(xs("trace(1, 'one') + trace(2)", null, { trace }), "3");
    assert.deepEqual(traced, [
      [["1"], "one"],
      [["2"], ""],
    ]);
    assert.equal(xs("trace(1)"), "1");
  });
});

describe("hooks of the dynamic context for function modules", () => {
  const dynamicOf = (options, contextItem) => {
    let dyn;
    const probe = {
      local: "probe",
      namespace: "urn:probe",
      params: [],
      returns: "item()*",
      impl: (_, context) => {
        dyn = context;
        return [];
      },
    };
    compileXPath("Q{urn:probe}probe()", {
      ...options,
      functions: [[probe]],
    }).evaluate(contextItem, options);
    return dyn;
  };

  it("gives the decimal formats by name", () => {
    const formats = [
      { "decimal-separator": ",", NaN: "nan!" },
      { name: "p:f", zeroDigit: "0", other: "x" },
      { name: "Q{urn:q}g", "per-mille": "m" },
      { name: "x:h", "xmlns:x": "urn:x", digit: "d" },
      { name: "z:h", digit: "skipped" },
    ];
    const options = { decimalFormats: formats, namespaces: { p: "urn:p" } };
    const { decimalFormats } = dynamicOf(options);
    assert.deepEqual(decimalFormats.get(""), {
      decimalSeparator: ",",
      nan: "nan!",
    });
    assert.deepEqual(decimalFormats.get("Q{urn:p}f"), { zeroDigit: "0" });
    assert.deepEqual(decimalFormats.get("p:f"), { zeroDigit: "0" });
    assert.equal(decimalFormats.get("x:f"), undefined);
    assert.deepEqual(decimalFormats.get(" Q{urn:x}h "), { digit: "d" });
    assert.equal(decimalFormats.get("f"), undefined);
    const byName = dynamicOf({ decimalFormats: { "": { digit: "#" } } });
    assert.deepEqual(byName.decimalFormats.get(""), { digit: "#" });
    const map = dynamicOf({ decimalFormats: new Map([["a", {}]]) });
    assert.deepEqual(map.decimalFormats.get("a"), {});
    assert.equal(dynamicOf({}).decimalFormats.get(""), undefined);
  });

  it("creates documents with the DOM of the context node", () => {
    const doc = parse("<r/>");
    const created = dynamicOf({}, doc.documentElement).createDocument();
    assert.equal(created.nodeType, 9);
    assert.equal(dynamicOf({}, doc).createDocument().nodeType, 9);
    const own = () => "mine";
    assert.equal(dynamicOf({ createDocument: own }).createDocument(), "mine");
    assert.throws(() => dynamicOf({}).createDocument(), { code: "XPDY0130" });
  });

  it("compares items with deep-equal", () => {
    const { deepEqualItem } = dynamicOf({});
    const [a, b] = evaluateXPath("map{1: 'x'}, map{1.0: 'x'}");
    assert.equal(deepEqualItem(a, b), true);
    const [c, d] = evaluateXPath("['a'], ['A']");
    const caseless = (x, y) => x.toLowerCase().localeCompare(y.toLowerCase());
    assert.equal(deepEqualItem(c, d, { collation: caseless }), true);
    assert.equal(deepEqualItem(c, d), false);
  });
});

describe("JavaScript values", () => {
  it("converts values to sequences", () => {
    assert.deepEqual(toSequence(null), []);
    assert.deepEqual(toSequence(undefined), []);
    const [date] = toSequence(new Date(Date.UTC(2001, 0, 1)));
    assert.equal(show(date), "2001-01-01T00:00:00Z");
    assert.equal(
      toSequence([1, [2, "a"]])
        .map(show)
        .join(" "),
      "1 2 a",
    );
    const value = atomic("xs:integer", 1);
    assert.deepEqual(toSequence(value), [value]);
    const array = new XdmArray([]);
    assert.deepEqual(toSequence(array), [array]);
    const [map] = toSequence({ a: 1, b: [true, false] });
    assert.equal(map.size, 2);
    const [fromMap] = toSequence(
      new Map([
        [1n, "x"],
        [{}, "y"],
      ]),
    );
    assert.equal(fromMap.keys().map(show).join(" "), "1 [object Object]");
  });

  it("passes maps given as variables", () => {
    const options = { variables: { m: { a: 1 } } };
    assert.equal(xs("$m?a", null, options), "1");
  });
});

describe("the compiler", () => {
  it("rejects unknown node types", () => {
    const sc = createStaticContext({}, null);
    assert.throws(() => compileNode({ type: "Bogus" }, rootScope(sc, [])), {
      code: "XPST0003",
    });
  });

  it("passes errors other than RangeError through", () => {
    assert.throws(
      () =>
        withinLimits(() => {
          throw new TypeError("t");
        }),
      TypeError,
    );
    assert.equal(
      withinLimits(() => 1),
      1,
    );
  });
});
