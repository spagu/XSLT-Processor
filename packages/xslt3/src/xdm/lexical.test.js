import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { atomic } from "./atomic.js";
import { canonicalString, fromLexical } from "./lexical.js";
import { types } from "./types.js";

const str = (type, text) => canonicalString(fromLexical(type, text));

describe("fromLexical", () => {
  it("applies the whiteSpace facet of the target type", () => {
    assert.equal(str("xs:string", " a\tb "), " a\tb ");
    assert.equal(str("xs:untypedAtomic", " a "), " a ");
    assert.equal(str("xs:normalizedString", " a\tb "), " a b ");
    assert.equal(str("xs:token", "  a \n b "), "a b");
    assert.equal(str("xs:integer", "\n 12 \t"), "12");
    assert.equal(str("xs:anyURI", " http://a.b/c d "), "http://a.b/c d");
  });

  it("parses every primitive", () => {
    const cases = [
      ["xs:boolean", " 1 ", "true"],
      ["xs:boolean", "false", "false"],
      ["xs:decimal", "+010.50", "10.5"],
      ["xs:integer", "-007", "-7"],
      ["xs:double", "1e10", "1.0E10"],
      ["xs:float", "-INF", "-INF"],
      ["xs:duration", "P1Y12M", "P2Y"],
      ["xs:yearMonthDuration", "P13M", "P1Y1M"],
      ["xs:dayTimeDuration", "PT36H", "P1DT12H"],
      ["xs:dateTime", "2002-04-02T12:00:00Z", "2002-04-02T12:00:00Z"],
      ["xs:dateTimeStamp", "2002-04-02T12:00:00Z", "2002-04-02T12:00:00Z"],
      ["xs:date", "2002-04-02", "2002-04-02"],
      ["xs:time", "12:00:00", "12:00:00"],
      ["xs:gYearMonth", "2002-04", "2002-04"],
      ["xs:gYear", "2002", "2002"],
      ["xs:gMonthDay", "--04-02", "--04-02"],
      ["xs:gDay", "---02", "---02"],
      ["xs:gMonth", "--04", "--04"],
      ["xs:hexBinary", "0a", "0A"],
      ["xs:base64Binary", "AA==", "AA=="],
      ["xs:QName", "local", "local"],
      ["xs:language", "en-GB", "en-GB"],
      ["xs:NMTOKEN", "12:ab", "12:ab"],
      ["xs:Name", "a:b", "a:b"],
      ["xs:NCName", "ab", "ab"],
      ["xs:ID", "id1", "id1"],
      ["xs:IDREF", "id1", "id1"],
      ["xs:ENTITY", "e", "e"],
      ["xs:unsignedLong", "18446744073709551615", "18446744073709551615"],
      ["xs:long", "-9223372036854775808", "-9223372036854775808"],
    ];
    for (const [type, text, canonical] of cases) {
      assert.equal(str(type, text), canonical, `${type} ${text}`);
    }
  });

  it("raises FORG0001 for invalid lexical forms and facet violations", () => {
    const cases = [
      ["xs:boolean", "yes"],
      ["xs:integer", "1.0"],
      ["xs:decimal", "1e0"],
      ["xs:double", "abc"],
      ["xs:date", "2001-02-29"],
      ["xs:dateTimeStamp", "2002-04-02T12:00:00"],
      ["xs:byte", "128"],
      ["xs:unsignedLong", "18446744073709551616"],
      ["xs:positiveInteger", "0"],
      ["xs:nonPositiveInteger", "1"],
      ["xs:language", "englishlanguage"],
      ["xs:NCName", "a:b"],
      ["xs:Name", "1a"],
      ["xs:NMTOKEN", "a b"],
      ["xs:hexBinary", "0"],
      ["xs:QName", "a b"],
      ["xs:error", "x"],
    ];
    for (const [type, text] of cases) {
      assert.throws(
        () => fromLexical(type, text),
        { code: "FORG0001" },
        `${type} ${text}`,
      );
    }
  });

  it("raises static errors for abstract types", () => {
    assert.throws(() => fromLexical("xs:NOTATION", "a"), { code: "XPST0080" });
    assert.throws(() => fromLexical("xs:anyAtomicType", "a"), {
      code: "XPST0080",
    });
  });

  it("resolves QName prefixes through the options", () => {
    const q = fromLexical("xs:QName", " p:a ", {
      resolveNamespace: () => "urn:p",
    });
    assert.equal(q.value.namespaceURI, "urn:p");
    assert.throws(() => fromLexical("xs:QName", "p:a"), { code: "FONS0004" });
  });

  it("keeps the requested type annotation", () => {
    assert.equal(fromLexical("xs:short", "5").type, types.short);
    assert.equal(fromLexical(types.ID, "x").type, types.ID);
  });
});

describe("canonicalString", () => {
  it("prints values of every kind", () => {
    assert.equal(canonicalString(atomic("xs:integer", 5)), "5");
    assert.equal(canonicalString(atomic("xs:float", 0.1)), "0.1");
    assert.equal(canonicalString(atomic("xs:double", 0.1)), "0.1");
    assert.equal(canonicalString(atomic("xs:boolean", true)), "true");
    assert.equal(canonicalString(atomic("xs:anyURI", "urn:x")), "urn:x");
    assert.equal(
      canonicalString(
        fromLexical("xs:QName", "p:a", { resolveNamespace: () => "urn:p" }),
      ),
      "p:a",
    );
  });
});
