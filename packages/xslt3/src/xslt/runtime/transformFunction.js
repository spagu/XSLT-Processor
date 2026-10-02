/**
 * fn:transform (F&O 3.1, "Dynamic loading"): runs another stylesheet from an
 * XPath expression and returns its results as a map: "output" for the
 * principal result and the absolute URI of each secondary result, each
 * delivered as a document (default), serialized as a string, or raw.
 * The stylesheet is compiled with the options of the calling one (module
 * and package loaders) and runs with the resource loaders of the calling
 * transformation.
 *
 * @module @tradik/xslt3/xslt/runtime/transformFunction
 */

import { XdmMap } from "../../items/map.js";
import { serialize } from "../../serialize/index.js";
import { atomize } from "../../xdm/nodes.js";
import { parametersFromMap } from "../../serialize/params/fromMap.js";
import { stringItem } from "../../xpath/eval/atomics.js";
import { resolveUri } from "../../xpath/eval/uris.js";
import { xsltError } from "../names.js";
import { compileWith } from "./compilerHook.js";

/**
 * @param {*} item - An xs:QName value
 * @returns {string} its Clark name
 */
const clark = (item) => `{${item.value.namespaceURI}}${item.value.localName}`;

/**
 * A map with QName keys as a Map by Clark name.
 * @param {XdmMap|undefined} map
 * @returns {Map<string, Array>}
 */
function byClarkName(map) {
  const result = new Map();
  for (const { key, value } of map?.entries.values() ?? []) {
    result.set(clark(key), value);
  }
  return result;
}

/**
 * The string value of an option, atomized (a value built by
 * xsl:map-entry content is a text node).
 * @param {Array|undefined} value
 * @returns {string|undefined}
 */
const text = (value) =>
  value?.length ? String(atomize(value.slice(0, 1))[0]?.value) : undefined;

/**
 * Reads the options map.
 * @param {XdmMap} map
 * @returns {(name: string) => Array|undefined} the value of an option
 */
const reader = (map) => (name) => map.get(stringItem(name));

/**
 * The stylesheet to run, compiled.
 * @param {(name: string) => Array|undefined} option
 * @param {object} context - XPath dynamic context
 * @param {object} compileOptions - Options of the calling stylesheet
 * @returns {object} the CompiledStylesheet
 * @throws {import("../../errors.js").XPathError} FOXT0002 when no
 *   stylesheet is given or it cannot be loaded
 */
function compiled(option, context, compileOptions) {
  const value = (name) => option(name)?.[0];
  const staticParams = byClarkName(value("static-params"));
  const base = text(option("stylesheet-base-uri"));
  const compile = (source, baseUri) =>
    compileWith(source, { ...compileOptions, baseUri, staticParams });
  const location = text(option("stylesheet-location"));
  if (location !== undefined) {
    const uri = resolveUri(location, context.staticBaseUri);
    let source;
    try {
      source = compileOptions.loadStylesheet?.(uri, context.staticBaseUri);
    } catch (error) {
      throw xsltError("FOXT0002", `Cannot load ${uri}: ${error.message}`);
    }
    if (!source) throw xsltError("FOXT0002", `No stylesheet at ${uri}`);
    return compile(source, uri);
  }
  const node = value("stylesheet-node") ?? text(option("stylesheet-text"));
  if (node !== undefined) return compile(node, base);
  const name = text(option("package-name"));
  const found =
    name === undefined
      ? undefined
      : compileOptions.resolvePackage?.(
          name,
          text(option("package-version")) ?? "*",
        );
  if (!found) throw xsltError("FOXT0002", "fn:transform: no stylesheet");
  return compile(found.source ?? found, found.baseUri ?? base);
}

/**
 * A result in the requested delivery format.
 * @param {*} value - Document, fragment or raw sequence
 * @param {string} format - "document", "serialized" or "raw"
 * @param {object} output - Its serialization parameters
 * @returns {Array}
 */
function delivered(value, format, output) {
  const sequence = [value].flat();
  if (format === "serialized") return [stringItem(serialize(sequence, output))];
  return sequence;
}

/**
 * fn:transform.
 * @param {Array} args - The options map
 * @param {object} context - XPath dynamic context
 * @returns {Array} the result map
 */
function transform([[map]], context) {
  const option = reader(map);
  const value = (name) => option(name)?.[0];
  const tx = context.xc?.tx;
  const compileOptions =
    tx?.stylesheet.options ?? context.sc?.owner?.options ?? {};
  const format = text(option("delivery-format")) ?? "document";
  const stylesheet = compiled(option, context, compileOptions);
  const initial = (name) => (value(name) ? clark(value(name)) : undefined);
  const functionParams = value("function-params");
  const result = stylesheet.transform({
    ...tx?.options,
    source: value("source-node"),
    initialTemplate: initial("initial-template"),
    initialMode: initial("initial-mode"),
    initialMatchSelection: option("initial-match-selection"),
    initialFunction: value("initial-function") && {
      name: initial("initial-function"),
      args: functionParams?.members ?? [],
    },
    globalContextItem: value("global-context-item"),
    params: byClarkName(value("stylesheet-params")),
    templateParams: byClarkName(value("template-params")),
    tunnelParams: byClarkName(value("tunnel-params")),
    baseOutputUri: text(option("base-output-uri")),
    buildTree: format === "raw" ? false : undefined,
    onMessage: undefined,
  });
  const extra = value("serialization-params");
  const params = extra ? parametersFromMap(extra) : {};
  const entries = [];
  const principal = [result.principal].flat();
  if (principal.length > 0 || format !== "raw") {
    entries.push([
      stringItem("output"),
      delivered(result.principal, format, { ...result.output, ...params }),
    ]);
  }
  for (const [uri, { document, output }] of result.secondary) {
    entries.push([stringItem(uri), delivered(document, format, output)]);
  }
  return [XdmMap.from(entries)];
}

/** Function definitions. */
export const transformFunctions = [
  {
    local: "transform",
    params: ["map(*)"],
    returns: "map(*)",
    impl: transform,
  },
];
