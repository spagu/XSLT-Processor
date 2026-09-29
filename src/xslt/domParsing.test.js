/**
 * Tests for XML parsing with any DOM implementation (domParsing.js) and the
 * engine's `domParser` option.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { dom, parseXML, stylesheet } from "./harness.test.js";
import { findParseError, parseXml, resolveDomParser } from "./domParsing.js";
import { XsltEngine } from "./engine.js";

/**
 * Wrap a node so that `querySelector` is missing, like in xmldom; every
 * other property and method is forwarded to the real node.
 *
 * @param {Node} node - A jsdom node
 * @returns {Node} The restricted view
 */
function withoutQuerySelector(node) {
  return new Proxy(node, {
    get(target, property) {
      if (property === "querySelector" || property === "querySelectorAll") {
        return undefined;
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
    has(target, property) {
      return property !== "querySelector" && Reflect.has(target, property);
    },
  });
}

/** A DOMParser returning documents without querySelector. */
const minimalParser = {
  calls: 0,
  parseFromString(text, type) {
    this.calls++;
    const doc = new dom.window.DOMParser().parseFromString(text, type);
    return withoutQuerySelector(doc);
  },
};

/**
 * Run a function with the global DOMParser removed.
 *
 * @param {() => *} action - The code to run
 * @returns {*} Its result
 */
function withoutGlobalParser(action) {
  const saved = globalThis.DOMParser;
  delete globalThis.DOMParser;
  try {
    return action();
  } finally {
    globalThis.DOMParser = saved;
  }
}

describe("findParseError", () => {
  it("finds the parsererror element of a malformed document", () => {
    const doc = parseXML("<a>");
    assert.strictEqual(findParseError(doc)?.localName, "parsererror");
    assert.strictEqual(findParseError(parseXML("<a/>")), null);
  });

  it("finds Gecko's namespaced parsererror element", () => {
    const doc = parseXML(
      '<parsererror xmlns="http://www.mozilla.org/newlayout/xml/parsererror.xml"/>',
    );
    const hidden = new Proxy(doc, {
      get(target, property) {
        if (property === "getElementsByTagName") return () => [];
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    assert.strictEqual(findParseError(hidden)?.localName, "parsererror");
  });

  it("ignores values that are not documents", () => {
    assert.strictEqual(findParseError(null), null);
    assert.strictEqual(findParseError({}), null);
    assert.strictEqual(
      findParseError({ getElementsByTagName: () => [] }),
      null,
    );
  });
});

describe("resolveDomParser", () => {
  it("prefers the configured parser, then the global one", () => {
    assert.strictEqual(resolveDomParser(minimalParser, null), minimalParser);
    assert.ok(resolveDomParser(null, null) instanceof globalThis.DOMParser);
  });

  it("falls back to the window of the reference document", () => {
    const view = { DOMParser: dom.window.DOMParser };
    withoutGlobalParser(() => {
      assert.ok(
        resolveDomParser(null, { defaultView: view }) instanceof
          dom.window.DOMParser,
      );
      assert.strictEqual(resolveDomParser(null, null), null);
      assert.strictEqual(resolveDomParser(undefined, {}), null);
    });
  });
});

describe("parseXml", () => {
  it("parses markup and reports malformed markup", () => {
    const parser = new dom.window.DOMParser();
    assert.strictEqual(parseXml("<a/>", parser).documentElement.nodeName, "a");
    assert.throws(() => parseXml("<a>", parser), /XML parse error/);
  });

  it("explains how to provide a parser when none is available", () => {
    assert.throws(() => parseXml("<a/>", null), /domParser option/);
  });
});

describe("XsltEngine with a DOM lacking querySelector", () => {
  const main = stylesheet('<xsl:include href="lib.xsl"/>');
  const lib = stylesheet(
    '<xsl:template match="/"><xsl:value-of select="document(\'data.xml\')/v"/></xsl:template>',
  );

  it("loads string stylesheets and documents with the domParser option", () => {
    minimalParser.calls = 0;
    const engine = new XsltEngine({ domParser: minimalParser })
      .setStylesheetLoader(() => lib)
      .setDocumentLoader(() => "<v>loaded</v>");
    engine.importStylesheet(withoutQuerySelector(parseXML(main)), "main.xsl");

    const result = withoutGlobalParser(() =>
      engine.transformToString(parseXML("<d/>")),
    );
    assert.strictEqual(result, "loaded");
    assert.strictEqual(minimalParser.calls, 2);
  });

  it("chains the loader setters and removes loaders with null", () => {
    const engine = new XsltEngine({ stylesheetLoader: () => lib });
    assert.strictEqual(engine.setStylesheetLoader(null), engine);
    assert.strictEqual(engine.stylesheetLoader, null);
    assert.strictEqual(engine.setDocumentLoader(undefined), engine);
    assert.strictEqual(engine.documentLoader, null);
  });

  it("reports malformed strings returned by a loader", () => {
    const engine = new XsltEngine({ domParser: minimalParser });
    engine.setStylesheetLoader(() => "<xsl:stylesheet");
    assert.throws(
      () => engine.importStylesheet(parseXML(main), "main.xsl"),
      /Failed to include stylesheet "lib.xsl": XML parse error/,
    );
  });

  it("fails clearly when no parser is available at all", () => {
    const engine = new XsltEngine().setStylesheetLoader(() => lib);
    withoutGlobalParser(() =>
      assert.throws(
        () => engine.importStylesheet(parseXML(main), "main.xsl"),
        /XML parsing not available in this environment/,
      ),
    );
  });
});
