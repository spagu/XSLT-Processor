import { describe, it } from "node:test";
import { checkBodies, parse } from "../testing.test.js";

const xml =
  '<doc><log><e t="1">a</e><e t="3">b</e><e t="5">c</e></log><log><e t="2">d</e><e t="3">e</e></log></doc>';

const documents = {
  "urn:1.xml": '<log><e t="2"/><e t="4"/></log>',
  "urn:2.xml": '<log><e t="1"/></log>',
};

const options = {
  attributes: 'expand-text="yes"',
  xml,
  declarations:
    '<xsl:accumulator name="n" initial-value="0"><xsl:accumulator-rule match="e" select="$value + 1"/></xsl:accumulator>',
  documentLoader: (uri) => parse(documents[uri]),
};

/**
 * An xsl:merge with merge sources.
 * @param {string} sources
 * @param {string} [action]
 * @returns {string}
 */
const merge = (
  sources,
  action = "[{current-merge-key()}:{current-merge-group()}]",
) =>
  `<xsl:merge>${sources}<xsl:merge-action>${action}</xsl:merge-action></xsl:merge>`;

describe("xsl:merge", () => {
  it("merges sorted sequences", () => {
    checkBodies(
      [
        [
          merge(
            '<xsl:merge-source name="a" select="doc/log[1]/e"><xsl:merge-key select="xs:integer(@t)"/></xsl:merge-source>' +
              '<xsl:merge-source name="b" select="doc/log[2]/e"><xsl:merge-key select="xs:integer(@t)"/></xsl:merge-source>',
            '[{current-merge-key()}:{current-merge-group("a")}/{current-merge-group("b")}{position()}{last()}]',
          ),
          "[1:a/14][2:/d24][3:b/e34][5:c/44]",
        ],
        [
          merge(
            '<xsl:merge-source for-each-item="doc/log" select="e"><xsl:merge-key select="@t" order="descending"/></xsl:merge-source>',
          ),
          "XTDE2220",
        ],
        [
          merge(
            '<xsl:merge-source for-each-item="doc/log" select="e" sort-before-merge="yes"><xsl:merge-key select="@t" order="descending"/></xsl:merge-source>',
          ),
          "[5:c][3:b e][2:d][1:a]",
        ],
        [
          merge(
            '<xsl:merge-source for-each-source="\'urn:1.xml\', \'urn:2.xml\'" use-accumulators="n" select="log/e"><xsl:merge-key select="number(@t)"/></xsl:merge-source>',
            "[{current-merge-key()}:{accumulator-after('n')}]",
          ),
          "[1:1][2:1][4:2]",
        ],
        [
          merge(
            '<xsl:merge-source select="()"><xsl:merge-key/></xsl:merge-source>',
          ),
          "",
        ],
        [
          merge(
            '<xsl:merge-source select="1"><xsl:merge-key/></xsl:merge-source>',
            "",
          ),
          "",
        ],
        [
          merge(
            '<xsl:merge-source select="(1, 2)"><xsl:merge-key select="."/><xsl:merge-key><xsl:sequence select="-."/></xsl:merge-key></xsl:merge-source>' +
              '<xsl:merge-source select="(2, 3)"><xsl:merge-key select="."/><xsl:merge-key select="-."/></xsl:merge-source>',
            "[{current-merge-key()}:{count(current-merge-group())}]",
          ),
          "[1 -1:1][2 -2:2][3 -3:1]",
        ],
        [
          '<xsl:merge><xsl:merge-source select="2, 1"><xsl:merge-key select="."/></xsl:merge-source><xsl:merge-action/><xsl:fallback/></xsl:merge>',
          "XTDE2220",
        ],
      ],
      options,
    );
  });

  it("is checked", () => {
    const key = "<xsl:merge-key/>";
    checkBodies(
      [
        ["<xsl:merge/>", "XTSE0010"],
        [
          `<xsl:merge><xsl:merge-source select="1">${key}</xsl:merge-source></xsl:merge>`,
          "XTSE0010",
        ],
        ["<xsl:merge><xsl:merge-action/></xsl:merge>", "XTSE0010"],
        [merge('<xsl:merge-source select="1"/>'), "XTSE0010"],
        [
          merge('<xsl:merge-source select="1"><a/></xsl:merge-source>'),
          "XTSE0010",
        ],
        [merge(`<xsl:merge-source>${key}</xsl:merge-source>`), "XTSE0010"],
        [
          merge(
            `<xsl:merge-source name="1" select="1">${key}</xsl:merge-source>`,
          ),
          "XTSE0020",
        ],
        [
          merge(
            `<xsl:merge-source name="a" select="1">${key}</xsl:merge-source><xsl:merge-source name="a" select="1">${key}</xsl:merge-source>`,
          ),
          "XTSE3190",
        ],
        [
          merge(
            `<xsl:merge-source select="1">${key}</xsl:merge-source><xsl:merge-source select="1">${key}${key}</xsl:merge-source>`,
          ),
          "XTSE2200",
        ],
        [
          merge(
            `<xsl:merge-source for-each-item="1" for-each-source="'a'" select="1">${key}</xsl:merge-source>`,
          ),
          "XTSE3195",
        ],
        [
          merge(
            `<xsl:merge-source use-accumulators="n" select="1">${key}</xsl:merge-source>`,
          ),
          "XTSE3195",
        ],
        [
          merge(
            `<xsl:merge-source validation="strip" select="1">${key}</xsl:merge-source>`,
          ),
          "XTSE0010",
        ],
        [
          merge(
            `<xsl:merge-source for-each-source="'urn:2.xml'" validation="strip" type="t" select="1">${key}</xsl:merge-source>`,
          ),
          "XTSE1505",
        ],
        [
          merge(
            '<xsl:merge-source select="1"><xsl:merge-key select="1">2</xsl:merge-key></xsl:merge-source>',
          ),
          "XTSE3200",
        ],
        [
          merge(
            `<xsl:merge-source for-each-source="1" select="1">${key}</xsl:merge-source>`,
          ),
          "XPTY0004",
        ],
        [
          merge(
            `<xsl:merge-source select="1"><xsl:merge-key lang="de"/></xsl:merge-source><xsl:merge-source select="1">${key}</xsl:merge-source>`,
          ),
          "XTDE2210",
        ],
        [
          merge(
            `<xsl:merge-source select="1">${key}</xsl:merge-source><xsl:merge-source select="'a'">${key}</xsl:merge-source>`,
          ),
          "XTTE2230",
        ],
        [
          merge(
            `<xsl:merge-source select="1">${key}</xsl:merge-source>`,
            '{current-merge-group("x")}',
          ),
          "XTDE3490",
        ],
        ["{current-merge-group()}", "XTDE3480"],
        ["{current-merge-key()}", "XTDE3510"],
        [
          merge(
            `<xsl:merge-source select="1">${key}</xsl:merge-source>`,
            '<xsl:call-template name="t"/>',
          ),
          "XTDE3480",
        ],
      ],
      {
        ...options,
        declarations: `${options.declarations}<xsl:template name="t">{current-merge-group()}</xsl:template>`,
      },
    );
  });
});
