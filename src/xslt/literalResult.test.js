/**
 * Literal result element helper tests.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { JSDOM } from "jsdom";
import { XSLT_NAMESPACE } from "./elements.js";
import {
  NamespaceAliasMap,
  getXsltAttribute,
  lookupNamespaceUri,
  shouldCopyAttribute,
} from "./literalResult.js";

let dom;

function parseXML(xmlString) {
  return new dom.window.DOMParser().parseFromString(
    xmlString,
    "application/xml",
  );
}

const STYLESHEET = `<?xml version="1.0"?>
  <xsl:stylesheet version="1.0" xmlns:xsl="${XSLT_NAMESPACE}"
                  xmlns:axsl="http://www.w3.org/1999/XSL/TransformAlias"
                  xmlns="urn:default">
    <xsl:namespace-alias stylesheet-prefix="axsl" result-prefix="xsl"/>
  </xsl:stylesheet>`;

describe("lookupNamespaceUri", () => {
  beforeEach(() => {
    dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
      contentType: "text/html",
    });
  });

  it("should resolve a declared prefix", () => {
    const root = parseXML(STYLESHEET).documentElement;
    assert.strictEqual(lookupNamespaceUri(root, "xsl"), XSLT_NAMESPACE);
  });

  it("should resolve the default namespace", () => {
    const root = parseXML(STYLESHEET).documentElement;
    assert.strictEqual(lookupNamespaceUri(root, null), "urn:default");
  });

  it("should return null for an undeclared prefix", () => {
    const root = parseXML(STYLESHEET).documentElement;
    assert.strictEqual(lookupNamespaceUri(root, "nope"), null);
  });

  it("should fall back to xmlns attributes without lookupNamespaceURI", () => {
    const root = parseXML(STYLESHEET).documentElement;
    const child = root.getElementsByTagName("xsl:namespace-alias")[0];
    child.lookupNamespaceURI = undefined;

    assert.strictEqual(
      lookupNamespaceUri(child, "axsl"),
      "http://www.w3.org/1999/XSL/TransformAlias",
    );
    assert.strictEqual(lookupNamespaceUri(child, "nope"), null);
  });
});

describe("NamespaceAliasMap", () => {
  beforeEach(() => {
    dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
      contentType: "text/html",
    });
  });

  function aliasElement(stylesheet = STYLESHEET) {
    return parseXML(stylesheet).getElementsByTagName("xsl:namespace-alias")[0];
  }

  it("should start empty", () => {
    assert.strictEqual(new NamespaceAliasMap().isEmpty(), true);
  });

  it("should alias a stylesheet namespace to a result namespace", () => {
    const aliases = new NamespaceAliasMap();
    aliases.add(aliasElement());

    assert.strictEqual(aliases.isEmpty(), false);
    assert.deepStrictEqual(
      aliases.resolve(
        "http://www.w3.org/1999/XSL/TransformAlias",
        "stylesheet",
      ),
      { namespaceUri: XSLT_NAMESPACE, qname: "xsl:stylesheet" },
    );
  });

  it("should return null for namespaces without an alias", () => {
    const aliases = new NamespaceAliasMap();
    aliases.add(aliasElement());

    assert.strictEqual(aliases.resolve("urn:other", "x"), null);
    assert.strictEqual(aliases.resolve(null, "x"), null);
  });

  it("should support #default as result prefix", () => {
    const aliases = new NamespaceAliasMap();
    aliases.add(
      aliasElement(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="${XSLT_NAMESPACE}"
                        xmlns:axsl="urn:source" xmlns="urn:default">
          <xsl:namespace-alias stylesheet-prefix="axsl" result-prefix="#default"/>
        </xsl:stylesheet>`),
    );

    assert.deepStrictEqual(aliases.resolve("urn:source", "x"), {
      namespaceUri: "urn:default",
      qname: "x",
    });
  });

  it("should support #default as stylesheet prefix", () => {
    const aliases = new NamespaceAliasMap();
    aliases.add(
      aliasElement(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="${XSLT_NAMESPACE}"
                        xmlns:r="urn:result" xmlns="urn:default">
          <xsl:namespace-alias stylesheet-prefix="#default" result-prefix="r"/>
        </xsl:stylesheet>`),
    );

    assert.deepStrictEqual(aliases.resolve("urn:default", "x"), {
      namespaceUri: "urn:result",
      qname: "r:x",
    });
  });

  it("should ignore incomplete declarations", () => {
    const aliases = new NamespaceAliasMap();
    aliases.add(
      aliasElement(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="${XSLT_NAMESPACE}">
          <xsl:namespace-alias stylesheet-prefix="a"/>
        </xsl:stylesheet>`),
    );

    assert.strictEqual(aliases.isEmpty(), true);
  });

  it("should ignore declarations with an undeclared stylesheet prefix", () => {
    const aliases = new NamespaceAliasMap();
    aliases.add(
      aliasElement(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="${XSLT_NAMESPACE}">
          <xsl:namespace-alias stylesheet-prefix="ghost" result-prefix="xsl"/>
        </xsl:stylesheet>`),
    );

    assert.strictEqual(aliases.isEmpty(), true);
  });
});

describe("shouldCopyAttribute", () => {
  beforeEach(() => {
    dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
      contentType: "text/html",
    });
  });

  it("should copy ordinary attributes", () => {
    const element = parseXML('<e a="1"/>').documentElement;
    assert.strictEqual(
      shouldCopyAttribute(element.attributes[0], XSLT_NAMESPACE),
      true,
    );
  });

  it("should skip XSLT attributes", () => {
    const element = parseXML(
      `<e xmlns:xsl="${XSLT_NAMESPACE}" xsl:use-attribute-sets="s"/>`,
    ).documentElement;

    for (const attribute of element.attributes) {
      assert.strictEqual(shouldCopyAttribute(attribute, XSLT_NAMESPACE), false);
    }
  });

  it("should skip xsl prefixed attributes without a namespace", () => {
    const element = dom.window.document.createElement("e");
    element.setAttribute("xsl:version", "1.0");

    assert.strictEqual(
      shouldCopyAttribute(element.attributes[0], XSLT_NAMESPACE),
      false,
    );
  });

  it("should skip the default namespace declaration", () => {
    const element = parseXML('<e xmlns="urn:a"/>').documentElement;
    assert.strictEqual(
      shouldCopyAttribute(element.attributes[0], XSLT_NAMESPACE),
      false,
    );
  });
});

describe("getXsltAttribute", () => {
  beforeEach(() => {
    dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
      contentType: "text/html",
    });
  });

  it("should read a namespace aware XSLT attribute", () => {
    const element = parseXML(
      `<e xmlns:xsl="${XSLT_NAMESPACE}" xsl:use-attribute-sets="s"/>`,
    ).documentElement;

    assert.strictEqual(
      getXsltAttribute(element, "use-attribute-sets", XSLT_NAMESPACE),
      "s",
    );
  });

  it("should read a prefixed XSLT attribute without a namespace", () => {
    const element = dom.window.document.createElement("e");
    element.setAttribute("xsl:use-attribute-sets", "s");

    assert.strictEqual(
      getXsltAttribute(element, "use-attribute-sets", XSLT_NAMESPACE),
      "s",
    );
  });

  it("should return null when the attribute is absent", () => {
    const element = parseXML('<e a="1"/>').documentElement;

    assert.strictEqual(
      getXsltAttribute(element, "use-attribute-sets", XSLT_NAMESPACE),
      null,
    );
  });

  it("should return null for nodes without attributes", () => {
    const text = parseXML("<e>x</e>").documentElement.firstChild;

    assert.strictEqual(
      getXsltAttribute(text, "use-attribute-sets", XSLT_NAMESPACE),
      null,
    );
  });
});
