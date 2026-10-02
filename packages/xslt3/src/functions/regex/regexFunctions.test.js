import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { analyzeStringFunctions, analyzeStringTree } from "./analyzeString.js";
import { parseReplacement, regexFunctions } from "./regexFunctions.js";
import {
  call,
  checkDefinitions,
  one,
  strings,
  throwsCode,
} from "../testing.test.js";

const f = (local, ...args) => call(regexFunctions, local, args);
const poem =
  "Kaum hat dies der Hahn gesehen,\nFängt er auch schon an zu krähen:\n" +
  "Kikeriki! Kikikerikih!!\nTak, tak, tak! - da kommen sie.";

describe("matches", () => {
  checkDefinitions(regexFunctions);

  it("tests patterns with flags (F&O examples)", () => {
    const m = (...args) => one(f("matches", ...args));
    assert.equal(m("abracadabra", "bra"), "true");
    assert.equal(m("abracadabra", "^a.*a$"), "true");
    assert.equal(m("abracadabra", "^bra"), "false");
    assert.equal(m(poem, "Kaum.*krähen"), "false");
    assert.equal(m(poem, "Kaum.*krähen", "s"), "true");
    assert.equal(m(poem, "^Kaum.*gesehen,$", "m"), "true");
    assert.equal(m(poem, "^Kaum.*gesehen,$"), "false");
    assert.equal(m(poem, "kiki", "i"), "true");
    assert.equal(m(null, "^$"), "true");
    throwsCode(() => m("a", "("), "FORX0002");
    throwsCode(() => m("a", "a", "z"), "FORX0001");
  });
});

describe("replace", () => {
  const r = (...args) => one(f("replace", ...args));
  it("replaces matches with group references (F&O examples)", () => {
    assert.equal(r("abracadabra", "bra", "*"), "a*cada*");
    assert.equal(r("abracadabra", "a.*a", "*"), "*");
    assert.equal(r("abracadabra", "a.*?a", "*"), "*c*bra");
    assert.equal(r("abracadabra", "a", ""), "brcdbr");
    assert.equal(r("abracadabra", "a(.)", "a$1$1"), "abbraccaddabbra");
    assert.equal(r("AAAA", "A+", "b"), "b");
    assert.equal(r("AAAA", "A+?", "b"), "bbbb");
    assert.equal(r("darted", "^(.*?)d(.*)$", "$1c$2"), "carted");
    assert.equal(r("abc", "(b)", "[$0|\\$|\\\\]"), "a[b|$|\\]c");
    assert.equal(r("abc", "b", "$", "q"), "a$c");
    assert.equal(r("a.c", ".", "!", "q"), "a!c");
    assert.equal(r(null, "a", "b"), "");
    assert.equal(r("ab", "(a)|(b)", "[$2]"), "[][b]");
  });

  it("rejects empty matches and invalid replacements", () => {
    throwsCode(() => r("abracadabra", ".*?", "$1"), "FORX0003");
    throwsCode(() => r("abc", "b", "$x"), "FORX0004");
    throwsCode(() => r("abc", "b", "\\n"), "FORX0004");
    throwsCode(() => r("abc", "b", "$"), "FORX0004");
  });

  it("reads group numbers greedily up to the group count", () => {
    assert.deepEqual(parseReplacement("$12", 1), [1, "2"]);
    assert.deepEqual(parseReplacement("$12", 12), [12]);
    assert.deepEqual(parseReplacement("$9", 1), [9]);
  });
});

describe("tokenize", () => {
  const t = (...args) => strings(f("tokenize", ...args));
  it("splits on separators (F&O examples)", () => {
    assert.deepEqual(t(" red green blue "), ["red", "green", "blue"]);
    assert.deepEqual(t(null), []);
    assert.deepEqual(t("The cat sat on the mat", "\\s+"), [
      "The",
      "cat",
      "sat",
      "on",
      "the",
      "mat",
    ]);
    assert.deepEqual(t(" red green blue ", "\\s+"), [
      "",
      "red",
      "green",
      "blue",
      "",
    ]);
    assert.deepEqual(t("1, 15, 24, 50", ",\\s*"), ["1", "15", "24", "50"]);
    assert.deepEqual(t("1,15,,24,50,", ","), ["1", "15", "", "24", "50", ""]);
    assert.deepEqual(
      t("Some unparsed <br> HTML <BR> text", "\\s*<br>\\s*", "i"),
      ["Some unparsed", "HTML", "text"],
    );
    assert.deepEqual(t("", ","), []);
    throwsCode(() => t("abba", ".?"), "FORX0003");
  });
});

describe("analyze-string", () => {
  checkDefinitions(analyzeStringFunctions);
  const serializer = new XMLSerializer();
  const createDocument = () =>
    new DOMParser()
      .parseFromString("<x/>", "text/xml")
      .implementation.createDocument(null, null, null);
  const xml = (...args) => {
    const [node] = call(analyzeStringFunctions, "analyze-string", args, {
      createDocument,
    });
    return serializer
      .serializeToString(node)
      .replaceAll(' xmlns="http://www.w3.org/2005/xpath-functions"', "");
  };

  it("builds match and non-match elements with nested groups", () => {
    assert.equal(
      xml("The cat sat on the mat.", "\\w+"),
      "<analyze-string-result><match>The</match><non-match> </non-match>" +
        "<match>cat</match><non-match> </non-match><match>sat</match>" +
        "<non-match> </non-match><match>on</match><non-match> </non-match>" +
        "<match>the</match><non-match> </non-match><match>mat</match>" +
        "<non-match>.</non-match></analyze-string-result>",
    );
    assert.equal(
      xml("2008-12-03", "^(\\d+)\\-(\\d+)\\-(\\d+)$"),
      '<analyze-string-result><match><group nr="1">2008</group>-' +
        '<group nr="2">12</group>-<group nr="3">03</group></match>' +
        "</analyze-string-result>",
    );
    assert.equal(
      xml("A1,C15,,D24, X50,", "([A-Z])([0-9]+)"),
      '<analyze-string-result><match><group nr="1">A</group><group nr="2">1</group></match>' +
        '<non-match>,</non-match><match><group nr="1">C</group><group nr="2">15</group></match>' +
        '<non-match>,,</non-match><match><group nr="1">D</group><group nr="2">24</group></match>' +
        '<non-match>, </non-match><match><group nr="1">X</group><group nr="2">50</group></match>' +
        "<non-match>,</non-match></analyze-string-result>",
    );
    assert.equal(
      xml("abc", "(a(b))(x)?c", ""),
      '<analyze-string-result><match><group nr="1">a<group nr="2">b</group></group>c</match>' +
        "</analyze-string-result>",
    );
    assert.equal(xml(null, "a"), "<analyze-string-result/>");
  });

  it("skips group spans of an earlier iteration of a repeated group", () => {
    const tree = analyzeStringTree("ab", "((a)|b)+");
    assert.deepEqual(tree.children[0].children, [
      "a",
      { name: "group", attributes: { nr: "1" }, children: ["b"] },
    ]);
    const empty = analyzeStringTree("ab", "a()b");
    assert.deepEqual(empty.children[0].children[1].children, []);
  });

  it("returns the plain tree without the createDocument hook", () => {
    const [tree] = call(analyzeStringFunctions, "analyze-string", ["ab", "b"]);
    assert.deepEqual(tree, {
      name: "analyze-string-result",
      attributes: {},
      children: [
        { name: "non-match", attributes: {}, children: ["a"] },
        { name: "match", attributes: {}, children: ["b"] },
      ],
    });
    throwsCode(() => analyzeStringTree("a", "x*"), "FORX0003");
  });
});
