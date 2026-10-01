/**
 * The invocation of a stylesheet (XSLT 3.0 section 2.3): an initial
 * named template, an initial mode applied to the initial match selection,
 * or an initial function; then the principal result as a document.
 *
 * @module @tradik/xslt3/xslt/runtime/invocation
 */

import { toSequence } from "../../xpath/eval/values.js";
import { xsltError } from "../names.js";
import { applyTemplates, invokeTemplate, NO_ARGS } from "./apply.js";
import { callFunction } from "./functionCall.js";
import { clarkName, normalizeParams } from "./params.js";
import { TreeReceiver } from "./treeReceiver.js";

/** The default initial template of XSLT 3.0. */
const INITIAL_TEMPLATE =
  "{http://www.w3.org/1999/XSL/Transform}initial-template";

/**
 * A result tree as a Document when it is well-formed (one element, no
 * text at the top), else the document fragment that holds it.
 * @param {DocumentFragment} fragment
 * @param {() => Document} createDocument
 * @returns {Document|DocumentFragment}
 */
export function finishTree(fragment, createDocument) {
  const children = [...fragment.childNodes];
  const elements = children.filter((child) => child.nodeType === 1).length;
  if (elements !== 1 || children.some((child) => child.nodeType === 3)) {
    return fragment;
  }
  const document = createDocument();
  for (const child of children) {
    document.appendChild(document.importNode(child, true));
  }
  return document;
}

/**
 * The first step of a transformation: the initial template or mode.
 * @param {object} tx - The transformation
 * @param {object} options - See CompiledStylesheet.transform
 * @param {Node|undefined} source
 * @returns {Function} a step (see machine.js)
 */
function initialStep(tx, options, source) {
  const { stylesheet } = tx;
  const args = {
    params: normalizeParams(options.templateParams),
    tunnel: normalizeParams(options.tunnelParams),
  };
  let name = options.initialTemplate;
  const fromItems =
    options.initialMode !== undefined ||
    source !== undefined ||
    options.initialMatchSelection !== undefined;
  if (name === undefined && !fromItems) name = INITIAL_TEMPLATE;
  if (name !== undefined) {
    const template = stylesheet.namedTemplates.get(clarkName(name));
    if (!template) throw xsltError("XTDE0040", `No template named ${name}`);
    const supplied = args.params.size || args.tunnel.size ? args : NO_ARGS;
    return (xc, out, machine) =>
      invokeTemplate(template, xc, out, machine, supplied);
  }
  const selection =
    options.initialMatchSelection ?? (source === undefined ? [] : [source]);
  if (source === undefined && options.initialMatchSelection === undefined) {
    throw xsltError("XTDE0044", "No source document and no initial template");
  }
  return (xc, out, machine) =>
    applyTemplates(
      toSequence(selection),
      tx.defaultMode,
      xc,
      out,
      machine,
      args,
    );
}

/**
 * Calls the initial function.
 * @param {object} tx
 * @param {{name: string, args: Array}} entry
 * @returns {Array} its result
 */
function callInitialFunction(tx, { name, args }) {
  const key = `${clarkName(name)}#${args.length}`;
  const compiled = tx.stylesheet.functionBodies.get(key);
  if (!compiled) throw xsltError("XTDE0041", `No function ${key}`);
  return callFunction(compiled, args.map(toSequence), { xc: tx.globalContext });
}

/**
 * Runs the initial template, mode or function.
 * @param {object} tx
 * @param {object} options
 * @param {Node|undefined} source
 * @param {() => Document} createDocument
 * @returns {{principal: *, principalOutput: object|null, secondary: Map,
 *   messages: Array}} principalOutput: the parameters of an
 *   xsl:result-document that wrote the principal result
 */
export function invoke(tx, options, source, createDocument) {
  const result = { secondary: tx.secondary, messages: tx.messages };
  if (options.initialFunction) {
    return {
      principal: callInitialFunction(tx, options.initialFunction),
      ...result,
    };
  }
  const step = initialStep(tx, options, source);
  const document = createDocument();
  const fragment = document.createDocumentFragment();
  tx.machine.runBody(
    [step],
    tx.globalContext,
    new TreeReceiver(fragment, new Map()),
  );
  if (tx.principalOverride && fragment.hasChildNodes()) {
    throw xsltError("XTDE1490", "The principal result is written twice");
  }
  const children = [...fragment.childNodes];
  const wellFormed =
    children.filter((child) => child.nodeType === 1).length === 1 &&
    !children.some((child) => child.nodeType === 3);
  if (wellFormed) document.appendChild(fragment);
  const principal = tx.principalOverride ?? (wellFormed ? document : fragment);
  return { principal, principalOutput: tx.principalOutput, ...result };
}
