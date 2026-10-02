/**
 * fn:parse-xml and fn:parse-xml-fragment (F&O 3.1 sections 14.6.2 and
 * 14.6.3), through the dynamic context hook `parseXml` (see
 * xpath/eval/resources.js). The documents have the static base URI as
 * base URI and no document URI; a fragment is a document fragment (a
 * document node that may hold several elements and text).
 *
 * @module @tradik/xslt3/functions/parseXml
 */

import { XPathError } from "../errors.js";
import { setBaseUri } from "./baseUris.js";
import { define } from "./support.js";

/** A text declaration: optional version, required encoding. */
const TEXT_DECLARATION =
  /^<\?xml(?:\s+version\s*=\s*(["'])1\.\d+\1)?\s+encoding\s*=\s*(["'])[A-Za-z][\w.-]*\2\s*\?>/;

/**
 * Parses with the hook, reporting failures as FODC0006.
 * @param {string} text
 * @param {object} context
 * @returns {Document}
 */
function parse(text, context) {
  try {
    return context.parseXml(text, context.staticBaseUri);
  } catch (error) {
    if (error.code === "FODC0006") throw error;
    throw new XPathError("FODC0006", "The string is not well-formed XML", {
      cause: error,
    });
  }
}

/**
 * fn:parse-xml-fragment of a string: the content of an external parsed
 * entity, parsed inside a wrapper element.
 * @param {string} text
 * @param {object} context
 * @returns {DocumentFragment}
 */
function parseFragment(text, context) {
  let content = text;
  if (/^<\?xml[\s?]/.test(text)) {
    const declaration = TEXT_DECLARATION.exec(text);
    if (!declaration) {
      throw new XPathError("FODC0006", "Invalid text declaration");
    }
    content = text.slice(declaration[0].length);
  }
  const document = parse(`<fragment>${content}</fragment>`, context);
  const fragment = document.createDocumentFragment();
  const wrapper = document.documentElement;
  while (wrapper.firstChild) fragment.appendChild(wrapper.firstChild);
  return setBaseUri(fragment, context.staticBaseUri);
}

/** Function definitions. */
export const parseXmlFunctions = [
  define(
    "parse-xml",
    ["xs:string?"],
    "document-node(element(*))?",
    ([arg], context) =>
      arg.length
        ? [setBaseUri(parse(arg[0].value, context), context.staticBaseUri)]
        : [],
  ),
  define(
    "parse-xml-fragment",
    ["xs:string?"],
    "document-node()?",
    ([arg], context) =>
      arg.length ? [parseFragment(arg[0].value, context)] : [],
  ),
];
