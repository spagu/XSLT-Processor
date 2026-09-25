/**
 * xsl:sort (XSLT 1.0 section 10).
 *
 * Sort keys are computed once per node (decorate, sort, undecorate) instead of
 * once per comparison, and the attributes `order`, `lang`, `data-type` and
 * `case-order` are evaluated as attribute value templates.
 *
 * Text keys are compared by Unicode code point unless `lang` or `case-order`
 * is given. That matches libxslt, the engine behind the native XSLTProcessor
 * in Chromium browsers, so a stylesheet sorts the same way with this library
 * as it did natively. With `lang` or `case-order` an `Intl.Collator` is used.
 *
 * @module xslt/sort
 */

/**
 * Compare two strings by Unicode code point (not by UTF-16 code unit).
 *
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} Negative, zero or positive
 */
export function compareCodePoints(a, b) {
  const left = a[Symbol.iterator]();
  const right = b[Symbol.iterator]();

  for (;;) {
    const x = left.next();
    const y = right.next();
    if (x.done || y.done) return Number(y.done) - Number(x.done) || 0;
    const diff = x.value.codePointAt(0) - y.value.codePointAt(0);
    if (diff !== 0) return diff;
  }
}

/**
 * Compare two numeric sort keys; NaN precedes every number (section 10).
 *
 * @param {number} a - First key
 * @param {number} b - Second key
 * @returns {number} Negative, zero or positive
 */
export function compareNumbers(a, b) {
  const aNaN = Number.isNaN(a);
  const bNaN = Number.isNaN(b);
  if (aNaN || bNaN) return Number(bNaN) - Number(aNaN) || 0;
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/**
 * Build the text comparator for one sort key.
 *
 * @param {string} lang - Evaluated `lang` attribute (may be empty)
 * @param {string} caseOrder - Evaluated `case-order` attribute (may be empty)
 * @returns {(a: string, b: string) => number} The comparator
 */
function textComparator(lang, caseOrder) {
  if (!lang && !caseOrder) return compareCodePoints;

  let collator;
  try {
    collator = new Intl.Collator(lang || undefined, {
      caseFirst: caseOrder === "lower-first" ? "lower" : "upper",
      sensitivity: "variant",
    });
  } catch {
    collator = new Intl.Collator(undefined, {
      caseFirst: caseOrder === "lower-first" ? "lower" : "upper",
      sensitivity: "variant",
    });
  }
  return collator.compare;
}

/**
 * @typedef {object} SortHost
 * @property {(expr: string, context: object) => *} evaluate - Evaluate an XPath expression
 * @property {(value: string, context: object) => string} avt - Evaluate an attribute value template
 * @property {(value: *) => string} toString - XPath string() conversion
 * @property {(value: *) => number} toNumber - XPath number() conversion
 */

/**
 * Resolve one xsl:sort element into a key specification.
 *
 * @param {Element} element - The xsl:sort element
 * @param {object} context - Context of the sorting instruction (for AVTs)
 * @param {SortHost} host - Engine callbacks
 * @returns {{select: string, descending: boolean, numeric: boolean, compare: Function}} Specification
 */
export function resolveSortSpec(element, context, host) {
  const attribute = (name) => {
    const raw = element.getAttribute(name);
    return raw ? host.avt(raw, context).trim() : "";
  };

  const dataType = attribute("data-type");
  const numeric = dataType === "number";

  return {
    select: element.getAttribute("select") || ".",
    descending: attribute("order") === "descending",
    numeric,
    compare: numeric
      ? compareNumbers
      : textComparator(attribute("lang"), attribute("case-order")),
  };
}

/**
 * Sort a node list by the given xsl:sort elements.
 *
 * Each key is evaluated with the node as current node, the unsorted list as
 * current node list and the node's position in that list, as the
 * specification requires. Ties keep the original order.
 *
 * @param {Node[]} nodes - Nodes in their original (document) order
 * @param {Element[]} sortElements - The xsl:sort children, in order
 * @param {object} context - XSLT context of the sorting instruction
 * @param {SortHost} host - Engine callbacks
 * @returns {Node[]} A new, sorted array
 */
export function sortNodes(nodes, sortElements, context, host) {
  if (sortElements.length === 0 || nodes.length < 2) return [...nodes];

  const specs = sortElements.map((el) => resolveSortSpec(el, context, host));

  const rows = nodes.map((node, index) => {
    const nodeContext = context.clone({
      currentNode: node,
      currentNodeList: nodes,
      position: index + 1,
    });
    const keys = specs.map((spec) => {
      const text = host.toString(host.evaluate(spec.select, nodeContext));
      return spec.numeric ? host.toNumber(text) : text;
    });
    return { node, index, keys };
  });

  rows.sort((a, b) => {
    for (let k = 0; k < specs.length; k++) {
      const cmp = specs[k].compare(a.keys[k], b.keys[k]);
      if (cmp !== 0) return specs[k].descending ? -cmp : cmp;
    }
    return a.index - b.index;
  });

  return rows.map((row) => row.node);
}
