/**
 * The `transform` capability of the engine adapter: runs an xslt30-test
 * test case with compileStylesheet / transform of @tradik/xslt3.
 *
 * @module test-suites/lib/transformAdapter
 */

import { fileURLToPath, pathToFileURL } from "node:url";
import { DOMImplementation } from "@xmldom/xmldom";
import { confinePath } from "../../../../scripts/lib/fsSafety.mjs";
import { NotRunError } from "./assertions.mjs";

/**
 * The serialization parameters (xsl:output, xsl:result-document) of the
 * results of transformations, for assertions that serialize them.
 * @type {WeakMap<object, object>}
 */
export const outputParams = new WeakMap();

/**
 * Clark name of a name of the catalog: an EQName (see
 * xsltCatalog.expandedName) or an unprefixed name.
 *
 * @param {string|undefined} name - The name
 * @returns {string|undefined} `{uri}local`
 * @throws {NotRunError} For a prefix the catalog does not declare
 */
export function catalogName(name) {
  if (name === undefined) return undefined;
  if (name.startsWith("Q{")) return name.slice(1);
  if (name.includes(":")) throw new NotRunError(`prefixed name ${name}`);
  return `{}${name}`;
}

/**
 * The `resolvePackage` option of compileStylesheet: the packages of the
 * test case and its environment, by the name and version in the catalog
 * or else in the package itself; the highest matching version wins.
 *
 * @param {object} engine - The @tradik/xslt3 module (versionMatches)
 * @param {object[]} packages - Catalog `<package>` entries
 * @param {(path: string) => Document} loadFile - Parses a file
 * @returns {(name: string, range: string) => object|undefined} The option
 */
export function packageResolver(engine, packages, loadFile) {
  const describe = (entry) => {
    const root = loadFile(entry.file).documentElement;
    return {
      file: entry.file,
      name: root.getAttribute("name") || entry.uri,
      version:
        root.getAttribute("package-version") || entry.packageVersion || "1",
    };
  };
  return (name, range) => {
    const found = packages
      .map(describe)
      .filter((p) => p.name === name && engine.versionMatches(p.version, range))
      // ascending versions: the highest last
      .sort((a, b) =>
        engine.versionMatches(b.version, `${a.version}+`) ? -1 : 1,
      )
      .at(-1);
    return (
      found && {
        source: loadFile(found.file),
        baseUri: pathToFileURL(found.file).href,
      }
    );
  };
}

/**
 * Builds the transform function of the adapter.
 *
 * @param {object} engine - The @tradik/xslt3 module
 * @param {object} helpers - `loadFile(path)`, `loadSource(source)` and
 *   `evaluate(expression, contextItem)`
 * @returns {(stylesheet: object, input: object, params: object[]) => object}
 *   The transform capability
 */
export function createTransform(engine, helpers) {
  const { loadFile, evaluate } = helpers;
  const createDocument = () =>
    new DOMImplementation().createDocument(null, null);
  const fromUrl = (uri) => loadFile(confinePath(fileURLToPath(uri)));
  return (stylesheet, input, params) => {
    const principal =
      stylesheet.stylesheets.find((s) => s.role !== "secondary") ??
      stylesheet.packages.find((p) => p.role === "principal") ??
      stylesheet.stylesheets[0];
    if (!principal?.file) throw new NotRunError("no stylesheet file");
    const environment = input.environment;
    const documents = new Map();
    let source;
    for (const entry of environment?.sources ?? []) {
      const document = helpers.loadSource(entry);
      if (entry.role === ".") {
        source = entry.select ? evaluate(entry.select, document)[0] : document;
      }
      if (entry.uri) documents.set(entry.uri, document);
    }
    const documentLoader = (uri) => {
      for (const [key, document] of documents) {
        if (uri === key || uri.endsWith(`/${key}`)) return document;
      }
      return uri.startsWith("file:") ? fromUrl(uri) : null;
    };
    const values = (list) => {
      const result = new Map();
      for (const param of list ?? []) {
        if (param.select === undefined) continue;
        result.set(catalogName(param.name), evaluate(param.select, source));
      }
      return result;
    };
    const compiled = engine.compileStylesheet(loadFile(principal.file), {
      baseUri: pathToFileURL(principal.file).href,
      loadStylesheet: fromUrl,
      staticParams: values(params.filter((param) => param.static)),
      resolvePackage: packageResolver(
        engine,
        stylesheet.packages.filter((p) => p !== principal),
        loadFile,
      ),
    });
    const entry =
      input.initialTemplate ?? input.initialMode ?? input.initialFunction;
    const entryParams = entry?.params ?? [];
    const result = compiled.transform({
      source,
      initialTemplate: catalogName(input.initialTemplate?.name),
      initialMode: catalogName(input.initialMode?.name),
      initialMatchSelection: input.initialMode?.select
        ? evaluate(input.initialMode.select, source)
        : undefined,
      initialFunction: input.initialFunction && {
        name: catalogName(input.initialFunction.name),
        args: entryParams.map((param) => evaluate(param.select, source)),
      },
      params: values(params),
      templateParams: values(entryParams.filter((p) => !p.tunnel)),
      tunnelParams: values(entryParams.filter((p) => p.tunnel)),
      documentLoader,
      createDocument,
    });
    const resultDocuments = new Map();
    for (const [uri, { document, output }] of result.secondary) {
      resultDocuments.set(uri, document);
      outputParams.set(document, output);
    }
    if (typeof result.principal === "object") {
      outputParams.set(result.principal, result.output);
    }
    return {
      value: result.principal,
      messages: result.messages,
      resultDocuments,
    };
  };
}
