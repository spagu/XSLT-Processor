/**
 * Compilers of the expressions on sequence types: instance of, treat as,
 * castable as and cast as (XPath 3.1 section 3.14), and the cast used by
 * constructor functions.
 *
 * @module @tradik/xslt3/xpath/eval/typeExprs
 */

import { XPathError } from "../../errors.js";
import { cast } from "../../xdm/cast.js";
import { atomize } from "../../xdm/nodes.js";
import { AtomicValue } from "../../xdm/atomic.js";
import { canonicalString } from "../../xdm/lexical.js";
import { derivesFrom, getType, types, XS_NAMESPACE } from "../../xdm/types.js";
import { booleanItem } from "./atomics.js";
import { compileSequenceType, matchesSequenceType } from "./sequenceType.js";
import { namespaceOf } from "./staticContext.js";
import { resolveAtomicType } from "./typeNames.js";

const NOT_CASTABLE = new Set(["anyAtomicType", "anySimpleType", "NOTATION"]);

/** List types and their item types. */
export const LIST_TYPES = {
  NMTOKENS: "NMTOKEN",
  IDREFS: "IDREF",
  ENTITIES: "ENTITY",
};

/**
 * A compiled cast: an atomic value to the values of the target type (one
 * value, or any number for a list type).
 * @typedef {(value: import("../../xdm/atomic.js").AtomicValue) =>
 *   import("../../xdm/atomic.js").AtomicValue[]} Caster
 */

/**
 * Compiles the target type of a cast: an atomic type, xs:numeric or a
 * built-in list type.
 * @param {import("../syntax/ast.js").QName} name
 * @param {import("./staticContext.js").StaticContext} sc
 * @returns {Caster}
 * @throws {XPathError} XPST0080 for a target type that cannot be cast to,
 *   XPST0051 for an unknown one
 */
export function compileCastTarget(name, sc) {
  const uri = namespaceOf(name, sc, sc.defaultElementNamespace);
  if (uri === XS_NAMESPACE && NOT_CASTABLE.has(name.local)) {
    throw new XPathError("XPST0080", `Cannot cast to xs:${name.local}`);
  }
  if (uri === XS_NAMESPACE && LIST_TYPES[name.local]) {
    const itemType = getType(LIST_TYPES[name.local]);
    return (value) =>
      canonicalString(value)
        .split(/[ \t\r\n]+/)
        .filter(Boolean)
        .map((token) => cast(new AtomicValue(types.string, token), itemType));
  }
  const members = resolveAtomicType(name, sc);
  const options = {
    resolveNamespace: (prefix) =>
      prefix === "" ? sc.defaultElementNamespace : sc.namespaces.get(prefix),
  };
  if (members.length === 1) {
    return (value) => [cast(value, members[0], options)];
  }
  return (value) => {
    if (members.some((t) => derivesFrom(value.type, t))) return [value];
    let failure;
    for (const member of members) {
      try {
        return [cast(value, member, options)];
      } catch (error) {
        failure ??= error;
      }
    }
    throw failure;
  };
}

/**
 * The single atomic operand of a cast.
 * @param {Array} sequence
 * @param {boolean} emptyAllowed
 * @returns {import("../../xdm/atomic.js").AtomicValue|undefined}
 * @throws {XPathError} XPTY0004 for an empty (when not allowed) or longer
 *   sequence
 */
function castOperand(sequence, emptyAllowed) {
  const values = atomize(sequence);
  if (values.length === 1) return values[0];
  if (values.length === 0 && emptyAllowed) return undefined;
  throw new XPathError(
    "XPTY0004",
    `A cast needs one atomic value, not ${values.length}`,
  );
}

/** Compilers by node type. */
export const typeCompilers = {
  InstanceOfExpr(node, scope, compile) {
    const expr = compile(node.expr, scope);
    const type = compileSequenceType(node.sequenceType, scope.sc);
    return (ctx) => [booleanItem(matchesSequenceType(expr(ctx), type))];
  },

  TreatExpr(node, scope, compile) {
    const expr = compile(node.expr, scope);
    const type = compileSequenceType(node.sequenceType, scope.sc);
    return (ctx) => {
      const value = expr(ctx);
      if (!matchesSequenceType(value, type)) {
        throw new XPathError(
          "XPDY0050",
          "The value does not match the type of treat as",
        );
      }
      return value;
    };
  },

  CastExpr(node, scope, compile) {
    const expr = compile(node.expr, scope);
    const caster = compileCastTarget(node.targetType, scope.sc);
    return (ctx) => {
      const value = castOperand(expr(ctx), node.emptyAllowed);
      return value === undefined ? [] : caster(value);
    };
  },

  CastableExpr(node, scope, compile) {
    const expr = compile(node.expr, scope);
    const caster = compileCastTarget(node.targetType, scope.sc);
    return (ctx) => {
      const values = atomize(expr(ctx));
      if (values.length !== 1) {
        return [booleanItem(values.length === 0 && node.emptyAllowed)];
      }
      try {
        caster(values[0]);
        return [booleanItem(true)];
      } catch (error) {
        if (!(error instanceof XPathError)) throw error;
        return [booleanItem(false)];
      }
    };
  },
};
