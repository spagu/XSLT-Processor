/**
 * Static function resolution and the function items of known functions:
 * library functions (see functions/registry.js), constructor functions of
 * the atomic types, and F&O functions without an implementation yet.
 *
 * @module @tradik/xslt3/xpath/eval/functionItems
 */

import { XPathError } from "../../errors.js";
import { isStandardFunction, NS } from "../../functions/signatures.js";
import { FunctionItem } from "../../items/function.js";
import { QNameValue } from "../../xdm/qname.js";
import { XS_NAMESPACE } from "../../xdm/types.js";
import { parseSequenceType } from "../syntax/types.js";
import { TokenStream } from "../syntax/tokenStream.js";
import { coerce } from "./coercion.js";
import { dynamicCallContext } from "./dynamicCall.js";
import { compileSequenceType } from "./sequenceType.js";
import { createStaticContext } from "./staticContext.js";
import { compileCastTarget, LIST_TYPES } from "./typeExprs.js";

/** Largest arity of a function reference to a variadic function. */
const MAX_ARITY = 1000000;

/** Static context in which definition types are read. */
const BUILT_IN_CONTEXT = createStaticContext({}, null);

/** @type {Map<string, object>} compiled sequence types by text */
const typeCache = new Map();

/**
 * @param {string} text - A sequence type in XPath syntax
 * @returns {import("./sequenceType.js").SequenceType}
 */
export function sequenceTypeOf(text) {
  let type = typeCache.get(text);
  if (!type) {
    const tokens = new TokenStream(text);
    type = compileSequenceType(parseSequenceType(tokens), BUILT_IN_CONTEXT);
    if (tokens.peek().type !== "eof") tokens.fail("Unexpected token");
    typeCache.set(text, type);
  }
  return type;
}

/**
 * Signature of a definition at an arity (variadic definitions repeat their
 * last parameter).
 * @param {import("../../functions/registry.js").FunctionDefinition} definition
 * @param {number} arity
 * @returns {{params: object[], returns: object}}
 */
export function definitionSignature(definition, arity) {
  const texts = definition.params;
  const params = [];
  for (let i = 0; i < arity; i++) {
    params.push(sequenceTypeOf(texts[Math.min(i, texts.length - 1)]));
  }
  return { params, returns: sequenceTypeOf(definition.returns) };
}

/**
 * A resolved static function: `call(args, ctx)` takes evaluated arguments
 * and returns the result; `signature` gives the parameter types.
 * @typedef {object} ResolvedFunction
 * @property {QNameValue} name
 * @property {number} arity
 * @property {{params: object[], returns: object}} signature
 * @property {boolean} focus - Depends on the focus
 * @property {(args: Array<Array>, ctx: object) => Array} call
 */

/**
 * Builds the call of a library function.
 * @returns {ResolvedFunction}
 */
function libraryFunction(definition, name, arity, sc) {
  const signature = definitionSignature(definition, arity);
  const options = signature.params.map((_, i) => ({
    what: `argument ${i + 1} of ${name}()`,
    compatible: sc.backwardsCompatible,
  }));
  const call = definition.focus
    ? (args, ctx) => {
        const context = Object.create(ctx.dyn);
        context.contextItem = ctx.item;
        context.position = ctx.position;
        context.size = ctx.size;
        return definition.impl(
          args.map((arg, i) => coerce(arg, signature.params[i], options[i])),
          context,
        );
      }
    : (args, ctx) =>
        definition.impl(
          args.map((arg, i) => coerce(arg, signature.params[i], options[i])),
          ctx.dyn,
        );
  return { name, arity, signature, focus: Boolean(definition.focus), call };
}

/**
 * Builds the call of a constructor function `xs:T($arg)`.
 * @returns {ResolvedFunction|null} null when T has no constructor
 */
function constructorFunction(name, sc) {
  let caster;
  try {
    caster = compileCastTarget(
      { prefix: null, uri: XS_NAMESPACE, local: name.localName },
      sc,
    );
  } catch {
    return null;
  }
  const signature = {
    params: [sequenceTypeOf("xs:anyAtomicType?")],
    returns: sequenceTypeOf(
      name.localName === "error"
        ? "empty-sequence()"
        : LIST_TYPES[name.localName]
          ? `xs:${LIST_TYPES[name.localName]}*`
          : `xs:${name.localName}?`,
    ),
  };
  const what = { what: `argument of ${name}()` };
  const call = ([arg]) => {
    const values = coerce(arg, signature.params[0], what);
    return values.length === 0 ? [] : caster(values[0]);
  };
  return { name, arity: 1, signature, focus: false, call };
}

/**
 * Resolves a function by expanded name and arity.
 * @param {string} uri
 * @param {string} local
 * @param {number} arity
 * @param {import("./staticContext.js").StaticContext} sc
 * @returns {ResolvedFunction}
 * @throws {XPathError} XPST0017 when there is no such function
 */
export function resolveFunction(uri, local, arity, sc) {
  if (arity > MAX_ARITY) {
    throw new XPathError("FOAR0002", `Arity ${arity} is too large`);
  }
  const prefix = Object.keys(NS).find((key) => NS[key] === uri);
  const name = new QNameValue(
    uri,
    local,
    prefix ?? (uri === XS_NAMESPACE ? "xs" : ""),
  );
  const definition = sc.functions.lookup(uri, local, arity);
  if (definition) return libraryFunction(definition, name, arity, sc);
  const constructor =
    uri === XS_NAMESPACE && arity === 1 ? constructorFunction(name, sc) : null;
  if (constructor) return constructor;
  if (isStandardFunction(uri, local, arity)) {
    return {
      name,
      arity,
      signature: null,
      focus: false,
      call: () => {
        throw new XPathError(
          "XPST0017",
          `${local}#${arity} is not implemented`,
        );
      },
    };
  }
  throw new XPathError(
    "XPST0017",
    `Unknown function Q{${uri}}${local}#${arity}`,
  );
}

/**
 * The function item of a resolved function; a focus-dependent function
 * keeps the focus of `ctx`.
 * @param {ResolvedFunction} resolved
 * @param {import("./scope.js").Context} ctx
 * @returns {FunctionItem}
 */
export function functionItemOf(resolved, ctx) {
  if (resolved.signature === null) return resolved.call();
  return new FunctionItem({
    name: resolved.name,
    arity: resolved.arity,
    signature: resolved.signature,
    invoke: (args) =>
      resolved.call(args, { ...ctx, dyn: dynamicCallContext(ctx.dyn) }),
  });
}
