/**
 * XSLTProcessor API in a real browser, through the ESM bundle.
 */

import { expect, test } from "@playwright/test";
import { ESM_PAGE, openPage } from "./helpers.mjs";

const XSL_HEAD =
  '<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">';

test.beforeEach(async ({ page }) => {
  await openPage(page, ESM_PAGE);
});

test("the ESM bundle exports the processor and helpers", async ({ page }) => {
  const exported = await page.evaluate(() => ({
    processor: typeof window.lib.XSLTProcessor,
    isDefault: window.lib.default === window.lib.XSLTProcessor,
    installGlobal: typeof window.lib.installGlobal,
    version: window.lib.VERSION,
    isBrowser: window.lib.isBrowser,
    // Importing the ESM bundle never replaces the global
    globalUntouched:
      window.XSLTProcessor === window.NativeXSLTProcessor ||
      (window.NativeXSLTProcessor === null &&
        window.XSLTProcessor === undefined),
  }));
  expect(exported).toEqual({
    processor: "function",
    isDefault: true,
    installGlobal: "function",
    version: expect.stringMatching(/^\d+\.\d+\.\d+/),
    isBrowser: true,
    globalUntouched: true,
  });
});

test("transformToFragment with method html yields live HTML elements", async ({
  page,
}) => {
  const result = await page.evaluate((xslHead) => {
    const { XSLTProcessor } = window.lib;
    const { parseXml } = window.harness;
    const processor = new XSLTProcessor();
    processor.importStylesheet(
      parseXml(`${xslHead}<xsl:output method="html"/>
        <xsl:template match="/links"><nav><xsl:for-each select="link">
          <a href="{@href}" class="nav-link"><xsl:value-of select="."/></a>
        </xsl:for-each></nav></xsl:template></xsl:stylesheet>`),
    );
    const fragment = processor.transformToFragment(
      parseXml(
        '<links><link href="/docs">Docs</link><link href="#top">Top</link></links>',
      ),
      document,
    );
    const out = document.getElementById("out");
    out.replaceChildren(fragment);
    const anchors = [...out.querySelectorAll("a.nav-link")];
    let clicked = 0;
    anchors[1].addEventListener("click", (event) => {
      event.preventDefault();
      clicked += 1;
    });
    anchors[1].click();
    return {
      navIsHtml: out.firstElementChild instanceof HTMLElement,
      navTag: out.firstElementChild.tagName,
      anchorsAreHtml: anchors.every((a) => a instanceof HTMLAnchorElement),
      hrefs: anchors.map((a) => a.href),
      pathname: anchors[0].pathname,
      namespace: anchors[0].namespaceURI,
      text: anchors.map((a) => a.textContent),
      clicked,
    };
  }, XSL_HEAD);

  expect(result).toEqual({
    navIsHtml: true,
    navTag: "NAV",
    anchorsAreHtml: true,
    hrefs: [expect.stringMatching(/\/docs$/), expect.stringMatching(/#top$/)],
    pathname: "/docs",
    namespace: "http://www.w3.org/1999/xhtml",
    text: ["Docs", "Top"],
    clicked: 1,
  });
});

test("transformToFragment with method xml keeps elements in no namespace in an HTML page, like Chrome and Firefox", async ({
  page,
}) => {
  const result = await page.evaluate((xslHead) => {
    const { XSLTProcessor } = window.lib;
    const { parseXml } = window.harness;
    const processor = new XSLTProcessor();
    processor.importStylesheet(
      parseXml(`${xslHead}<xsl:output method="xml"/>
        <xsl:template match="/"><Item Id="1"><Child/></Item></xsl:template></xsl:stylesheet>`),
    );
    const fragment = processor.transformToFragment(parseXml("<x/>"), document);
    const item = fragment.firstChild;
    return {
      isFragment: fragment instanceof DocumentFragment,
      isHtml: item instanceof HTMLElement,
      namespace: item.namespaceURI,
      localName: item.localName,
      // Not an HTML element, so the attribute name keeps its XML case
      attribute: item.getAttribute("Id"),
      ownedByPage: item.ownerDocument === document,
    };
  }, XSL_HEAD);

  expect(result).toEqual({
    isFragment: true,
    isHtml: false,
    namespace: null,
    localName: "Item",
    attribute: "1",
    ownedByPage: true,
  });
});

test("transformToDocument and transformToString", async ({ page }) => {
  const result = await page.evaluate((xslHead) => {
    const { XSLTProcessor } = window.lib;
    const { parseXml } = window.harness;
    const processor = new XSLTProcessor();
    processor.importStylesheet(
      parseXml(`${xslHead}<xsl:output method="xml" indent="no"/>
        <xsl:template match="/n"><total><xsl:value-of select="sum(v)"/></total></xsl:template>
        </xsl:stylesheet>`),
    );
    const source = parseXml("<n><v>2</v><v>40</v></n>");
    const doc = processor.transformToDocument(source);
    return {
      isDocument: doc instanceof Document,
      root: doc.documentElement.nodeName,
      text: doc.documentElement.textContent,
      string: processor.transformToString(source),
    };
  }, XSL_HEAD);

  expect(result.isDocument).toBe(true);
  expect(result.root).toBe("total");
  expect(result.text).toBe("42");
  expect(result.string).toContain("<total>42</total>");
});

test("setParameter, getParameter, removeParameter and clearParameters", async ({
  page,
}) => {
  const result = await page.evaluate((xslHead) => {
    const { XSLTProcessor } = window.lib;
    const { parseXml } = window.harness;
    const processor = new XSLTProcessor();
    processor.importStylesheet(
      parseXml(`${xslHead}<xsl:output method="text"/>
        <xsl:param name="who" select="'nobody'"/>
        <xsl:template match="/">Hello, <xsl:value-of select="$who"/></xsl:template>
        </xsl:stylesheet>`),
    );
    const source = parseXml("<x/>");
    const run = () => processor.transformToString(source);
    const initial = run();
    processor.setParameter(null, "who", "world");
    const withParam = run();
    const read = processor.getParameter(null, "who");
    processor.removeParameter(null, "who");
    const removed = run();
    processor.setParameter("", "who", "again");
    processor.clearParameters();
    return { initial, withParam, read, removed, cleared: run() };
  }, XSL_HEAD);

  expect(result).toEqual({
    initial: "Hello, nobody",
    withParam: "Hello, world",
    read: "world",
    removed: "Hello, nobody",
    cleared: "Hello, nobody",
  });
});

test("xsl:include and document() through loaders fed by fetch", async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { XSLTProcessor } = window.lib;
    const { fetchTexts, parseXml } = window.harness;
    const texts = await fetchTexts([
      "loaders/main.xsl",
      "loaders/common.xsl",
      "loaders/countries.xml",
      "loaders/orders.xml",
    ]);
    const seen = [];
    const processor = new XSLTProcessor();
    processor.setStylesheetLoader((href) => {
      seen.push(`include:${href}`);
      return texts.get(href.replace(/^.*\/fixtures\//, ""));
    });
    processor.setDocumentLoader((uri) => {
      seen.push(`document:${uri}`);
      return texts.get(uri.replace(/^.*\/fixtures\//, "")) ?? null;
    });
    const base = new URL("loaders/main.xsl", location.href).href;
    processor.importStylesheet(parseXml(texts.get("loaders/main.xsl")), base);
    const fragment = processor.transformToFragment(
      parseXml(texts.get("loaders/orders.xml")),
      document,
    );
    const out = document.getElementById("out");
    out.replaceChildren(fragment);
    return {
      items: [...out.querySelectorAll("li")].map((li) => li.textContent),
      strongIsHtml: out.querySelector("strong.order-id") instanceof HTMLElement,
      seen,
    };
  });

  expect(result.items).toEqual([
    "#1001 ships to Poland",
    "#1002 ships to Portugal",
  ]);
  expect(result.strongIsHtml).toBe(true);
  expect(result.seen).toEqual(
    expect.arrayContaining([
      expect.stringMatching(/^include:.*common\.xsl$/),
      expect.stringMatching(/^document:.*countries\.xml$/),
    ]),
  );
});

test("a malformed stylesheet is rejected with an error", async ({ page }) => {
  const message = await page.evaluate((xslHead) => {
    const { XSLTProcessor } = window.lib;
    const { parseXml } = window.harness;
    try {
      new XSLTProcessor().importStylesheet(
        parseXml(`${xslHead}<xsl:template match="///"/></xsl:stylesheet>`),
      );
      return null;
    } catch (error) {
      return String(error.message);
    }
  }, XSL_HEAD);
  expect(message).not.toBeNull();
});
