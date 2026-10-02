import { describe, it } from "node:test";
import { checkBodies } from "../testing.test.js";

const options = { attributes: 'expand-text="yes"' };
const cities =
  '<doc><c n="milan" k="it" p="5"/><c n="paris" k="fr" p="7"/><c n="rome" k="it" p="6"/></doc>';

describe("xsl:sort", () => {
  it("sorts by keys", () => {
    checkBodies(
      [
        [
          "<xsl:perform-sort select=\"'b', 'a', 'C'\"><xsl:sort/></xsl:perform-sort>",
          "C a b",
        ],
        [
          "<xsl:perform-sort select=\"'b', 'a', 'B'\"><xsl:sort lang=\"en\"/></xsl:perform-sort>",
          "a B b",
        ],
        [
          "<xsl:perform-sort select=\"'b', 'a', 'B'\"><xsl:sort case-order=\"lower-first\"/></xsl:perform-sort>",
          "a b B",
        ],
        [
          '<xsl:perform-sort select="10, 9, 100"><xsl:sort data-type="number"/></xsl:perform-sort>',
          "9 10 100",
        ],
        [
          '<xsl:perform-sort select="10, 9, 100"><xsl:sort data-type="text"/></xsl:perform-sort>',
          "10 100 9",
        ],
        [
          '<xsl:perform-sort select="2, 1"><xsl:sort data-type="my:t" xmlns:my="urn:my"/></xsl:perform-sort>',
          "1 2",
        ],
        [
          "<xsl:perform-sort select=\"xs:double('NaN'), 1, ()\"><xsl:sort/></xsl:perform-sort>",
          "NaN 1",
        ],
        [
          '<xsl:perform-sort select="(1, 2)[. = 0], 2, 1"><xsl:sort select="if (. = 2) then () else ."/></xsl:perform-sort>',
          "2 1",
        ],
        [
          "<xsl:perform-sort select=\"1, xs:double('NaN'), 2, xs:double('NaN')\"><xsl:sort/></xsl:perform-sort>",
          "NaN NaN 1 2",
        ],
        [
          '<xsl:perform-sort select="1 to 3"><xsl:sort select="0"/><xsl:sort order="descending"/></xsl:perform-sort>',
          "3 2 1",
        ],
        [
          '<xsl:perform-sort select="1 to 3"><xsl:sort><xsl:sequence select="-."/></xsl:sort></xsl:perform-sort>',
          "3 2 1",
        ],
        [
          "<xsl:perform-sort select=\"'b', 'A'\"><xsl:sort collation=\"http://www.w3.org/2005/xpath-functions/collation/html-ascii-case-insensitive\"/></xsl:perform-sort>",
          "A b",
        ],
        [
          '<xsl:perform-sort select="1, 2"><xsl:sort order="up"/></xsl:perform-sort>',
          "XTDE0030",
        ],
        [
          '<xsl:perform-sort select="1, 2"><xsl:sort data-type="x"/></xsl:perform-sort>',
          "XTDE0030",
        ],
        [
          '<xsl:perform-sort select="1, 2"><xsl:sort case-order="x"/></xsl:perform-sort>',
          "XTDE0030",
        ],
        [
          '<xsl:perform-sort select="1, 2"><xsl:sort lang="!!"/></xsl:perform-sort>',
          "XTDE0030",
        ],
        [
          '<xsl:perform-sort select="1, 2"><xsl:sort collation="urn:none"/></xsl:perform-sort>',
          "XTDE1035",
        ],
        [
          "<xsl:perform-sort select=\"1, 'a'\"><xsl:sort/></xsl:perform-sort>",
          "XTDE1030",
        ],
        [
          '<xsl:perform-sort select="1, 2"><xsl:sort select="1, 2"/></xsl:perform-sort>',
          "XTTE1020",
        ],
        [
          '<xsl:perform-sort select="1"><xsl:sort select="1">x</xsl:sort></xsl:perform-sort>',
          "XTSE1015",
        ],
      ],
      options,
    );
  });

  it("keeps the first item in backwards-compatible mode", () => {
    checkBodies(
      [
        [
          '<xsl:for-each select="3, 1"><xsl:sort select="(., 0)"/><xsl:value-of select="."/></xsl:for-each>',
          "13",
        ],
      ],
      { version: "1.0" },
    );
  });
});

describe("xsl:for-each-group", () => {
  it("groups by keys", () => {
    checkBodies(
      [
        [
          '<xsl:for-each-group select="doc/c" group-by="@k">{current-grouping-key()}={count(current-group())};</xsl:for-each-group>',
          "it=2;fr=1;",
          cities,
        ],
        [
          '<xsl:for-each-group select="doc/c" group-by="@k"><xsl:sort select="current-grouping-key()"/>{current-grouping-key()};</xsl:for-each-group>',
          "fr;it;",
          cities,
        ],
        [
          '<xsl:for-each-group select="1, 1.0, 2e0, \'a\', \'A\'" group-by="." collation="http://www.w3.org/2005/xpath-functions/collation/html-ascii-case-insensitive">{count(current-group())}</xsl:for-each-group>',
          "212",
        ],
        [
          '<xsl:for-each-group select="1 to 3" group-by="(1, 2, 1)">{current-grouping-key()}:{current-group()};</xsl:for-each-group>',
          "1:1 2 3;2:1 2 3;",
        ],
        [
          '<xsl:for-each-group select="1, 1, 2, 1" group-adjacent=".">{count(current-group())}</xsl:for-each-group>',
          "211",
        ],
        [
          '<xsl:for-each-group select="1" group-adjacent="(1, 2)"/>',
          "XTTE1100",
        ],
        [
          '<xsl:for-each-group select="1" group-by="." collation="urn:x"/>',
          "XTDE1110",
        ],
        ['<xsl:for-each-group select="1"/>', "XTSE1080"],
        [
          '<xsl:for-each-group select="1" group-by="." group-adjacent="."/>',
          "XTSE1080",
        ],
        [
          '<xsl:for-each-group select="1" group-starting-with="a" collation="urn:x"/>',
          "XTSE1090",
        ],
        ['<xsl:for-each-group select="()" group-by="."/>', ""],
      ],
      options,
    );
  });

  it("groups by patterns", () => {
    const xml = "<doc><h/><p/><p/><h/><p/></doc>";
    checkBodies(
      [
        [
          '<xsl:for-each-group select="doc/*" group-starting-with="h">{count(current-group())}</xsl:for-each-group>',
          "32",
          xml,
        ],
        [
          '<xsl:for-each-group select="doc/*" group-ending-with="h">{count(current-group())}</xsl:for-each-group>',
          "131",
          xml,
        ],
        [
          '<xsl:for-each-group select="doc/p" group-starting-with="h">{count(current-group())}</xsl:for-each-group>',
          "3",
          xml,
        ],
        [
          '<xsl:for-each-group select="1 to 5" group-starting-with=".[. mod 2 = 1]">{count(current-group())}</xsl:for-each-group>',
          "221",
        ],
        [
          '<xsl:variable name="n" select="\'h\'"/><xsl:for-each-group select="doc/*" group-starting-with="*[name() = $n]">{count(current-group())}</xsl:for-each-group>',
          "32",
          xml,
        ],
      ],
      options,
    );
    // a 3.0 processor groups any items, even for a 2.0 stylesheet
    checkBodies(
      [
        [
          '<xsl:for-each-group select="1, 2" group-starting-with=".[. = 2]">[{current-group()}]</xsl:for-each-group>',
          "[1][2]",
        ],
      ],
      { ...options, version: "2.0" },
    );
  });
});

describe("xsl:analyze-string", () => {
  it("processes matching and non-matching substrings", () => {
    checkBodies(
      [
        [
          '<xsl:analyze-string select="\'a1b22\'" regex="([0-9])([0-9])?"><xsl:matching-substring>[{regex-group(1)}|{regex-group(2)}|{regex-group(9)}]</xsl:matching-substring><xsl:non-matching-substring>({.})</xsl:non-matching-substring></xsl:analyze-string>',
          "(a)[1||](b)[2|2|]",
        ],
        [
          '<xsl:analyze-string select="\'aXb\'" regex="x" flags="i"><xsl:matching-substring>!</xsl:matching-substring></xsl:analyze-string>',
          "!",
        ],
        [
          '<xsl:analyze-string select="()" regex="x"><xsl:non-matching-substring>no</xsl:non-matching-substring></xsl:analyze-string>',
          "",
        ],
        [
          '<xsl:analyze-string select="\'ab\'" regex="b"><xsl:non-matching-substring><xsl:value-of select="regex-group(0)"/>{.}</xsl:non-matching-substring></xsl:analyze-string>',
          "a",
        ],
        [
          '<xsl:analyze-string select="1" regex="x"><xsl:matching-substring/><xsl:fallback/></xsl:analyze-string>',
          "XPTY0004",
        ],
        [
          '<xsl:analyze-string select="1" regex="x"><xsl:fallback/><xsl:matching-substring/></xsl:analyze-string>',
          "XTSE0010",
        ],
        [
          "<xsl:analyze-string select=\"('a', 'b')\" regex=\"x\"><xsl:matching-substring/></xsl:analyze-string>",
          "XPTY0004",
        ],
        [
          '<xsl:analyze-string select="\'a\'" regex="("><xsl:matching-substring/></xsl:analyze-string>',
          "XTDE1140",
        ],
        [
          '<xsl:analyze-string select="\'a\'" regex="a" flags="z"><xsl:matching-substring/></xsl:analyze-string>',
          "XTDE1145",
        ],
        [
          '<xsl:analyze-string select="\'a\'" regex="a?"><xsl:matching-substring/></xsl:analyze-string>',
          "XTDE1150",
        ],
        ['<xsl:analyze-string select="\'a\'" regex="a"/>', "XTSE1130"],
        [
          '<xsl:analyze-string select="\'a\'" regex="a"><b/></xsl:analyze-string>',
          "XTSE0010",
        ],
      ],
      options,
    );
  });
});
