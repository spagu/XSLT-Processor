/**
 * Error and diagnostic functions (F&O 3.1 sections 3 and 4): fn:error and
 * fn:trace, and the document functions fn:doc and fn:doc-available.
 *
 * @module @tradik/xslt3/functions/diagnostics
 */

import { XPathError } from "../errors.js";
import { booleanItem } from "../xpath/eval/atomics.js";

/** Error code of an xs:QName: the local name in the err namespace. */
function errorCode(qname) {
  if (qname.namespaceURI === "http://www.w3.org/2005/xqt-errors") {
    return qname.localName;
  }
  return `Q{${qname.namespaceURI}}${qname.localName}`;
}

/**
 * fn:error.
 * @param {Array<Array>} args
 * @returns {never}
 */
function raise([code = [], description, object]) {
  const qname = code[0]?.value;
  const error = new XPathError(
    qname ? errorCode(qname) : "FOER0000",
    description?.[0]?.value ?? "Error raised by fn:error",
  );
  error.qname = qname;
  error.errorObject = object;
  throw error;
}

/** Function definitions. */
export const diagnosticFunctions = [
  { local: "error", params: [], returns: "item()*", impl: raise },
  { local: "error", params: ["xs:QName?"], returns: "item()*", impl: raise },
  {
    local: "error",
    params: ["xs:QName?", "xs:string"],
    returns: "item()*",
    impl: raise,
  },
  {
    local: "error",
    params: ["xs:QName?", "xs:string", "item()*"],
    returns: "item()*",
    impl: raise,
  },
  {
    local: "trace",
    params: ["item()*"],
    returns: "item()*",
    impl: ([value], context) => (context.trace(value, ""), value),
  },
  {
    local: "trace",
    params: ["item()*", "xs:string"],
    returns: "item()*",
    impl: ([value, [label]], context) => (
      context.trace(value, label.value),
      value
    ),
  },
  {
    local: "doc",
    params: ["xs:string?"],
    returns: "document-node()?",
    impl: ([uri], context) =>
      uri.length ? [context.loadDocument(uri[0].value)] : [],
  },
  {
    local: "doc-available",
    params: ["xs:string?"],
    returns: "xs:boolean",
    impl: ([uri], context) => {
      if (!uri.length) return [booleanItem(false)];
      try {
        context.loadDocument(uri[0].value);
        return [booleanItem(true)];
      } catch {
        // loadDocument raises only FODC0002 and FODC0005
        return [booleanItem(false)];
      }
    },
  },
];
