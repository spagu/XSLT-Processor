/**
 * The function Playwright runs inside the page: fetch the pair, transform
 * with the native XSLTProcessor and serialize the result the way the page
 * would show it. It must not use anything outside its own body.
 *
 * @module xslt-migrate-check/compat/engines/page
 */

/* global fetch, window */

/**
 * Transform in the page.
 *
 * @param {{xml: string, xsl: string, params: Record<string, string>,
 *   textMethod: boolean}} pair - URLs of the documents, the parameters, and
 *   whether the stylesheet declares the text output method
 * @returns {Promise<string>} The result: markup, or text for the text method
 * @throws {Error} When the browser has no XSLTProcessor, a document does not
 *   parse or the transformation fails
 */
export async function transformInPage({ xml, xsl, params, textMethod }) {
  if (typeof window.XSLTProcessor !== "function") {
    throw new TypeError("this Chromium has no native XSLTProcessor");
  }
  const parse = async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`cannot load ${url}: ${response.status}`);
    const doc = new window.DOMParser().parseFromString(
      await response.text(),
      "application/xml",
    );
    const error = doc.getElementsByTagName("parsererror")[0];
    if (error) {
      throw new Error(`${url} is not well-formed: ${error.textContent.trim()}`);
    }
    return doc;
  };
  const [xmlDoc, xslDoc] = await Promise.all([parse(xml), parse(xsl)]);
  const processor = new window.XSLTProcessor();
  processor.importStylesheet(xslDoc);
  for (const [name, value] of Object.entries(params)) {
    processor.setParameter(null, name, value);
  }
  const result = processor.transformToDocument(xmlDoc);
  if (!result?.documentElement) throw new Error("the transformation failed");
  // The text method: Chromium wraps the text in <html><body><pre>
  if (textMethod) return result.documentElement.textContent;
  if (result.contentType === "text/html") {
    return result.documentElement.outerHTML;
  }
  return new window.XMLSerializer().serializeToString(result);
}
