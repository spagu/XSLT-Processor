/**
 * A transformation (XSLT 3.0 section 2.3): the dynamic context shared by
 * every instruction, whitespace stripping of the source documents, the
 * global variables evaluated on first use, and the results collected.
 *
 * @module @tradik/xslt3/xslt/runtime/transformation
 */

import { withinLimits } from "../../xpath/eval/compiler.js";
import { isEligibleMode } from "../compiler/packageChecks.js";
import { displayName, xsltError } from "../names.js";
import {
  checkLibraryContextItems,
  globalContextItem,
} from "../compiler/globalContextItem.js";
import { setInitialAccumulators } from "./accumulators.js";
import { withDefaultMethod } from "./defaultMethod.js";
import { finishTree, invoke } from "./invocation.js";
import { LazyEntry } from "./lazy.js";
import { Machine } from "./machine.js";
import { normalizeParams } from "./params.js";
import { isStrippedText } from "./strip.js";
import {
  documentStripper,
  transformationContext,
} from "./transformationContext.js";

/**
 * The lazily evaluated entries of the global variables.
 * @param {object} tx
 * @param {Map<string, Array>} params - Supplied stylesheet parameters
 * @returns {object|null} the environment (see xpath/eval/scope.js)
 */
function globalEnvironment(tx, params) {
  let env = null;
  for (const global of tx.stylesheet.globals) {
    if (global.required && !params.has(global.key)) {
      throw xsltError(
        "XTDE0050",
        `The parameter $${displayName(global.key)} is required`,
      );
    }
    const compute =
      global.isParam && params.has(global.key)
        ? () => global.convert(params.get(global.key))
        : () => global.value(tx.globalContext, tx.machine);
    env = new LazyEntry(env, compute, global.key, true);
  }
  return env;
}

/**
 * The document factory of a transformation: the option, else the DOM of
 * the source, else the global document.
 * @param {object} options
 * @returns {() => Document}
 */
function documentFactory(options) {
  if (options.createDocument) return options.createDocument;
  return () => {
    const owner = options.source?.ownerDocument ?? options.source;
    const implementation =
      owner?.implementation ?? globalThis.document?.implementation;
    if (!implementation) {
      throw xsltError(
        "XPDY0130",
        "No DOM to build results: pass createDocument",
      );
    }
    return implementation.createDocument(null, null, null);
  };
}

/**
 * The initial mode: `#unnamed`, `#default` or a Clark name of a mode
 * eligible as initial mode (XTDE0045).
 * @param {object} stylesheet
 * @param {string|undefined} requested - Option initialMode
 * @returns {object} the mode
 */
function initialMode(stylesheet, requested) {
  const token = requested?.replace(/^\{\}(?=#)/, "");
  if (token === undefined || token === "#default") {
    return stylesheet.mode(stylesheet.defaultModeName);
  }
  const name = token === "#unnamed" ? "" : token;
  if (!isEligibleMode(stylesheet, name)) {
    throw xsltError("XTDE0045", `The mode ${requested} is not eligible`);
  }
  return stylesheet.mode(name);
}

/**
 * Runs a transformation.
 * @param {object} stylesheet - Compiled stylesheet (StylesheetCompiler)
 * @param {object} options - See CompiledStylesheet.transform
 * @returns {{principal: Node|Array, secondary: Map<string, object>,
 *   messages: Array}}
 */
export function runTransformation(stylesheet, options) {
  checkLibraryContextItems(stylesheet);
  const createDocument = documentFactory(options);
  let scratchDocument = null;
  const strip = documentStripper();
  // a source text node that stripping removes is no source (XPDY0002)
  const source = isStrippedText(options.source ?? {}, stylesheet.spaceRules)
    ? undefined
    : strip(options.source, stylesheet.spaceRules);
  const tx = {
    stylesheet,
    options,
    machine: new Machine(options.maxDepth),
    scratch: () => (scratchDocument ??= createDocument()),
    messages: [],
    onMessage: options.onMessage,
    resultUris: new Set(),
    baseOutputUri: options.baseOutputUri,
    secondary: new Map(),
    keyIndexes: new Map(),
    defaultMode: initialMode(stylesheet, options.initialMode),
    principalOverride: null,
    dynamicEvaluation: options.dynamicEvaluation !== false,
    assertions: options.assertions !== false,
    principalOutput: null,
    dyn: transformationContext(stylesheet, options, strip, createDocument),
  };
  tx.addResult = (uri, fragment, output) => {
    const tree = Array.isArray(fragment)
      ? fragment
      : finishTree(fragment, createDocument);
    const params = withDefaultMethod(output, tree);
    if (uri === "") {
      tx.principalOverride = tree;
      tx.principalOutput = params;
    } else tx.secondary.set(uri, { document: tree, output: params });
  };
  tx.globalContext = {
    tx,
    item: globalContextItem(
      stylesheet.globalContextItem,
      options.globalContextItem ?? source,
    ),
    position: 1,
    size: 1,
    env: null,
    mode: tx.defaultMode,
    rule: null,
    group: undefined,
    groupKey: undefined,
    regex: undefined,
    tunnel: null,
    temporary: false,
    outputUri: options.baseOutputUri,
    dyn: null,
  };
  setInitialAccumulators(tx, options, source);
  tx.globalEnv = globalEnvironment(
    tx,
    normalizeParams(options.params, options.paramsAsUntyped),
  );
  tx.globalContext.env = tx.globalEnv;
  return withinLimits(() => invoke(tx, options, source, createDocument));
}
