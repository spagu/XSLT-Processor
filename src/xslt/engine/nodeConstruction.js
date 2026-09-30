/**
 * Creation of result elements and attributes: literal result elements,
 * xsl:element, xsl:attribute and attribute sets.
 *
 * Methods installed on XsltEngine.prototype (`this` is the engine).
 */

import { XSLT_NAMESPACE } from "../elements.js";
import { getXsltAttribute, shouldCopyAttribute } from "../literalResult.js";
import {
  copyLiteralNamespaces,
  setResultAttribute,
} from "../resultNamespaces.js";
import {
  computedAttributeName,
  computedElementName,
} from "../computedNames.js";
import { applyAttributeSets } from "../attributeSets.js";
import { requireExpandedNames } from "../declarationNames.js";

export const nodeConstructionMethods = {
  /**
   * Copy one attribute of a literal result element to the result, evaluating
   * it as an attribute value template and applying xsl:namespace-alias.
   *
   * @param {Attr} attr - Attribute of the literal result element
   * @param {XsltContext} context - The current XSLT context
   * @param {Element} outputElement - The result element
   * @returns {void}
   */
  copyLiteralAttribute(attr, context, outputElement) {
    const value = this.processAttributeValueTemplate(attr.value, context);
    const alias = this.namespaceAliases.resolveLiteral(attr);

    if (alias) {
      outputElement.setAttributeNS(alias.namespaceUri, alias.qname, value);
    } else if (attr.namespaceURI) {
      outputElement.setAttributeNS(attr.namespaceURI, attr.name, value);
    } else {
      outputElement.setAttribute(attr.name, value);
    }
  },

  /**
   * Process a literal result element (non-XSLT)
   *
   * Applies `xsl:namespace-alias` to the element and its attributes, honours
   * `xsl:use-attribute-sets` and keeps XSLT-only attributes and namespace
   * declarations out of the result tree.
   *
   * @param {Element} node - The literal result element in the stylesheet
   * @param {XsltContext} context - The current XSLT context
   * @param {Node} output - The result tree node receiving the element
   * @returns {void}
   */
  processLiteralResultElement(node, context, output) {
    const alias = this.namespaceAliases.resolveLiteral(node);
    const namespaceUri = alias ? alias.namespaceUri : node.namespaceURI;
    const qname = alias ? alias.qname : node.nodeName;

    const outputElement =
      namespaceUri && context.outputDocument.createElementNS
        ? context.outputDocument.createElementNS(namespaceUri, qname)
        : context.outputDocument.createElement(qname);
    // Attached first, so namespace lookups see the result ancestors
    output.appendChild(outputElement);
    copyLiteralNamespaces(outputElement, node, output, (uri) =>
      this.namespaceAliases.isAliased(uri),
    );

    // Attribute sets come first so literal attributes take precedence
    const useAttributeSets = getXsltAttribute(
      node,
      "use-attribute-sets",
      XSLT_NAMESPACE,
    );
    if (useAttributeSets) {
      this.applyAttributeSets(useAttributeSets, context, outputElement, node);
    }

    for (const attr of node.attributes) {
      if (shouldCopyAttribute(attr, XSLT_NAMESPACE)) {
        this.copyLiteralAttribute(attr, context, outputElement);
      }
    }

    this.scheduleChildren(node, context, outputElement);
  },

  /**
   * Instantiate `xsl:element`. The name's prefix, or the default namespace
   * for an unprefixed name, resolves against the namespaces in scope on the
   * instruction; a `namespace` attribute wins (XSLT 1.0 section 7.1.2).
   * An invalid name or an undeclared prefix is reported and, as in libxslt,
   * neither the element nor its content is created.
   *
   * @param {Element} node - The xsl:element instruction
   * @param {XsltContext} context - The current context
   * @param {Node} output - The result node receiving the element
   * @returns {void}
   */
  xslElement(node, context, output) {
    const { name, error } = computedElementName(
      this.processAttributeValueTemplate(node.getAttribute("name"), context),
      this.optionalAvt(node, "namespace", context),
      context.namespaces,
    );
    if (error) {
      this.warnOnce(error);
      return;
    }
    const { namespaceUri, qname } = name;
    const element = namespaceUri
      ? context.outputDocument.createElementNS(namespaceUri, qname)
      : context.outputDocument.createElement(qname);
    output.appendChild(element);

    const useAttributeSets = node.getAttribute("use-attribute-sets");
    if (useAttributeSets) {
      this.applyAttributeSets(useAttributeSets, context, element, node);
    }

    this.scheduleChildren(node, context, element);
  },

  /**
   * Instantiate `xsl:attribute` (XSLT 1.0 section 7.1.3): a prefixed name
   * uses the namespace bound in scope, `namespace` wins, and a namespaced
   * attribute without a usable prefix gets a generated one. An invalid name,
   * an undeclared prefix or `xmlns` is reported and the attribute skipped.
   *
   * @param {Element} node - The xsl:attribute instruction
   * @param {XsltContext} context - The current context
   * @param {Node} output - The result element receiving the attribute
   * @returns {void}
   */
  xslAttribute(node, context, output) {
    if (!this.canAddAttribute(output)) return;

    const { name, error } = computedAttributeName(
      this.processAttributeValueTemplate(node.getAttribute("name"), context),
      this.optionalAvt(node, "namespace", context),
      context.namespaces,
    );
    if (error) {
      this.warnOnce(error);
      return;
    }
    setResultAttribute(output, name, this.instantiateText(node, context));
  },

  /**
   * Whether an attribute may still be added to a result node: it must be an
   * element without children. Attributes added after children are ignored
   * (as libxslt does), with a single warning per engine.
   *
   * @param {Node} target - The result node
   * @returns {boolean} True when the attribute can be added
   */
  canAddAttribute(target) {
    if (target.nodeType !== 1) return false;
    if (!target.firstChild) return true;
    this.warnOnce(
      "an attribute created after the children of an element is ignored (XSLT 1.0 section 7.1.3)",
    );
    return false;
  },

  /**
   * Apply the attribute sets named by a `use-attribute-sets` attribute (see
   * attributeSets.js). The xsl:attribute children of each declaration are
   * instantiated with the prefixes in scope there.
   *
   * @param {string} names - Whitespace separated QNames
   * @param {XsltContext} context - Context of the instruction
   * @param {Element} element - The result element receiving the attributes
   * @param {Element} instruction - The element carrying the attribute, whose
   *   namespace declarations expand the names
   * @returns {void}
   */
  applyAttributeSets(names, context, element, instruction) {
    const keys = requireExpandedNames(names, instruction, "use-attribute-sets");
    applyAttributeSets(this.attributeSets, keys, (declaration) =>
      this.processChildren(declaration, context, element),
    );
  },
};
