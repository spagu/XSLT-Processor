/**
 * What the html and xhtml output methods know about HTML elements and
 * attributes (Serialization 3.1 sections 6 and 7, HTML 4.01 and the HTML
 * Living Standard). Names are compared in lower case.
 *
 * @module @tradik/xslt3/serialize/markup/htmlData
 */

/** The XHTML namespace. */
export const XHTML_NAMESPACE = "http://www.w3.org/1999/xhtml";
/** Namespaces whose elements HTML5 output writes without a prefix. */
export const HTML5_UNPREFIXED = new Set([
  XHTML_NAMESPACE,
  "http://www.w3.org/2000/svg",
  "http://www.w3.org/1998/Math/MathML",
]);

const words = (text) => new Set(text.split(" "));

/** Elements with no content (void elements), by HTML version. */
export const VOID_ELEMENTS = {
  4: words(
    "area base basefont br col embed frame hr img input isindex link meta param",
  ),
  5: words(
    "area base br col embed hr img input keygen link meta param source track wbr",
  ),
};

/** Elements whose content is written without escaping (html method). */
export const RAW_TEXT_ELEMENTS = words("script style");

/** Elements inside which no whitespace is added. */
export const PRESERVING_ELEMENTS = words("pre script style textarea title");

/**
 * Phrasing (inline) elements: whitespace added around them would show, so
 * their parents are not indented.
 */
export const INLINE_ELEMENTS = words(
  "a abbr acronym audio b bdi bdo big br button canvas cite code data " +
    "datalist del dfn em embed font i iframe img input ins kbd label map " +
    "mark math meter noscript object output picture progress q ruby s samp " +
    "select slot small span strike strong sub sup svg template textarea " +
    "time tt u var video wbr",
);

/** Attributes written minimized when their value is their name. */
export const BOOLEAN_ATTRIBUTES = words(
  "allowfullscreen async autofocus autoplay checked compact controls " +
    "declare default defer disabled formnovalidate hidden inert ismap " +
    "itemscope loop multiple muted nohref noresize noshade novalidate " +
    "nowrap open playsinline readonly required reversed scoped seamless " +
    "selected typemustmatch",
);

/** Attributes holding URIs, %-escaped with escape-uri-attributes. */
export const URI_ATTRIBUTES = words(
  "action archive background cite classid codebase data datasrc " +
    "formaction href icon longdesc manifest poster profile src usemap",
);

/**
 * Whether an attribute holds a URI (`name` only on `a`).
 * @param {string} element - Element local name, lower case
 * @param {string} attribute - Attribute local name, lower case
 * @returns {boolean}
 */
export const isUriAttribute = (element, attribute) =>
  URI_ATTRIBUTES.has(attribute) || (attribute === "name" && element === "a");
