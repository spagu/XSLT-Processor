import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { serialize } from "../../serialize/index.js";
import {
  errorCode,
  parse,
  show,
  stylesheet,
  transform,
} from "../testing.test.js";
import { buildsTree } from "./rawResults.js";

/** Runs an initial template and returns the transform result. */
const runMain = (body, declarations = "", options = {}) =>
  transform(
    stylesheet(
      `${declarations}<xsl:template name="main">${body}</xsl:template>`,
    ),
    null,
    { initialTemplate: "main", ...options },
  );

describe("raw results", () => {
  it("are delivered when build-tree is no", () => {
    assert.equal(buildsTree({ method: "json" }), false);
    assert.equal(buildsTree({ method: "adaptive", "build-tree": "yes" }), true);
    assert.equal(buildsTree({ "build-tree": false }), false);
    assert.equal(buildsTree({ "build-tree": " 1 " }), true);
    assert.equal(buildsTree({}), true);
    assert.equal(buildsTree(undefined), true);
  });

  it("keep maps and atomic values of the principal result", () => {
    const result = runMain(
      "<xsl:sequence select=\"map{'a': 1}, 2\"/>",
      '<xsl:output method="json"/>',
    );
    assert.ok(Array.isArray(result.principal));
    assert.equal(result.principal.length, 2);
    assert.equal(
      serialize(result.principal.slice(0, 1), result.output),
      '{"a":1}',
    );
  });

  it("keep the sequence of an xsl:result-document", () => {
    const result = runMain(
      '<xsl:result-document href="r.json" method="json"><xsl:sequence select="[1, 2]"/></xsl:result-document>',
    );
    const { document, output } = result.secondary.get("r.json");
    assert.equal(serialize(document, output), "[1,2]");
  });

  it("can be asked for every result", () => {
    const result = runMain("<a/><b/>", "", { buildTree: false });
    assert.equal(show(result.principal), "<a/> <b/>");
  });

  it("are written once", () => {
    assert.equal(
      errorCode(() =>
        runMain(
          "<xsl:result-document><a/></xsl:result-document><b/>",
          '<xsl:output method="adaptive"/>',
        ),
      ),
      "XTDE1490",
    );
  });
});

describe("result trees", () => {
  it("put the item separator between the items", () => {
    const result = runMain(
      '<xsl:sequence select="1 to 3"/><a/>',
      '<xsl:output method="xml" item-separator="~"/>',
    );
    assert.equal(show(result.principal), "1~2~3~<a/>");
  });

  it("drop an item separator of #absent", () => {
    const result = runMain(
      '<xsl:result-document format="f" item-separator="#absent"><xsl:sequence select="1 to 3"/></xsl:result-document>',
      '<xsl:output name="f" item-separator="|"/><xsl:output item-separator="#absent"/>',
    );
    assert.equal(show(result.principal), "1 2 3");
    assert.equal(result.output["item-separator"], undefined);
  });

  it("raise SENR0001 for a map at the top", () => {
    assert.equal(
      errorCode(() => runMain('<xsl:sequence select="map{}"/>')),
      "SENR0001",
    );
    assert.equal(
      errorCode(() => runMain('<a><xsl:sequence select="map{}"/></a>')),
      "XTDE0450",
    );
  });

  it("read the parameter document of xsl:result-document", () => {
    const params = parse(
      '<output:serialization-parameters xmlns:output="http://www.w3.org/2010/xslt-xquery-serialization"><output:method value="text"/></output:serialization-parameters>',
    );
    const seen = [];
    const result = runMain(
      '<xsl:result-document href="out.txt" parameter-document="{\'p.xml\'}" indent="no"><a>text</a></xsl:result-document>',
      "",
      {
        baseUri: "file:///s/main.xsl",
        loadStylesheet: (uri, base) => (seen.push([uri, base]), params),
      },
    );
    const { output } = result.secondary.get("out.txt");
    assert.equal(output.method, "text");
    assert.equal(output.indent, "no");
    assert.deepEqual(seen, [["file:///s/p.xml", "file:///s/main.xsl"]]);
  });
});
