/**
 * What the compiled stylesheet holds, filled during compilation and read
 * at run time: global variable names, named templates, modes and their
 * rules, attribute sets, keys and stylesheet functions.
 *
 * @module @tradik/xslt3/xslt/compiler/registry
 */

import { Mode } from "../patterns/modes.js";
import { useStaticContext } from "../runtime/context.js";
import { callFunction } from "../runtime/functionCall.js";
import { attr, displayName, tokens, xsltError } from "../names.js";
import { infoOf } from "./elementInfo.js";
import { expandCharacterMaps } from "./outputDecl.js";
import { StaticStage } from "./staticStage.js";

/** Registries of a stylesheet. */
export class CompilerRegistry extends StaticStage {
  /** @param {object} options - See compileStylesheet */
  constructor(options) {
    super(options);
    /** @type {Array<() => void>} checks run once everything is compiled */
    this.deferred = [];
    this.attributeSets = new Map();
    /** @type {Map<string, object>} */
    this.namedTemplates = new Map();
    /** @type {Map<string, Mode>} */
    this.modes = new Map();
    this.allModeRules = [];
    this.keys = new Map();
    this.functionBodies = new Map();
    this.declarationPrecedence = new WeakMap();
    this.positions = 0;
    this.globalKeys = [];
    this.globalVars = null;
  }

  /** @param {string[]} keys - Clark names of the global variables */
  setGlobals(keys) {
    this.globalKeys = keys;
    let vars = null;
    for (const key of keys) vars = { key, next: vars };
    this.globalVars = vars;
  }

  /** @returns {{vars: object|null}} the scope of top-level declarations */
  globalScope() {
    return { vars: this.globalVars };
  }

  /** @returns {number} the next declaration position */
  nextPosition() {
    return this.positions++;
  }

  /**
   * @param {Element} element - A top-level declaration
   * @returns {number} its import precedence
   */
  precedenceOf(element) {
    return this.declarationPrecedence.get(element) ?? 0;
  }

  /**
   * Registers a named template (the highest precedence wins).
   * @param {string} key
   * @param {object} template
   */
  addNamedTemplate(key, template) {
    const current = this.namedTemplates.get(key);
    if (current && current.precedence === template.precedence) {
      throw xsltError("XTSE0660", `Two templates are named ${key}`);
    }
    if (!current || current.precedence < template.precedence) {
      this.namedTemplates.set(key, template);
    }
  }

  /**
   * Gets or creates a mode.
   * @param {string} name - Clark name, "" for the unnamed mode
   * @returns {Mode}
   */
  mode(name) {
    let mode = this.modes.get(name);
    if (!mode) {
      mode = new Mode(name);
      for (const rule of this.allModeRules) mode.add({ ...rule });
      this.modes.set(name, mode);
    }
    return mode;
  }

  /**
   * Adds a template rule to a mode ("#all": every mode).
   * @param {string} name
   * @param {object} rule
   */
  addRule(name, rule) {
    if (name === "#all") {
      this.allModeRules.push(rule);
      for (const mode of this.modes.values()) mode.add({ ...rule });
    } else this.mode(name).add(rule);
  }

  /** Makes sure the unnamed mode exists. */
  finishModes() {
    this.mode("");
  }

  /**
   * Resolves the mode attribute of xsl:apply-templates.
   * @param {string|undefined} text
   * @param {Element} element
   * @returns {{current: boolean, name: string}}
   */
  modeRef(text, element) {
    const token = text?.trim();
    if (token === "#current") return { current: true, name: "" };
    if (token === undefined || token === "#default") {
      return { current: false, name: infoOf(element).defaultMode };
    }
    if (token === "#unnamed") return { current: false, name: "" };
    if (tokens(token).length !== 1) {
      throw xsltError("XTSE0550", `Invalid mode ${text}`);
    }
    const name = this.exprs.qname(token, element);
    return { current: false, name: `{${name.uri}}${name.local}` };
  }

  /**
   * Static checks of xsl:call-template once all templates are known.
   * @param {string} key
   * @param {{names: Set<string>}} params - Its xsl:with-param children
   * @param {Element} element
   */
  checkCall(key, params, element) {
    const template = this.namedTemplates.get(key);
    if (!template) {
      throw xsltError("XTSE0650", `No template named ${displayName(key)}`);
    }
    const declared = new Set(
      template.params.filter((p) => !p.tunnel).map((p) => p.key),
    );
    for (const name of params.names) {
      if (!declared.has(name) && infoOf(element).version >= 2) {
        throw xsltError(
          "XTSE0680",
          `The template ${key} has no parameter ${name}`,
        );
      }
    }
    for (const param of template.params) {
      if (param.required && !param.tunnel && !params.names.has(param.key)) {
        throw xsltError("XTSE0690", `The parameter ${param.key} is required`);
      }
    }
  }

  /**
   * The function library definition of a stylesheet function.
   * @param {object} signature
   * @returns {object}
   */
  functionDefinition(signature) {
    // filled by compileFunction once every signature is known
    const compiled = { params: [], body: [], convert: null };
    this.functionBodies.set(signature.key, compiled);
    return {
      namespace: signature.uri,
      local: signature.local,
      params: Array(signature.arity).fill("item()*"),
      returns: "item()*",
      impl: (args, context) => callFunction(compiled, args, context),
      // xsl:evaluate sees the public and final functions only
      visibility:
        attr(signature.declaration.element, "visibility")?.trim() ?? "private",
    };
  }

  /**
   * The XPath context in which a pattern's predicates are evaluated.
   * @param {*} item - The node a step of the pattern tests
   * @param {object} xc - XSLT context (its item is the item matched)
   * @param {boolean} [local] - The pattern sees the local variables of xc
   * @returns {object}
   */
  patternContext(item, xc, local = false) {
    const dyn = Object.create(xc.tx.dyn);
    dyn.xc = xc;
    // no current output URI in patterns (XSLT 3.0 section 20.3.?)
    dyn.dynamicCall = true;
    useStaticContext(dyn, xc.tx.stylesheet.sc);
    const env = local ? xc.env : xc.tx.globalEnv;
    return { item, position: 1, size: 1, env, dyn };
  }

  /**
   * The parameters of a named output definition.
   * @param {string|null} name - Lexical QName, null for the unnamed one
   * @param {Element} element - Element on which the name is written
   * @param {object} [overrides] - Parameters that take precedence (those
   *   of an xsl:result-document)
   * @returns {object}
   */
  outputFor(name, element, overrides = {}) {
    let output = this.outputs.get("") ?? {};
    if (name !== null) {
      const qname = this.exprs.qname(name, element, { code: "XTDE1460" });
      output = this.outputs.get(`{${qname.uri}}${qname.local}`);
      if (!output) throw xsltError("XTDE1460", `No output definition ${name}`);
    }
    const params = { ...output, ...overrides };
    if (params["item-separator"] === "#absent") delete params["item-separator"];
    // The default html-version is implementation-defined (XSLT 3.0 section
    // 26.1): HTML 4.01, as in XSLT 1.0 and 2.0, for an XSLT 1.0 or 2.0
    // principal stylesheet module, else HTML5.
    if (
      (params.method === undefined || params.method === "html") &&
      params["html-version"] === undefined &&
      params.version === undefined &&
      infoOf(this.tree.root).version < 3
    ) {
      params["html-version"] = "4.01";
    }
    if (params["use-character-maps"]) {
      params["use-character-maps"] = expandCharacterMaps(
        params["use-character-maps"],
        this.characterMaps,
      );
    }
    return params;
  }
}
