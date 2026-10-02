import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { JSDOM } from "jsdom";
import { code, parse, xp, xs } from "../testing.test.js";

const doc = parse(
  "<r><a id='1'><b>x</b><c/></a><a id='2'><b>y</b></a><!--k--><?p v?></r>",
);

describe("path expressions", () => {
  it("selects with the abbreviated syntax", () => {
    assert.equal(xs("/r/a/b", doc), "<b> <b>");
    assert.equal(xs("//b/string()", doc), "x y");
    assert.equal(xs("//@id/string()", doc), "1 2");
    assert.equal(xs("/r/a[2]/b", doc), "<b>");
    assert.equal(xs("//b/..", doc), "<a> <a>");
    assert.equal(xs("/r/a[1]/./c", doc), "<c>");
    assert.equal(xs("count(/)", doc), "1");
    assert.equal(
      xs("/r//node()[self::comment() or self::processing-instruction()]", doc),
      "#comment p",
    );
  });

  it("returns nodes in document order without duplicates", () => {
    assert.equal(xs("(//b, //a)/..", doc), "<r> <a> <a>");
    assert.equal(xs("//b/ancestor::*", doc), "<r> <a> <a>");
    assert.equal(xs("/r/a/(c, b)", doc), "<b> <c> <b>");
    assert.equal(xs("/r/a[1]/(c, c)", doc), "<c>");
  });

  it("maps to atomic values in the last step", () => {
    assert.equal(xs("/r/a/@id/(. + 1)", doc), "2 3");
    assert.equal(xs("/r/a/string(@id)", doc), "1 2");
    assert.deepEqual(xp("/r/x/string()", doc), []);
  });

  it("raises the path errors", () => {
    assert.equal(code("(1, 2)/a", doc), "XPTY0019");
    assert.equal(code("/r/a/(if (@id = 1) then . else 1)", doc), "XPTY0018");
    assert.equal(code("child::a", 1), "XPTY0020");
    assert.equal(code("/", 1), "XPTY0020");
    const detached = parse("<r/>").createElement("e");
    assert.equal(code("/", detached), "XPDY0050");
  });

  it("filters with numeric and boolean predicates", () => {
    assert.equal(xs("(10, 20, 30)[2]", doc), "20");
    assert.equal(xs("(10, 20, 30)[4]"), "");
    assert.equal(xs("(10, 20, 30)[0]"), "");
    assert.equal(xs("(10, 20, 30)[2.0]"), "20");
    assert.equal(xs("(10, 20, 30)[1.5]"), "");
    assert.equal(xs("(10, 20, 30)[last()]"), "30");
    assert.equal(xs("(10, 20, 30)[. gt 15][1]"), "20");
    assert.equal(xs("(1, 2)['x']"), "1 2");
    assert.equal(xs("//a[b = 'y']/@id/string()", doc), "2");
    assert.equal(xs("//a[c]/@id/string()", doc), "1");
    assert.equal(code("(1, 2)[(1, 2)]"), "FORG0006");
  });

  it("applies predicates of reverse axes in proximity order", () => {
    assert.equal(xs("//c/ancestor::*[1]", doc), "<a>");
    assert.equal(xs("//c/preceding-sibling::*[1]/string()", doc), "x");
    assert.equal(xs("(//c/ancestor::*)[1]", doc), "<r>");
  });

  it("combines node sets with union, intersect and except", () => {
    assert.equal(xs("//b | //a", doc), "<a> <b> <a> <b>");
    assert.equal(xs("//* intersect //a", doc), "<a> <a>");
    assert.equal(xs("//* except //a", doc), "<r> <b> <c> <b>");
    assert.equal(code("1 union //a", doc), "XPTY0004");
    assert.equal(code("//a except 1", doc), "XPTY0004");
  });

  it("applies positional predicates of // to the children of each parent", () => {
    const nested = parse(
      "<r><x i='1'><x i='2'/><x i='3'/></x><y><x i='4'/></y><x i='5'/></r>",
    );
    const ids = (expr, context = nested) =>
      xs(`(${expr})/@i/string()`, context);
    assert.equal(ids("//x[1]"), "1 2 4");
    assert.equal(ids("//x[last()]"), "3 4 5");
    assert.equal(ids("//x[position() > 1]"), "3 5");
    assert.equal(ids("/r/(x | y)//x[1]"), "2 4");
    assert.equal(ids("(/r, /r/x[1])//x[1]"), "1 2 4");
    assert.equal(
      ids("descendant-or-self::node()/x[1]", nested.documentElement),
      "1 2 4",
    );
    assert.equal(xs("/r/text()//x[1]", parse("<r>t</r>")), "");
    assert.equal(xs("/r/text()/x", parse("<r>t</r>")), "");
    assert.equal(code("(1, 2)//x[1]", nested), "XPTY0019");
    assert.equal(code("descendant-or-self::node()/x[1]", 1), "XPTY0020");
  });

  it("works over a jsdom document", () => {
    const { document } = new JSDOM("<r><a/><b><a/></b></r>", {
      contentType: "text/xml",
    }).window;
    assert.equal(xs("count(//a)", document), "2");
    assert.equal(xs("(//a)[2]/following::node()", document), "");
    assert.equal(xs("(//a)[1]/following::*", document), "<b> <a>");
    assert.equal(xs("//a[1]/..", document), "<r> <b>");
  });
});
