/**
 * fn:parse-json and fn:json-doc (F&O 3.1 sections 17.5.1 and 17.5.2):
 * JSON to maps, arrays, xs:string, xs:double and xs:boolean values (null
 * is the empty sequence).
 *
 * @module @tradik/xslt3/functions/json/parseJson
 */

import { XPathError } from "../../errors.js";
import { XdmArray } from "../../items/array.js";
import { XdmMap } from "../../items/map.js";
import { mapKey } from "../../items/mapKey.js";
import { readOptions } from "../options.js";
import { booleanItem, define, doubleItem, stringItem } from "../support.js";
import { parseJsonText } from "./jsonParser.js";
import { stringDecoder } from "./jsonStrings.js";

/** Option declarations shared by parse-json and json-to-xml. */
export const JSON_OPTIONS = {
  liberal: { type: "xs:boolean", default: false },
  escape: { type: "xs:boolean", default: false },
  fallback: { type: "function(xs:string) as xs:string" },
};

/**
 * Reads the options of a JSON parsing function.
 * @param {Array} options - The options argument (a map), or undefined
 * @param {Record<string, object>} specs - Declarations of the options
 *   that differ between the functions (duplicates, validate)
 * @returns {Record<string, *>}
 * @throws {XPathError} FOJS0005 for invalid values, among which a fallback
 *   function together with escape=true
 */
export function jsonOptions(options, specs) {
  const result = readOptions(
    options?.[0],
    { ...JSON_OPTIONS, ...specs },
    "FOJS0005",
  );
  if (result.escape && result.fallback) {
    throw new XPathError(
      "FOJS0005",
      "The fallback option is not allowed with escape=true",
    );
  }
  return result;
}

/**
 * The XDM value of a parsed JSON value.
 * @param {import("./jsonParser.js").JsonValue} value
 * @param {(chars: Array) => string} decode - String decoder
 * @param {string} duplicates - "reject", "use-first" or "use-last"
 * @returns {Array} a sequence of at most one item
 */
function toXdm(value, decode, duplicates) {
  switch (value.kind) {
    case "object": {
      const entries = new Map();
      for (const [keyChars, member] of value.entries) {
        const key = stringItem(decode(keyChars));
        const k = mapKey(key);
        if (entries.has(k)) {
          if (duplicates === "reject") {
            throw new XPathError("FOJS0003", `Duplicate key "${key.value}"`);
          }
          if (duplicates === "use-first") continue;
        }
        entries.set(k, { key, value: toXdm(member, decode, duplicates) });
      }
      return [new XdmMap(entries)];
    }
    case "array":
      return [
        new XdmArray(value.members.map((m) => toXdm(m, decode, duplicates))),
      ];
    case "string":
      return [stringItem(decode(value.chars))];
    case "number":
      return [doubleItem(Number(value.text))];
    case "boolean":
      return [booleanItem(value.value)];
    default:
      return [];
  }
}

/**
 * fn:parse-json of a string.
 * @param {string} text
 * @param {Array} [options] - The options argument
 * @returns {Array}
 */
export function parseJson(text, options) {
  const { duplicates, ...rest } = jsonOptions(options, {
    duplicates: {
      type: "xs:string",
      default: "use-first",
      values: ["reject", "use-first", "use-last"],
    },
  });
  return toXdm(parseJsonText(text), stringDecoder(rest), duplicates);
}

const OPTIONS = "map(*)";

/** Function definitions. */
export const parseJsonFunctions = [
  define("parse-json", ["xs:string?"], "item()?", ([json]) =>
    json.length ? parseJson(json[0].value) : [],
  ),
  define("parse-json", ["xs:string?", OPTIONS], "item()?", ([json, options]) =>
    json.length ? parseJson(json[0].value, options) : [],
  ),
  define("json-doc", ["xs:string?"], "item()?", ([href], context) =>
    href.length ? parseJson(context.loadText(href[0].value)) : [],
  ),
  define(
    "json-doc",
    ["xs:string?", OPTIONS],
    "item()?",
    ([href, options], context) =>
      href.length ? parseJson(context.loadText(href[0].value), options) : [],
  ),
];
