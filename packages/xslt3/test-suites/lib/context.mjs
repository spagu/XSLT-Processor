/**
 * Dynamic and static contexts of a qt3tests test built from its
 * environment with the engine adapter: documents are loaded with
 * `adapter.loadDocument`, parameters and the context item are evaluated
 * with `adapter.evaluateXPath`.
 *
 * @module test-suites/lib/context
 */

import { NotRunError } from "./assertions.mjs";

/**
 * Static context handed to `adapter.parse`.
 *
 * @param {import('./environment.mjs').Environment|null} environment - Env
 * @returns {object} `{namespaces, decimalFormats, staticBaseUri, variables}`
 *   where `variables` names the external variables in scope
 */
export function staticContext(environment) {
  if (!environment) {
    return { namespaces: [], decimalFormats: [], variables: [] };
  }
  const variables = [
    ...environment.params.map((param) => param.name),
    ...environment.sources
      .filter((source) => source.role.startsWith("$"))
      .map((source) => source.role.slice(1)),
  ];
  return {
    namespaces: environment.namespaces,
    decimalFormats: environment.decimalFormats,
    staticBaseUri: environment.staticBaseUri,
    variables,
  };
}

/**
 * Dynamic context handed to `adapter.evaluateXPath` for the test expression.
 *
 * @param {import('./environment.mjs').Environment|null} environment - Env
 * @param {object} adapter - Engine adapter
 * @returns {object} The context: static context entries plus `variables`
 *   (name to value), `contextItem`, `documents` (URI to document),
 *   `collations`, `resources`, `collections` and `environment`
 * @throws {NotRunError} When the environment needs a missing capability
 */
export function dynamicContext(environment, adapter) {
  const context = {
    ...staticContext(environment),
    variables: {},
    documents: {},
    environment,
    collations: environment?.collations ?? [],
    resources: environment?.resources ?? [],
    collections: environment?.collections ?? [],
  };
  if (!environment) return context;
  for (const source of environment.sources) {
    if (!adapter.loadDocument) {
      throw new NotRunError("adapter has no loadDocument");
    }
    const document = adapter.loadDocument(source);
    if (source.role === ".") context.contextItem = document;
    else if (source.role.startsWith("$")) {
      context.variables[source.role.slice(1)] = document;
    }
    if (source.uri) context.documents[source.uri] = document;
  }
  const evaluate = (select) => {
    if (!adapter.evaluateXPath) {
      throw new NotRunError("adapter has no evaluateXPath");
    }
    return adapter.evaluateXPath(select, {
      variables: { ...context.variables },
      namespaces: context.namespaces,
      contextItem: context.contextItem,
    });
  };
  for (const param of environment.params) {
    if (param.select !== undefined) {
      context.variables[param.name] = evaluate(param.select);
    }
  }
  if (environment.contextItem !== undefined) {
    context.contextItem = evaluate(environment.contextItem);
  }
  return context;
}
