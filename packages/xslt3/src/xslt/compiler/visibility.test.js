import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  libraryP,
  main,
  pkg,
  runTop,
  topError,
  useP,
} from "./packageTesting.test.js";

/** Components exposed by xsl:expose rather than by their declarations. */
const EXPOSED = {
  "urn:p": libraryP(`
    <xsl:expose component="*" names="*" visibility="public"/>
    <xsl:expose component="variable" names="p:*" visibility="final"/>
    <xsl:expose component="variable" names="*:hidden" visibility="private"/>
    <xsl:expose component="function" names="p:f#1" visibility="final"/>
    <xsl:expose component="template" names="Q{urn:p}*" visibility="public"/>
    <xsl:variable name="p:v" select="'v'"/>
    <xsl:variable name="p:hidden" select="'h'"/>
    <xsl:variable name="plain" select="'plain'"/>
    <xsl:function name="p:f"><xsl:param name="x"/><xsl:sequence select="$x"/></xsl:function>
    <xsl:function name="p:f"><xsl:sequence select="0"/></xsl:function>
    <xsl:template name="p:t"><t/></xsl:template>`),
};

describe("xsl:expose and xsl:accept", () => {
  it("give components their visibility", () => {
    const top = pkg(
      useP(
        '<xsl:accept component="*" names="*" visibility="public"/>' +
          '<xsl:accept component="variable" names="plain" visibility="hidden"/>',
      ) +
        '<xsl:variable name="plain" select="\'own\'"/>' +
        main(
          '<xsl:value-of select="$p:v, p:f(1), p:f(), $plain"/><xsl:call-template name="p:t"/>',
        ),
    );
    assert.equal(runTop(top, EXPOSED), "<out>v 1 0 own<t/></out>");
    const hidden = pkg(useP() + main('<xsl:value-of select="$p:hidden"/>'));
    assert.equal(topError(hidden, EXPOSED), "XPST0008");
  });

  it("are checked against the declared visibility", () => {
    const expose = (rule, declaration) =>
      topError(pkg(useP() + main("")), {
        "urn:p": libraryP(rule + declaration),
      });
    const rule = (component, names, visibility) =>
      `<xsl:expose component="${component}" names="${names}" visibility="${visibility}"/>`;
    const variable = (visibility) =>
      `<xsl:variable name="p:v" visibility="${visibility}"/>`;
    assert.equal(
      expose(rule("variable", "p:v", "public"), variable("final")),
      "XTSE3010",
    );
    assert.equal(
      expose(rule("variable", "p:v", "abstract"), variable("public")),
      "XTSE3010",
    );
    assert.equal(
      expose(
        rule("variable", "p:*", "abstract"),
        variable("public").replace(' visibility="public"', ""),
      ),
      "XTSE3025",
    );
    assert.equal(expose(rule("variable", "p:none", "public"), ""), "XTSE3020");
    assert.equal(
      expose(rule("variable", "p:v#1", "public"), variable("public")),
      "XTSE3020",
    );
    assert.equal(expose(rule("*", "p:v", "public"), ""), "XTSE3022");
    assert.equal(expose(rule("thing", "*", "public"), ""), "XTSE0020");
    assert.equal(expose(rule("variable", "*", "hidden"), ""), "XTSE0020");
    assert.equal(expose(rule("variable", "p:v#x", "public"), ""), "XTSE0020");
    assert.equal(expose(rule("variable", "q:*", "public"), ""), "XTSE0020");
    assert.equal(
      expose(
        rule("variable", "*", "public").replace("/>", ">x</xsl:expose>"),
        "",
      ),
      "XTSE0260",
    );
    assert.equal(expose("", variable("hidden")), "XTSE0020");
    assert.equal(
      expose("", '<xsl:mode name="m" visibility="abstract"/>'),
      "XTSE0020",
    );
    assert.equal(expose("", '<xsl:mode visibility="public"/>'), "XTSE0020");
    assert.equal(
      expose("", '<xsl:template match="*" visibility="public"/>'),
      "XTSE0500",
    );
    assert.equal(
      topError(
        `<xsl:stylesheet version="3.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">${rule("*", "*", "public")}</xsl:stylesheet>`,
        {},
      ),
      "XTSE0010",
    );
  });

  it("accept the components of a used package", () => {
    const accept = (rules, body = "") =>
      topError(pkg(useP(rules) + main(body)), EXPOSED);
    const rule = (component, names, visibility) =>
      `<xsl:accept component="${component}" names="${names}" visibility="${visibility}"/>`;
    assert.equal(accept(rule("variable", "p:none", "public")), "XTSE3030");
    assert.equal(accept(rule("*", "p:v", "public")), "XTSE3032");
    assert.equal(accept(rule("variable", "p:v", "public")), "XTSE3040");
    assert.equal(accept(rule("variable", "p:hidden", "hidden")), "XTSE3040");
    // a wildcard that cannot apply is ignored
    assert.equal(
      runTop(
        pkg(
          useP(rule("variable", "*", "abstract")) +
            main('<xsl:value-of select="$p:v"/>'),
        ),
        EXPOSED,
      ),
      "<out>v</out>",
    );
    // the same package used twice: its components conflict
    assert.equal(
      topError(pkg(useP() + useP() + main("")), EXPOSED),
      "XTSE3050",
    );
    assert.equal(
      topError(pkg(useP() + '<xsl:variable name="p:v"/>' + main("")), EXPOSED),
      "XTSE3050",
    );
  });

  it("give a mode used by a package's template rules to it", () => {
    const library = {
      "urn:p": libraryP(
        '<xsl:mode name="p:m" visibility="public"/><xsl:mode name="p:m"/><xsl:template match="*" mode="p:m"/>',
      ),
    };
    const rules = pkg(
      useP() + '<xsl:template match="*" mode="p:m"/>' + main(""),
      'declared-modes="no"',
    );
    assert.equal(topError(rules, library), "XTSE3050");
    const declares = pkg(useP() + '<xsl:mode name="p:m"/>' + main(""));
    assert.equal(topError(declares, library), "XTSE3050");
  });
});
