/**
 * Compilers of map and array constructors and of the lookup operator `?`
 * (XPath 3.1 sections 3.11.1 to 3.11.3).
 *
 * @module @tradik/xslt3/xpath/eval/constructors
 */

import { XPathError } from "../../errors.js";
import { XdmArray } from "../../items/array.js";
import { XdmMap } from "../../items/map.js";
import { AtomicValue, isArray, isMap } from "../../xdm/atomic.js";
import { atomize } from "../../xdm/nodes.js";
import { types } from "../../xdm/types.js";
import { contextItem } from "./scope.js";

/**
 * Compiles the key specifier of a lookup.
 * @param {import("../syntax/ast.js").Lookup} node
 * @param {import("./scope.js").Scope} scope
 * @param {Function} compile
 * @returns {((ctx: object) => import("../../xdm/atomic.js").AtomicValue[])|null}
 *   the keys, null for the wildcard
 */
function compileKeys(node, scope, compile) {
  switch (node.keyKind) {
    case "wildcard":
      return null;
    case "name": {
      const keys = [new AtomicValue(types.string, node.key)];
      return () => keys;
    }
    case "integer": {
      const keys = [new AtomicValue(types.integer, BigInt(node.key))];
      return () => keys;
    }
    default: {
      const expr = compile(node.key, scope);
      return (ctx) => atomize(expr(ctx));
    }
  }
}

/**
 * Looks keys up in one map or array.
 * @param {*} item
 * @param {import("../../xdm/atomic.js").AtomicValue[]|null} keys - null for
 *   all entries or members
 * @param {Array} result - Values are appended
 * @throws {XPathError} XPTY0004 for an item that is neither a map nor an
 *   array, or a non-integer array key; FOAY0001 for a position out of
 *   bounds
 */
function lookup(item, keys, result) {
  if (isMap(item)) {
    if (keys === null) {
      for (const { value } of item.entries.values()) result.push(...value);
    } else {
      for (const key of keys) result.push(...(item.get(key) ?? []));
    }
  } else if (isArray(item)) {
    if (keys === null) {
      for (const member of item.members) result.push(...member);
    } else {
      for (const key of keys) result.push(...item.invoke([[key]]));
    }
  } else {
    throw new XPathError(
      "XPTY0004",
      "The lookup operator applies to maps and arrays only",
    );
  }
}

/** Compilers by node type. */
export const constructorCompilers = {
  MapConstructor(node, scope, compile) {
    const entries = node.entries.map((entry) => ({
      key: compile(entry.key, scope),
      value: compile(entry.value, scope),
    }));
    return (ctx) => {
      const pairs = entries.map(({ key, value }) => {
        const keys = atomize(key(ctx));
        if (keys.length !== 1) {
          throw new XPathError(
            "XPTY0004",
            "A map key must be a single atomic value",
          );
        }
        return [keys[0], value(ctx)];
      });
      const duplicate = () => {
        throw new XPathError("XQDY0137", "Duplicate key in a map constructor");
      };
      return [XdmMap.from(pairs, duplicate)];
    };
  },

  SquareArrayConstructor(node, scope, compile) {
    const members = node.members.map((member) => compile(member, scope));
    return (ctx) => [new XdmArray(members.map((member) => member(ctx)))];
  },

  CurlyArrayConstructor(node, scope, compile) {
    const expr = compile(node.expr, scope);
    return (ctx) => [new XdmArray(expr(ctx).map((item) => [item]))];
  },

  Lookup(node, scope, compile) {
    const base = compile(node.base, scope);
    const keys = compileKeys(node, scope, compile);
    return (ctx) => {
      const items = base(ctx);
      const keyValues = keys && keys(ctx);
      const result = [];
      for (const item of items) lookup(item, keyValues, result);
      return result;
    };
  },

  UnaryLookup(node, scope, compile) {
    const keys = compileKeys(node, scope, compile);
    return (ctx) => {
      const result = [];
      lookup(contextItem(ctx), keys && keys(ctx), result);
      return result;
    };
  },
};
