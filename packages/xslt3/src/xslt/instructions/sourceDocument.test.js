import { describe, it } from "node:test";
import { checkBodies, parse } from "../testing.test.js";

const documents = {
  "urn:a.xml": "<a><b>1</b><b>2</b></a>",
  "urn:c.xml": "<c/>",
};

const options = {
  attributes: 'expand-text="yes"',
  declarations:
    '<xsl:accumulator name="n" initial-value="0"><xsl:accumulator-rule match="b" select="$value + 1"/></xsl:accumulator>',
  documentLoader: (uri) => parse(documents[uri]),
};

describe("xsl:source-document", () => {
  it("runs its content on a document", () => {
    checkBodies(
      [
        [
          '<xsl:source-document href="urn:a.xml">{count(a/b)}</xsl:source-document>',
          "2",
        ],
        [
          '<xsl:source-document href="urn:{\'c\'}.xml" streamable="yes" validation="strip"/>',
          "",
        ],
        [
          '<xsl:source-document href="urn:a.xml" use-accumulators="n">{a/b[2]/accumulator-after("n")}</xsl:source-document>',
          "2",
        ],
        [
          '<xsl:source-document href="urn:a.xml">{a/b[2]/accumulator-after("n")}</xsl:source-document>',
          "XTDE3362",
        ],
        [
          '<xsl:source-document href="urn:a.xml" validation="strict"/>',
          "XTSE1660",
        ],
        ['<xsl:source-document href="urn:a.xml" type="t"/>', "XTSE1660"],
        [
          '<xsl:source-document href="urn:a.xml" validation="loose"/>',
          "XTSE0020",
        ],
        [
          '<xsl:source-document href="urn:a.xml" use-accumulators="m"/>',
          "XTSE3300",
        ],
      ],
      options,
    );
  });
});
