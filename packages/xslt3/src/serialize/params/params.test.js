import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toCamelCase, toHyphenated } from "./names.js";
import { normalizeSettings } from "./settings.js";
import { toClarkName, toDecimal, toNameSet, toStandalone } from "./values.js";

const code = (fn) => {
  try {
    fn();
    return null;
  } catch (error) {
    return error.code;
  }
};

describe("parameter names and values", () => {
  it("converts between camelCase and hyphenated names", () => {
    assert.equal(toCamelCase("omit-xml-declaration"), "omitXmlDeclaration");
    assert.equal(toHyphenated("omitXmlDeclaration"), "omit-xml-declaration");
  });

  it("reads element names", () => {
    assert.equal(toClarkName("x", "Q{u}a"), "{u}a");
    assert.equal(toClarkName("x", "{u}a"), "{u}a");
    assert.equal(toClarkName("x", "a"), "{}a");
    assert.equal(toClarkName("x", { localName: "a" }), "{}a");
    assert.equal(
      toClarkName("x", "p:a", (p) => (p === "p" ? "u" : undefined)),
      "{u}a",
    );
    assert.equal(
      code(() => toClarkName("x", "q:a", () => undefined)),
      "SEPM0016",
    );
    assert.equal(
      code(() => toClarkName("x", "p:a")),
      "SEPM0016",
    );
    assert.deepEqual([...toNameSet("x", " a  b ")], ["{}a", "{}b"]);
    assert.deepEqual([...toNameSet("x", new Set(["a"]))], ["{}a"]);
    assert.deepEqual([...toNameSet("x", { localName: "a" })], ["{}a"]);
  });

  it("reads decimals and standalone values", () => {
    assert.equal(toDecimal("x", "4.01"), 4.01);
    assert.equal(toDecimal("x", { toNumber: () => 5 }), 5);
    assert.equal(
      code(() => toDecimal("x", "five")),
      "SEPM0016",
    );
    assert.equal(toStandalone("x", null), "omit");
    assert.equal(toStandalone("x", " omit "), "omit");
    assert.equal(toStandalone("x", true), "yes");
    assert.equal(toStandalone("x", "0"), "no");
  });
});

describe("normalized settings", () => {
  it("has defaults and accepts both name forms", () => {
    const settings = normalizeSettings();
    assert.equal(settings.method, "xml");
    assert.equal(settings.indent, false);
    assert.equal(settings.byteOrderMark, false);
    assert.equal(settings.encoding.name, "UTF-8");
    const given = normalizeSettings({
      "omit-xml-declaration": "yes",
      indent: "true",
      itemSeparator: "|",
      unknown: 1,
      encoding: "UTF-16",
      useCharacterMaps: { a: "b" },
      method: { namespaceURI: "", localName: "text" },
      htmlVersion: undefined,
    });
    assert.equal(given.omitXmlDeclaration, true);
    assert.equal(given.indent, true);
    assert.equal(given.itemSeparator, "|");
    assert.equal(given.byteOrderMark, true);
    assert.equal(given.method, "text");
    assert.equal(given.useCharacterMaps.get("a"), "b");
  });

  it("resolves the HTML version", () => {
    assert.equal(normalizeSettings({ method: "html" }).htmlVersion, 5);
    assert.equal(
      normalizeSettings({ method: "html", version: "4.0" }).htmlVersion,
      4,
    );
    assert.equal(
      normalizeSettings({ method: "xhtml", htmlVersion: 4.01 }).htmlVersion,
      4,
    );
    assert.equal(
      normalizeSettings({ method: "xhtml", version: "1.1" }).version,
      "1.1",
    );
    assert.equal(
      code(() => normalizeSettings({ method: "html", htmlVersion: 3.2 })),
      "SESU0013",
    );
  });

  it("rejects invalid, conflicting and unsupported values", () => {
    const cases = [
      [{ indent: "maybe" }, "SEPM0016"],
      [{ method: "pdf" }, "SEPM0016"],
      [{ method: "Q{urn:x}m" }, "SEPM0016"],
      [{ method: { namespaceURI: "urn:x", localName: "m" } }, "SEPM0016"],
      [{ useCharacterMaps: new Map([["ab", "c"]]) }, "SEPM0016"],
      [{ normalizationForm: "fully-normalized" }, "SESU0011"],
      [{ encoding: "EBCDIC-XYZ" }, "SESU0007"],
      [{ encoding: "Shift_JIS" }, "SESU0007"],
      [{ version: "2.0" }, "SESU0013"],
      [{ omitXmlDeclaration: true, standalone: true }, "SEPM0009"],
      [
        { omitXmlDeclaration: true, version: "1.1", doctypeSystem: "a" },
        "SEPM0009",
      ],
      [{ undeclarePrefixes: true }, "SEPM0010"],
    ];
    for (const [params, expected] of cases) {
      assert.equal(
        code(() => normalizeSettings(params)),
        expected,
        JSON.stringify(params),
      );
    }
    assert.equal(
      code(() =>
        normalizeSettings({
          method: "text",
          standalone: "yes",
          omitXmlDeclaration: true,
        }),
      ),
      null,
    );
  });
});
