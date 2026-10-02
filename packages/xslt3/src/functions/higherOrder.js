/**
 * Higher-order functions (F&O 3.1 sections 16 and 17.2): functions on
 * function items, and the functions that take function items.
 *
 * @module @tradik/xslt3/functions/higherOrder
 */

import { XPathError } from "../errors.js";
import { AtomicValue } from "../xdm/atomic.js";
import { types } from "../xdm/types.js";
import { integerItem } from "../xpath/eval/atomics.js";
import { sortFunctions } from "./sort.js";

/** Function definitions. */
export const higherOrderFunctions = [
  {
    local: "for-each",
    params: ["item()*", "function(item()) as item()*"],
    returns: "item()*",
    impl: ([sequence, [f]]) => sequence.flatMap((item) => f.invoke([[item]])),
  },
  {
    local: "filter",
    params: ["item()*", "function(item()) as xs:boolean"],
    returns: "item()*",
    impl: ([sequence, [f]]) =>
      sequence.filter((item) => f.invoke([[item]])[0].value),
  },
  {
    local: "fold-left",
    params: ["item()*", "item()*", "function(item()*, item()) as item()*"],
    returns: "item()*",
    impl: ([sequence, zero, [f]]) =>
      sequence.reduce((acc, item) => f.invoke([acc, [item]]), zero),
  },
  {
    local: "fold-right",
    params: ["item()*", "item()*", "function(item(), item()*) as item()*"],
    returns: "item()*",
    impl: ([sequence, zero, [f]]) =>
      sequence.reduceRight((acc, item) => f.invoke([[item], acc]), zero),
  },
  {
    local: "for-each-pair",
    params: ["item()*", "item()*", "function(item(), item()) as item()*"],
    returns: "item()*",
    impl: ([a, b, [f]]) => {
      const result = [];
      const length = Math.min(a.length, b.length);
      for (let i = 0; i < length; i++) {
        result.push(...f.invoke([[a[i]], [b[i]]]));
      }
      return result;
    },
  },
  {
    local: "apply",
    params: ["function(*)", "array(*)"],
    returns: "item()*",
    impl: ([[f], [array]]) => {
      if (f.arity !== array.size) {
        throw new XPathError(
          "FOAP0001",
          `The function has arity ${f.arity}, the array ${array.size} members`,
        );
      }
      return f.invoke(array.members);
    },
  },
  {
    local: "function-name",
    params: ["function(*)"],
    returns: "xs:QName?",
    impl: ([[f]]) => (f.name ? [new AtomicValue(types.QName, f.name)] : []),
  },
  {
    local: "function-arity",
    params: ["function(*)"],
    returns: "xs:integer",
    impl: ([[f]]) => [integerItem(f.arity)],
  },
  {
    local: "function-lookup",
    params: ["xs:QName", "xs:integer"],
    returns: "function(*)?",
    focus: true,
    impl: ([[name], [arity]], context) => {
      const ctx = {
        item: context.contextItem,
        position: context.position,
        size: context.size,
        env: null,
        dyn: context,
      };
      const { namespaceURI, localName } = name.value;
      const f = context.lookupFunction(
        namespaceURI,
        localName,
        Number(arity.value),
        ctx,
      );
      return f ? [f] : [];
    },
  },
  ...sortFunctions,
];
