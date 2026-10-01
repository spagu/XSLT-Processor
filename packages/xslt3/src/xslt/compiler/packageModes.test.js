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

describe("modes and global variables of packages", () => {
  it("require declared modes in explicit packages", () => {
    const top = (body, attributes) => pkg(body + main(""), attributes);
    assert.equal(topError(top('<xsl:template match="*"/>'), {}), "XTSE3085");
    assert.equal(
      topError(top('<xsl:template match="*" mode="m"/>'), {}),
      "XTSE3085",
    );
    assert.equal(
      topError(
        top('<xsl:template name="t"><xsl:apply-templates/></xsl:template>'),
        {},
      ),
      "XTSE3085",
    );
    assert.equal(topError(top("", 'default-mode="m"'), {}), "XTSE3085");
    assert.equal(
      runTop(
        top(
          '<xsl:mode/><xsl:mode name="m"/><xsl:template match="*" mode="m"/><xsl:template match="*"/>',
          'default-mode="m"',
        ),
        {},
      ),
      "<out/>",
    );
    assert.equal(
      runTop(
        top('<xsl:template match="*" mode="m"/>', 'declared-modes="no"'),
        {},
      ),
      "<out/>",
    );
    const library = {
      "urn:p": libraryP(
        '<xsl:mode name="p:m" visibility="public"/><xsl:template match="*" mode="p:m"><m/></xsl:template>',
      ),
    };
    const uses = pkg(
      useP() +
        main(
          '<xsl:variable name="z"><z/></xsl:variable><xsl:apply-templates select="$z/*" mode="p:m"/>',
        ),
    );
    assert.equal(runTop(uses, library), "<out><m/></out>");
  });

  it("check the package version", () => {
    assert.equal(
      topError(pkg(main(""), 'package-version="1.x"'), {}),
      "XTSE0020",
    );
  });

  it("evaluate the global variables of a library without a focus", () => {
    const library = {
      "urn:p": libraryP(
        '<xsl:variable name="p:v" visibility="public" select="."/>',
      ),
    };
    const top = pkg(useP() + main('<xsl:value-of select="$p:v"/>'));
    assert.equal(
      topError(top, library, { initialTemplate: "main" }),
      "XPDY0002",
    );
  });

  it("compile a package once for each use, with its overrides", () => {
    const library = {
      "urn:p": libraryP(
        '<xsl:variable name="p:v" visibility="public" select="1"/><xsl:function name="p:get" visibility="final"><xsl:sequence select="$p:v"/></xsl:function>',
      ),
      "urn:q": pkg(
        useP(
          '<xsl:override><xsl:variable name="p:v" select="2"/></xsl:override>',
        ) +
          '<xsl:function name="q:get" visibility="public" xmlns:q="urn:q"><xsl:sequence select="p:get()"/></xsl:function>',
        'name="urn:q"',
      ),
    };
    const top = pkg(
      useP() +
        '<xsl:use-package name="urn:q"/>' +
        main('<xsl:value-of select="p:get(), q:get()" xmlns:q="urn:q"/>'),
    );
    assert.equal(runTop(top, library), "<out>1 2</out>");
  });

  it("supply stylesheet parameters to the packages that accept them", () => {
    const library = {
      "urn:p": libraryP(
        '<xsl:param name="p:x" required="yes"/><xsl:function name="p:x" visibility="public"><xsl:sequence select="$p:x"/></xsl:function>',
      ),
    };
    const top = pkg(useP() + main('<xsl:value-of select="p:x()"/>'));
    assert.equal(
      runTop(top, library, { params: new Map([["{urn:p}x", "given"]]) }),
      "<out>given</out>",
    );
    const overridden = pkg(
      useP(
        '<xsl:override><xsl:param name="p:x" required="no" select="\'default\'"/></xsl:override>',
      ) + main('<xsl:value-of select="p:x()"/>'),
    );
    assert.equal(runTop(overridden, library), "<out>default</out>");
  });
});
