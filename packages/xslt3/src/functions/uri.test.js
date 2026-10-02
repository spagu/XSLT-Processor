import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { removeDotSegments, resolveUri, uriFunctions } from "./uri.js";
import { call, checkDefinitions, one, throwsCode } from "./testing.test.js";

const f = (local, args, ctx) => call(uriFunctions, local, args, ctx);

describe("URI escaping functions", () => {
  checkDefinitions(uriFunctions);

  it("encode-for-uri escapes all but unreserved characters", () => {
    assert.equal(
      one(
        f("encode-for-uri", [
          "http://www.example.com/00/Weather/CA/Los%20Angeles#ocean",
        ]),
      ),
      "http%3A%2F%2Fwww.example.com%2F00%2FWeather%2FCA%2FLos%2520Angeles%23ocean",
    );
    assert.equal(one(f("encode-for-uri", ["~bébé"])), "~b%C3%A9b%C3%A9");
    assert.equal(
      one(f("encode-for-uri", ["100% organic"])),
      "100%25%20organic",
    );
    assert.equal(one(f("encode-for-uri", [null])), "");
  });

  it("iri-to-uri escapes characters not allowed in URIs", () => {
    assert.equal(
      one(
        f("iri-to-uri", [
          "http://www.example.com/00/Weather/CA/Los%20Angeles#ocean",
        ]),
      ),
      "http://www.example.com/00/Weather/CA/Los%20Angeles#ocean",
    );
    assert.equal(
      one(f("iri-to-uri", ["http://www.example.com/~bébé"])),
      "http://www.example.com/~b%C3%A9b%C3%A9",
    );
    assert.equal(
      one(f("iri-to-uri", ['a b<>"{}|\\^`\u007f'])),
      "a%20b%3C%3E%22%7B%7D%7C%5C%5E%60%7F",
    );
  });

  it("escape-html-uri escapes only non-printable-ASCII characters", () => {
    assert.equal(
      one(
        f("escape-html-uri", [
          "http://www.example.com/00/Weather/CA/Los Angeles#ocean",
        ]),
      ),
      "http://www.example.com/00/Weather/CA/Los Angeles#ocean",
    );
    assert.equal(
      one(
        f("escape-html-uri", [
          "javascript:if (navigator.browserLanguage == 'fr') window.open('http://www.example.com/~bébé');",
        ]),
      ),
      "javascript:if (navigator.browserLanguage == 'fr') window.open('http://www.example.com/~b%C3%A9b%C3%A9');",
    );
    assert.equal(one(f("escape-html-uri", ["\t😀"])), "%09%F0%9F%98%80");
  });
});

describe("resolve-uri", () => {
  const base = "http://a/b/c/d;p?q";
  it("resolves the RFC 3986 reference examples", () => {
    const cases = {
      "g:h": "g:h",
      g: "http://a/b/c/g",
      "./g": "http://a/b/c/g",
      "g/": "http://a/b/c/g/",
      "/g": "http://a/g",
      "//g": "http://g",
      "?y": "http://a/b/c/d;p?y",
      "g?y": "http://a/b/c/g?y",
      "#s": "http://a/b/c/d;p?q#s",
      "g#s": "http://a/b/c/g#s",
      ";x": "http://a/b/c/;x",
      "": "http://a/b/c/d;p?q",
      ".": "http://a/b/c/",
      "./": "http://a/b/c/",
      "..": "http://a/b/",
      "../g": "http://a/b/g",
      "../..": "http://a/",
      "../../../g": "http://a/g",
      "/./g": "http://a/g",
      "/../g": "http://a/g",
      "g.": "http://a/b/c/g.",
      "g..": "http://a/b/c/g..",
      "./g/.": "http://a/b/c/g/",
      "g/../h": "http://a/b/c/h",
    };
    for (const [relative, expected] of Object.entries(cases)) {
      assert.equal(resolveUri(relative, base), expected, relative);
    }
    assert.equal(resolveUri("x", "http://host"), "http://host/x");
    assert.equal(resolveUri("x", "urn:a"), "urn:x");
    assert.equal(removeDotSegments("."), "");
    assert.equal(removeDotSegments("../a"), "a");
  });

  it("is a function of one or two arguments", () => {
    assert.equal(
      one(f("resolve-uri", ["examples", "http://www.examples.com/"])),
      "http://www.examples.com/examples",
    );
    assert.equal(
      one(f("resolve-uri", ["a"], { staticBaseUri: "http://x/y/z" })),
      "http://x/y/a",
    );
    assert.deepEqual(f("resolve-uri", [null, "http://x/"]), []);
    throwsCode(() => f("resolve-uri", ["a"], {}), "FONS0005");
    assert.equal(one(f("resolve-uri", ["http://x/a"], {})), "http://x/a");
    throwsCode(
      () => f("resolve-uri", ["a"], { staticBaseUri: null }),
      "FONS0005",
    );
    // "#" cannot appear in a fragment
    throwsCode(() => f("resolve-uri", ["##x", "http://x/"]), "FORG0002");
  });

  it("rejects invalid URIs and bases", () => {
    throwsCode(() => resolveUri(":", "http://www.example.com/"), "FORG0002");
    throwsCode(() => resolveUri("examples", "http:%%"), "FORG0002");
    throwsCode(() => resolveUri("a.html", "b.html"), "FORG0002");
    throwsCode(() => resolveUri("b", "http://x/a#frag"), "FORG0002");
    assert.equal(resolveUri("http://x/a", "b.html"), "http://x/a");
  });
});
