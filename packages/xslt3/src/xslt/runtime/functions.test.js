import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkBodies, parse, run, stylesheet } from "../testing.test.js";

const options = { attributes: 'expand-text="yes"' };

describe("XSLT functions", () => {
  it("give the current item, group and captured groups", () => {
    checkBodies(
      [
        ["<out>{name(current()/*)}</out>", "<out>doc</out>"],
        [
          "<out>{count(current-group())}{count(current-grouping-key())}{regex-group(1)}</out>",
          "<out>00</out>",
        ],
      ],
      options,
    );
  });

  it("find nodes by key within a subtree", () => {
    checkBodies(
      [["<out>{count(key('k', '1', /doc/s[2]))}</out>", "<out>1</out>"]],
      {
        ...options,
        declarations: '<xsl:key name="k" match="a" use="@k"/>',
        xml: '<doc><s><a k="1"/></s><s><a k="1"/></s></doc>',
      },
    );
  });

  it("load documents", () => {
    const loaded = parse("<loaded/>");
    const documentLoader = (uri) => (uri.endsWith("x.xml") ? loaded : null);
    const xsl = stylesheet(
      "<xsl:template match=\"/\"><out>{name(document('x.xml')/*)} {name(document(('x.xml', 'x.xml'), /)/*)} {name(document(doc/@href)/*)} {name(document('')/*)} {name(document('#frag')/*)}</out></xsl:template>",
      options,
    );
    assert.equal(
      run(xsl, '<doc href="x.xml"/>', {
        documentLoader,
        baseUri: "file:///s/main.xsl",
      }),
      "<out>loaded loaded loaded xsl:stylesheet xsl:stylesheet</out>",
    );
  });

  it("describe the processor", () => {
    checkBodies(
      [
        [
          "<out>{system-property('xsl:version')} {system-property('xsl:none')} {system-property('other')} {count(available-system-properties())}</out>",
          "<out>3.0   14</out>",
        ],
        [
          "<out>{element-available('xsl:if')} {element-available('xsl:none')} {element-available('if')}</out>",
          "<out>true false false</out>",
        ],
        [
          "<out>{function-available('concat')} {function-available('concat', 9)} {function-available('none')} {function-available('xs:integer')} {function-available('xs:integer', 2)} {function-available('xs:anyAtomicType')} {function-available('xs:none')}</out>",
          "<out>true true false true false false false</out>",
        ],
        [
          "<out>{type-available('xs:integer')} {type-available('xs:untyped')} {type-available('xs:none')} {type-available('Q{urn:x}t')}</out>",
          "<out>true true false false</out>",
        ],
        [
          "<out>{unparsed-entity-uri('e')}{unparsed-entity-public-id('e')}</out>",
          "<out/>",
        ],
        ["<out>{system-property('1')}</out>", "XTDE1390"],
      ],
      options,
    );
  });

  it("copy nodes", () => {
    checkBodies(
      [
        [
          "<xsl:variable name='c' select='copy-of(doc/a)'/><out>{$c/.. => count()}{copy-of(1)}{snapshot(doc/a) ! name()}<xsl:for-each select='doc'>{copy-of() ! name()}</xsl:for-each></out>",
          "<out>01adoc</out>",
        ],
        [
          "<xsl:for-each select='1'><xsl:sequence select='copy-of()'/></xsl:for-each>",
          "1",
        ],
        ["<out>{f:f()}</out>", "XPDY0002"],
      ],
      {
        attributes: 'expand-text="yes" xmlns:f="urn:f"',
        exclude: "f",
        declarations:
          '<xsl:function name="f:f"><xsl:sequence select="copy-of()"/></xsl:function>',
        xml: "<doc><a/></doc>",
      },
    );
  });
});
