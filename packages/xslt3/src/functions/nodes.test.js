import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { code, parse, xs } from "../xpath/testing.test.js";

const doc = parse(
  '<r xmlns:p="urn:p" xml:lang="en-GB" xml:base="http://x.org/a/"><p:e p:at="1" b="2"/><f xml:base="sub/">t<!--c--><?pi v?><g/><g/></f></r>',
);
doc.documentURI = "http://x.org/doc.xml";

describe("names of nodes", () => {
  it("gives name, local-name, namespace-uri and node-name", () => {
    assert.equal(
      xs("/r/*[1] ! (name(), local-name(), namespace-uri())", doc),
      "p:e e urn:p",
    );
    assert.equal(xs("/r/*[1]/@* ! name()", doc), "p:at b");
    assert.equal(xs("name(()), local-name(()), namespace-uri(())", doc), "  ");
    assert.equal(
      xs("/r/f/text() ! (name(), local-name(), namespace-uri())", doc),
      "  ",
    );
    assert.equal(
      xs("/r/f/processing-instruction() ! (name(), node-name())", doc),
      "pi pi",
    );
    assert.equal(xs("/r/namespace::p ! (name(), local-name())", doc), "p p");
    assert.equal(xs("node-name(/r/*[1])", doc), "p:e");
    assert.equal(xs("node-name(/), node-name(())", doc), "");
    assert.equal(code("name(1)"), "XPTY0004");
    assert.equal(code("name()", 1), "XPTY0004");
  });
});

describe("other node functions", () => {
  it("gives roots, children and nilled", () => {
    assert.equal(xs("root(/r/f/g[1]) is /", doc), "true");
    assert.equal(xs("/r/f/g[1] ! (root() is /)", doc), "true");
    assert.equal(xs("root(())", doc), "");
    assert.equal(
      xs("has-children(/r/f), has-children(/r/f/g[1]), has-children(())", doc),
      "true false false",
    );
    assert.equal(
      xs("nilled(/r), nilled(/r/@xml:lang), nilled(())", doc),
      "false",
    );
  });

  it("generates stable identifiers", () => {
    assert.equal(xs("generate-id(/r) eq generate-id(/r)", doc), "true");
    assert.equal(xs("generate-id(/r) ne generate-id(/r/f)", doc), "true");
    assert.equal(xs("generate-id(())", doc), "");
  });

  it("keeps the innermost or outermost nodes", () => {
    assert.equal(xs("innermost((/r, /r/f, /r/f/g))", doc), "<g> <g>");
    assert.equal(xs("outermost((/r/f/g, /r/f))", doc), "<f>");
  });

  it("tests the language", () => {
    assert.equal(
      xs("lang('en', /r/f), lang('EN-gb', /r), lang('fr', /r)", doc),
      "true true false",
    );
    assert.equal(xs("/r/f/g[1] ! lang('en')", doc), "true");
    assert.equal(xs("lang((), /r)", doc), "false");
    assert.equal(xs("lang('en', .)", parse("<x/>")), "false");
  });
});

describe("paths, URIs and namespaces of nodes", () => {
  it("builds paths", () => {
    assert.equal(xs("path(/r/f/g[2])", doc), "/Q{}r[1]/Q{}f[1]/Q{}g[2]");
    assert.equal(
      xs("path(/r/*[1]/@Q{urn:p}at)", doc),
      "/Q{}r[1]/Q{urn:p}e[1]/@Q{urn:p}at",
    );
    assert.equal(xs("path(/r/*[1]/@b)", doc), "/Q{}r[1]/Q{urn:p}e[1]/@b");
    assert.equal(xs("path(/r/f/text())", doc), "/Q{}r[1]/Q{}f[1]/text()[1]");
    assert.equal(
      xs("path(/r/f/comment())", doc),
      "/Q{}r[1]/Q{}f[1]/comment()[1]",
    );
    assert.equal(
      xs("path(/r/f/processing-instruction())", doc),
      "/Q{}r[1]/Q{}f[1]/processing-instruction(pi)[1]",
    );
    assert.equal(xs("path(/r/namespace::p)", doc), "/Q{}r[1]/namespace::p");
    assert.equal(xs("path(/), path(())", doc), "/");
    assert.equal(xs("/r ! path()", doc), "/Q{}r[1]");
    const detached = doc.createElement("d");
    detached.appendChild(doc.createElement("c"));
    assert.equal(
      xs("path(.)", detached),
      "Q{http://www.w3.org/2005/xpath-functions}root()",
    );
    assert.equal(
      xs("path(*)", detached),
      "Q{http://www.w3.org/2005/xpath-functions}root()/Q{}c[1]",
    );
    const plain = parse("<r xmlns='urn:d'/>");
    assert.equal(
      xs("path(/*/namespace::*[not(local-name())])", plain),
      '/Q{urn:d}r[1]/namespace::*[Q{http://www.w3.org/2005/xpath-functions}local-name()=""]',
    );
  });

  it("gives base and document URIs", () => {
    assert.equal(xs("base-uri(/r/f/g[1])", doc), "http://x.org/a/sub/");
    assert.equal(xs("/r ! base-uri()", doc), "http://x.org/a/");
    assert.equal(xs("base-uri(())", doc), "");
    assert.equal(xs("base-uri(/)", doc), "http://x.org/doc.xml");
    assert.equal(
      xs("document-uri(/), document-uri(/r), document-uri(())", doc),
      "http://x.org/doc.xml",
    );
    assert.equal(
      xs("(/) ! document-uri(), /r ! document-uri()", doc),
      "http://x.org/doc.xml",
    );
    assert.equal(xs("document-uri(/)", parse("<r/>")), "");
  });

  it("gives in-scope prefixes and their URIs", () => {
    assert.equal(xs("sort(in-scope-prefixes(/r))", doc), "p xml");
    assert.equal(xs("namespace-uri-for-prefix('p', /r)", doc), "urn:p");
    assert.equal(xs("namespace-uri-for-prefix((), /r)", doc), "");
    assert.equal(xs("namespace-uri-for-prefix('q', /r)", doc), "");
  });
});

describe("functions on QNames", () => {
  it("builds and resolves QNames", () => {
    assert.equal(
      xs(
        "QName('urn:a', 'p:x') ! (prefix-from-QName(.), local-name-from-QName(.), namespace-uri-from-QName(.))",
      ),
      "p x urn:a",
    );
    assert.equal(
      xs(
        "QName((), 'x') ! (prefix-from-QName(.), namespace-uri-from-QName(.))",
      ),
      "",
    );
    assert.equal(code("QName('', 'p:x')"), "FOCA0002");
    assert.equal(code("QName('urn:a', '1x')"), "FOCA0002");
    assert.equal(
      xs("resolve-QName('p:x', /r) ! namespace-uri-from-QName(.)", doc),
      "urn:p",
    );
    assert.equal(
      xs("resolve-QName('x', /r) ! namespace-uri-from-QName(.)", doc),
      "",
    );
    assert.equal(xs("resolve-QName((), /r)", doc), "");
    assert.equal(code("resolve-QName('q:x', /r)", doc), "FONS0004");
    assert.equal(code("resolve-QName('1x', /r)", doc), "FOCA0002");
    assert.equal(xs("prefix-from-QName(()), local-name-from-QName(())"), "");
  });
});
