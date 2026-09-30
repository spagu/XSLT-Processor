/**
 * EXSLT strings module tests. Expected values follow libexslt `strings.c`
 * and libxml2 `xmlURIEscapeStr()` / `xmlURIUnescapeString()`.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { assertValues, runTemplate, valueOf } from "./exsltHarness.test.js";
import {
  MAX_PADDING,
  alignString,
  replaceStrings,
  splitString,
  tokenizeString,
} from "./stringOps.js";
import { decodeUri, encodeUri } from "./uri.js";

const XML =
  "<r><n>1</n><n>2</n><s>a</s><s>ab</s><t>X</t><t>Y</t><e></e><w>b</w><w>c</w></r>";

describe("str:tokenize()", () => {
  it("should follow libexslt on a table", () => {
    assertValues([
      ["count(str:tokenize(' a b\t\nc\r '))", "3"],
      [
        "str:concat(str:tokenize('2001-06-03T11:40:23', '-T:'))",
        "20010603114023",
      ],
      ["count(str:tokenize('abc', ''))", "3"],
      ["str:tokenize('abc', '')[2]", "b"],
      ["count(str:tokenize('', ','))", "0"],
      ["count(str:tokenize(',,a,,', ','))", "1"],
      ["str:tokenize('a,b;c', ',;')[3]", "c"],
      ["name(str:tokenize('a'))", "token"],
      ["namespace-uri(str:tokenize('a'))", ""],
      ["count(str:tokenize('a b')[1]/following-sibling::token)", "1"],
    ]);
  });

  it("should count characters, not UTF-16 units", () => {
    assert.deepStrictEqual(tokenizeString("😀x😀", ""), ["😀", "x", "😀"]);
    assert.deepStrictEqual(tokenizeString("a😀b", "😀"), ["a", "b"]);
  });

  it("should copy token elements to the result", () => {
    assert.strictEqual(
      runTemplate("<xsl:copy-of select=\"str:tokenize('a b')\"/>", {
        method: "xml",
      }),
      "<token>a</token><token>b</token>",
    );
  });
});

describe("str:split()", () => {
  it("should follow libexslt on a table", () => {
    assertValues([
      ["count(str:split('a, b, c', ', '))", "3"],
      ["str:split('a, b, c', ', ')[2]", "b"],
      ["count(str:split('a  b'))", "2"],
      ["count(str:split('aXbxc', 'x'))", "3"],
      ["count(str:split('abc', ''))", "3"],
      ["count(str:split('', ' '))", "0"],
      ["str:split('--a--', '-')", "a"],
      ["count(str:split('aaa', 'aa'))", "1"],
      ["str:split('aaa', 'aa')", "a"],
    ]);
    assert.deepStrictEqual(splitString("x", "x"), []);
  });
});

describe("str:replace()", () => {
  it("should follow libexslt on a table", () => {
    assertValues(
      [
        ["str:replace('abcabc', 'b', 'Z')", "aZcaZc"],
        ["str:replace('abc', //s, //t)", "Yc"],
        ["str:replace('abc', //w, 'Z')", "aZ"],
        ["str:replace('abc', //none, 'Z')", "abc"],
        ["str:replace('abc', '', '-')", "a-b-c"],
        ["str:replace('abc', '', '')", "abc"],
        ["str:replace('ab', //e | //w, //t)", "aY"],
        ["str:replace('axb', //e | //w, //t)", "aXxY"],
        ["str:replace('aaa', 'a', //none)", ""],
        ["count(str:replace('', 'a', 'b'))", "1"],
        ["exsl:object-type(str:replace('a', 'a', 'b'))", "node-set"],
        ["str:replace(//n, //n, 'Z')", "Z"],
      ],
      { xml: XML },
    );
  });

  it("should step over surrogate pairs", () => {
    assert.strictEqual(replaceStrings("😀b", ["", "b"], ["-", "B"]), "😀B");
    assert.strictEqual(replaceStrings("😀x", [""], ["-"]), "😀-x");
  });
});

describe("str:padding() / str:align()", () => {
  it("should pad and truncate like libexslt", () => {
    assertValues([
      ["str:padding(5, 'ab')", "ababa"],
      ["concat('[', str:padding(3), ']')", "[   ]"],
      ["concat('[', str:padding(2, ''), ']')", "[  ]"],
      ["str:padding(0, 'x')", ""],
      ["str:padding(-1, 'x')", ""],
      ["str:padding(number('x'), 'x')", ""],
      ["str:padding(2.9, 'x')", "xx"],
      ["str:padding(3, 'é')", "ééé"],
      ["string-length(str:padding(200000))", String(MAX_PADDING)],
    ]);
  });

  it("should align like libexslt", () => {
    assertValues([
      ["str:align('abc', '-----')", "abc--"],
      ["str:align('abc', '-----', 'left')", "abc--"],
      ["str:align('abc', '-----', 'right')", "--abc"],
      ["str:align('abc', '-----', 'center')", "-abc-"],
      ["str:align('a', '1234', 'center')", "1a34"],
      ["str:align('abcdef', '---')", "abc"],
      ["str:align('ab', '--', 'right')", "ab"],
      ["str:align('x', '---', 'middle')", "x--"],
    ]);
    assert.strictEqual(alignString("😀", "ab", "right"), "a😀");
  });
});

describe("str:concat()", () => {
  it("should concatenate the string values of a node-set", () => {
    assertValues(
      [
        ["str:concat(//n)", "12"],
        ["str:concat(//none)", ""],
      ],
      { xml: XML },
    );
    assert.throws(
      () => valueOf("str:concat('a')"),
      /str:concat\(\) expects a node-set/,
    );
  });
});

describe("str:encode-uri() / str:decode-uri()", () => {
  it("should escape like xmlURIEscapeStr", () => {
    assertValues([
      [
        "str:encode-uri('http://www.example.com/my résumé.html', true())",
        "http%3A%2F%2Fwww.example.com%2Fmy%20r%C3%A9sum%C3%A9.html",
      ],
      [
        "str:encode-uri('http://www.example.com/my résumé.html', false())",
        "http://www.example.com/my%20r%C3%A9sum%C3%A9.html",
      ],
      [`str:encode-uri("-_.!~*'()", true())`, "-_.!~*'()"],
      ["str:encode-uri('#%[]', false())", "%23%25[]"],
      ["str:encode-uri('#%[]', true())", "%23%25%5B%5D"],
      ["str:encode-uri('a b', true(), 'UTF-8')", "a%20b"],
      ["str:encode-uri('a b', true(), 'utf-8')", ""],
      ["str:encode-uri('', true())", ""],
    ]);
  });

  it("should unescape like xmlURIUnescapeString", () => {
    assertValues([
      ["str:decode-uri('a%20b')", "a b"],
      ["str:decode-uri('%C3%a9')", "é"],
      ["str:decode-uri('%E9')", ""],
      ["str:decode-uri('100%')", "100%"],
      ["str:decode-uri('%4')", "%4"],
      ["str:decode-uri('%zz%41')", "%zzA"],
      ["str:decode-uri('a+b')", "a+b"],
      ["str:decode-uri('a%00b')", "a"],
      ["str:decode-uri('a%20b', 'UTF-8')", "a b"],
      ["str:decode-uri('a%20b', 'ISO-8859-1')", ""],
    ]);
  });

  it("should refuse strings that are not well-formed Unicode", () => {
    assert.strictEqual(encodeUri("a\uD800", true), "");
    assert.strictEqual(decodeUri("\uDC00"), "");
    assert.strictEqual(encodeUri("😀", true), "%F0%9F%98%80");
  });
});

describe("strings argument checks", () => {
  it("should check the arity of every function", () => {
    const calls = [
      "str:tokenize()",
      "str:split('a', 'b', 'c')",
      "str:replace('a', 'b')",
      "str:padding()",
      "str:align('a')",
      "str:concat()",
      "str:encode-uri('a')",
      "str:decode-uri()",
    ];
    for (const call of calls) {
      assert.throws(() => valueOf(call), /expects/, call);
    }
  });
});
