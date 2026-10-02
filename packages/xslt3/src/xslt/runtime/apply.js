/**
 * Template invocation at run time (XSLT 3.0 sections 6.7 to 6.9 and
 * 10.1): applying templates to items in a mode, the built-in template
 * rules, and binding the parameters of a template.
 *
 * @module @tradik/xslt3/xslt/runtime/apply
 */

import { childrenOf, attributesOf } from "../../xpath/eval/domNodes.js";
import { isAtomic } from "../../xdm/atomic.js";
import { canonicalString } from "../../xdm/lexical.js";
import { stringValue } from "../../xdm/nodes.js";
import { xsltError } from "../names.js";
import { derive, withVariable } from "./context.js";
import { markCopied, markDocumentCopied } from "./baseUri.js";
import { copyNamespaceNodes } from "./copy.js";
import { BodyFrame, LoopFrame } from "./machine.js";
import { SequenceReceiver } from "./sequenceReceiver.js";

/**
 * Parameters passed to a template: non-tunnel ones by Clark name, and
 * the tunnel parameters this call adds.
 * @typedef {{params: Map<string, Array>, tunnel: Map<string, Array>|null}} Args
 */

/** No parameters. */
export const NO_ARGS = Object.freeze({ params: new Map(), tunnel: null });

/**
 * Instantiates a template: binds its parameters and runs its body.
 * @param {object} template - Compiled template
 * @param {object} xc - Context of the invocation (focus, mode, rule set)
 * @param {object} out - Receiver
 * @param {import("./machine.js").Machine} machine
 * @param {Args} args
 */
export function invokeTemplate(template, xc, out, machine, args) {
  let tunnel = xc.tunnel;
  if (args.tunnel && args.tunnel.size > 0) {
    tunnel = new Map(tunnel ?? []);
    for (const [key, value] of args.tunnel) tunnel.set(key, value);
  }
  let ctx = derive(xc, { env: xc.tx.globalEnv, tunnel, merge: undefined });
  for (const param of template.params) {
    let value = param.tunnel
      ? tunnel?.get(param.key)
      : args.params.get(param.key);
    if (value !== undefined) value = param.convert(value);
    else if (param.required) {
      throw xsltError("XTDE0700", `The parameter ${param.key} is required`);
    } else value = param.value(ctx, machine);
    ctx = withVariable(ctx, value);
  }
  if (template.convert) {
    const result = new SequenceReceiver(xc.tx.scratch);
    machine.runBody(template.body, ctx, result);
    for (const item of template.convert(result.items)) out.item(item);
  } else if (template.body.length > 0) {
    machine.push(new BodyFrame(template.body, ctx, out));
  }
}

/**
 * Applies templates to one item (the body of a LoopFrame visit).
 * @param {*} item
 * @param {object} xc - Context with the focus on the item
 * @param {object} mode
 * @param {object} out
 * @param {import("./machine.js").Machine} machine
 * @param {Args} args
 */
export function applyToItem(item, xc, mode, out, machine, args) {
  const rule = mode.find(item, xc);
  if (rule) {
    invokeTemplate(rule.template, derive(xc, { rule }), out, machine, args);
  } else applyBuiltIn(item, xc, mode, out, machine, args);
}

/**
 * Applies templates to a sequence of items in a mode.
 * @param {Array} items
 * @param {object} mode
 * @param {object} xc - Context of the instruction
 * @param {object} out
 * @param {import("./machine.js").Machine} machine
 * @param {Args} args
 */
export function applyTemplates(items, mode, xc, out, machine, args) {
  const size = items.length;
  if (size === 0) return;
  const base = derive(xc, {
    mode,
    group: undefined,
    groupKey: undefined,
  });
  machine.push(
    new LoopFrame(size, (i) => {
      const item = items[i];
      const ixc = derive(base, { item, position: i + 1, size });
      applyToItem(item, ixc, mode, out, machine, args);
    }),
  );
}

/**
 * The built-in template rule of a mode (its on-no-match behaviour).
 * @param {*} item
 * @param {object} xc - Context with the focus on the item
 * @param {object} mode
 * @param {object} out
 * @param {import("./machine.js").Machine} machine
 * @param {Args} args
 */
export function applyBuiltIn(item, xc, mode, out, machine, args) {
  const action = mode.onNoMatch;
  const type = item?.nodeType;
  const container = type === 1 || type === 9 || type === 11;
  if (action === "fail") {
    throw xsltError("XTDE0555", "No template rule matches the item");
  }
  // deep-skip processes the children of a document node (XSLT 3.0 6.7.1)
  if (action === "deep-skip" && type !== 9 && type !== 11) return;
  const copy = action === "shallow-copy";
  if (action === "deep-copy" || (copy && !container)) {
    if (type === undefined) out.item(item);
    else out.copy(item, true);
    return;
  }
  if (!container) {
    if (action === "text-only-copy") {
      if (isAtomic(item)) out.text(canonicalString(item));
      else if (type === 2 || type === 3 || type === 4) {
        out.text(stringValue(item));
      }
    }
    return;
  }
  let target = out;
  if (copy && type === 1) {
    target = out.element(item.namespaceURI ?? "", item.nodeName);
    markCopied(item, target.parent);
    copyNamespaceNodes(item, target);
  } else if (copy) {
    target = out.document();
    markDocumentCopied(item, target);
  }
  const children = childrenOf(item);
  const selected =
    type === 1 && action !== "text-only-copy"
      ? [...attributesOf(item), ...children]
      : children;
  applyTemplates(selected, mode, xc, target, machine, args);
}
