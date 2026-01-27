/**
 * XPath 1.0 Parser
 * Based on W3C XPath 1.0 Specification: http://www.w3.org/TR/1999/REC-xpath-19991116
 *
 * Converts token stream into an Abstract Syntax Tree (AST).
 */

"use strict";

import { TokenType, tokenize } from "./tokenizer.js";

export const NodeType = {
  // Expression types
  OR_EXPR: "OrExpr",
  AND_EXPR: "AndExpr",
  EQUALITY_EXPR: "EqualityExpr",
  RELATIONAL_EXPR: "RelationalExpr",
  ADDITIVE_EXPR: "AdditiveExpr",
  MULTIPLICATIVE_EXPR: "MultiplicativeExpr",
  UNARY_EXPR: "UnaryExpr",
  UNION_EXPR: "UnionExpr",

  // Path expressions
  PATH_EXPR: "PathExpr",
  LOCATION_PATH: "LocationPath",
  STEP: "Step",
  PREDICATE: "Predicate",

  // Primaries
  VARIABLE_REF: "VariableRef",
  LITERAL: "Literal",
  NUMBER: "Number",
  FUNCTION_CALL: "FunctionCall",

  // Node tests
  NAME_TEST: "NameTest",
  NODE_TYPE_TEST: "NodeTypeTest",
  PI_TEST: "ProcessingInstructionTest",
};

export class ASTNode {
  constructor(type, props = {}) {
    this.type = type;
    Object.assign(this, props);
  }
}

export class XPathParser {
  constructor(tokens) {
    this.tokens = tokens;
    this.position = 0;
  }

  parse() {
    const expr = this.parseExpr();
    if (!this.isAtEnd()) {
      throw new Error(
        `Unexpected token ${this.peek().type} at position ${this.peek().position}`,
      );
    }
    return expr;
  }

  // Expr ::= OrExpr
  parseExpr() {
    return this.parseOrExpr();
  }

  // OrExpr ::= AndExpr | OrExpr 'or' AndExpr
  parseOrExpr() {
    let left = this.parseAndExpr();

    while (this.match(TokenType.OR)) {
      const right = this.parseAndExpr();
      left = new ASTNode(NodeType.OR_EXPR, { left, right });
    }

    return left;
  }

  // AndExpr ::= EqualityExpr | AndExpr 'and' EqualityExpr
  parseAndExpr() {
    let left = this.parseEqualityExpr();

    while (this.match(TokenType.AND)) {
      const right = this.parseEqualityExpr();
      left = new ASTNode(NodeType.AND_EXPR, { left, right });
    }

    return left;
  }

  // EqualityExpr ::= RelationalExpr | EqualityExpr '=' RelationalExpr | EqualityExpr '!=' RelationalExpr
  parseEqualityExpr() {
    let left = this.parseRelationalExpr();

    while (true) {
      if (this.match(TokenType.EQUALS)) {
        const right = this.parseRelationalExpr();
        left = new ASTNode(NodeType.EQUALITY_EXPR, {
          operator: "=",
          left,
          right,
        });
      } else if (this.match(TokenType.NOT_EQUALS)) {
        const right = this.parseRelationalExpr();
        left = new ASTNode(NodeType.EQUALITY_EXPR, {
          operator: "!=",
          left,
          right,
        });
      } else {
        break;
      }
    }

    return left;
  }

  // RelationalExpr ::= AdditiveExpr | RelationalExpr '<' AdditiveExpr | ...
  parseRelationalExpr() {
    let left = this.parseAdditiveExpr();

    while (true) {
      if (this.match(TokenType.LT)) {
        const right = this.parseAdditiveExpr();
        left = new ASTNode(NodeType.RELATIONAL_EXPR, {
          operator: "<",
          left,
          right,
        });
      } else if (this.match(TokenType.LTE)) {
        const right = this.parseAdditiveExpr();
        left = new ASTNode(NodeType.RELATIONAL_EXPR, {
          operator: "<=",
          left,
          right,
        });
      } else if (this.match(TokenType.GT)) {
        const right = this.parseAdditiveExpr();
        left = new ASTNode(NodeType.RELATIONAL_EXPR, {
          operator: ">",
          left,
          right,
        });
      } else if (this.match(TokenType.GTE)) {
        const right = this.parseAdditiveExpr();
        left = new ASTNode(NodeType.RELATIONAL_EXPR, {
          operator: ">=",
          left,
          right,
        });
      } else {
        break;
      }
    }

    return left;
  }

  // AdditiveExpr ::= MultiplicativeExpr | AdditiveExpr '+' MultiplicativeExpr | AdditiveExpr '-' MultiplicativeExpr
  parseAdditiveExpr() {
    let left = this.parseMultiplicativeExpr();

    while (true) {
      if (this.match(TokenType.PLUS)) {
        const right = this.parseMultiplicativeExpr();
        left = new ASTNode(NodeType.ADDITIVE_EXPR, {
          operator: "+",
          left,
          right,
        });
      } else if (this.match(TokenType.MINUS)) {
        const right = this.parseMultiplicativeExpr();
        left = new ASTNode(NodeType.ADDITIVE_EXPR, {
          operator: "-",
          left,
          right,
        });
      } else {
        break;
      }
    }

    return left;
  }

  // MultiplicativeExpr ::= UnaryExpr | MultiplicativeExpr '*' UnaryExpr | ...
  parseMultiplicativeExpr() {
    let left = this.parseUnaryExpr();

    while (true) {
      if (this.match(TokenType.STAR)) {
        const right = this.parseUnaryExpr();
        left = new ASTNode(NodeType.MULTIPLICATIVE_EXPR, {
          operator: "*",
          left,
          right,
        });
      } else if (this.match(TokenType.DIV)) {
        const right = this.parseUnaryExpr();
        left = new ASTNode(NodeType.MULTIPLICATIVE_EXPR, {
          operator: "div",
          left,
          right,
        });
      } else if (this.match(TokenType.MOD)) {
        const right = this.parseUnaryExpr();
        left = new ASTNode(NodeType.MULTIPLICATIVE_EXPR, {
          operator: "mod",
          left,
          right,
        });
      } else {
        break;
      }
    }

    return left;
  }

  // UnaryExpr ::= UnionExpr | '-' UnaryExpr
  parseUnaryExpr() {
    if (this.match(TokenType.MINUS)) {
      const operand = this.parseUnaryExpr();
      return new ASTNode(NodeType.UNARY_EXPR, { operator: "-", operand });
    }
    return this.parseUnionExpr();
  }

  // UnionExpr ::= PathExpr | UnionExpr '|' PathExpr
  parseUnionExpr() {
    let left = this.parsePathExpr();

    while (this.match(TokenType.PIPE)) {
      const right = this.parsePathExpr();
      left = new ASTNode(NodeType.UNION_EXPR, { left, right });
    }

    return left;
  }

  // PathExpr ::= LocationPath | FilterExpr | FilterExpr '/' RelativeLocationPath | FilterExpr '//' RelativeLocationPath
  parsePathExpr() {
    // Check for absolute location path
    if (this.check(TokenType.SLASH) || this.check(TokenType.DOUBLE_SLASH)) {
      return this.parseLocationPath();
    }

    // Check if this looks like a location path starting with step
    if (this.isStepStart()) {
      return this.parseLocationPath();
    }

    // Otherwise try to parse as filter expression
    const filter = this.parseFilterExpr();

    // Check for path continuation
    if (this.check(TokenType.SLASH) || this.check(TokenType.DOUBLE_SLASH)) {
      const steps = [];

      while (
        this.check(TokenType.SLASH) ||
        this.check(TokenType.DOUBLE_SLASH)
      ) {
        const isDescendant = this.match(TokenType.DOUBLE_SLASH);
        if (!isDescendant) this.advance(); // consume /

        if (isDescendant) {
          steps.push(
            new ASTNode(NodeType.STEP, {
              axis: "descendant-or-self",
              nodeTest: new ASTNode(NodeType.NODE_TYPE_TEST, {
                nodeType: "node",
              }),
              predicates: [],
            }),
          );
        }

        steps.push(this.parseStep());
      }

      return new ASTNode(NodeType.PATH_EXPR, { filter, steps });
    }

    return filter;
  }

  // LocationPath ::= RelativeLocationPath | AbsoluteLocationPath
  parseLocationPath() {
    let absolute = false;
    const steps = [];

    if (this.match(TokenType.DOUBLE_SLASH)) {
      absolute = true;
      // //foo is equivalent to /descendant-or-self::node()/foo
      steps.push(
        new ASTNode(NodeType.STEP, {
          axis: "descendant-or-self",
          nodeTest: new ASTNode(NodeType.NODE_TYPE_TEST, { nodeType: "node" }),
          predicates: [],
        }),
      );
      if (!this.isAtEnd() && !this.check(TokenType.EOF)) {
        steps.push(this.parseStep());
      }
    } else if (this.match(TokenType.SLASH)) {
      absolute = true;
      if (this.isStepStart()) {
        steps.push(this.parseStep());
      }
    } else {
      steps.push(this.parseStep());
    }

    while (this.check(TokenType.SLASH) || this.check(TokenType.DOUBLE_SLASH)) {
      const isDescendant = this.match(TokenType.DOUBLE_SLASH);
      if (!isDescendant) this.advance(); // consume /

      if (isDescendant) {
        steps.push(
          new ASTNode(NodeType.STEP, {
            axis: "descendant-or-self",
            nodeTest: new ASTNode(NodeType.NODE_TYPE_TEST, {
              nodeType: "node",
            }),
            predicates: [],
          }),
        );
      }

      steps.push(this.parseStep());
    }

    return new ASTNode(NodeType.LOCATION_PATH, { absolute, steps });
  }

  // Step ::= AxisSpecifier NodeTest Predicate* | AbbreviatedStep
  parseStep() {
    // Handle abbreviated steps
    if (this.match(TokenType.DOT)) {
      return new ASTNode(NodeType.STEP, {
        axis: "self",
        nodeTest: new ASTNode(NodeType.NODE_TYPE_TEST, { nodeType: "node" }),
        predicates: [],
      });
    }

    if (this.match(TokenType.DOUBLE_DOT)) {
      return new ASTNode(NodeType.STEP, {
        axis: "parent",
        nodeTest: new ASTNode(NodeType.NODE_TYPE_TEST, { nodeType: "node" }),
        predicates: [],
      });
    }

    // Parse axis
    let axis = "child"; // default axis

    if (this.match(TokenType.AT)) {
      axis = "attribute";
    } else if (this.check(TokenType.AXIS)) {
      axis = this.advance().value;
      this.expect(TokenType.DOUBLE_COLON);
    }

    // Parse node test
    const nodeTest = this.parseNodeTest();

    // Parse predicates
    const predicates = [];
    while (this.check(TokenType.LBRACKET)) {
      predicates.push(this.parsePredicate());
    }

    return new ASTNode(NodeType.STEP, { axis, nodeTest, predicates });
  }

  // NodeTest ::= NameTest | NodeType '(' ')' | 'processing-instruction' '(' Literal ')'
  parseNodeTest() {
    if (this.check(TokenType.NODE_TYPE)) {
      const nodeType = this.advance().value;
      this.expect(TokenType.LPAREN);

      if (
        nodeType === "processing-instruction" &&
        this.check(TokenType.LITERAL)
      ) {
        const name = this.advance().value;
        this.expect(TokenType.RPAREN);
        return new ASTNode(NodeType.PI_TEST, { name });
      }

      this.expect(TokenType.RPAREN);
      return new ASTNode(NodeType.NODE_TYPE_TEST, { nodeType });
    }

    // NameTest
    return this.parseNameTest();
  }

  // NameTest ::= '*' | NCName ':' '*' | QName
  parseNameTest() {
    if (this.match(TokenType.STAR)) {
      return new ASTNode(NodeType.NAME_TEST, { name: "*", prefix: null });
    }

    if (!this.check(TokenType.NAME)) {
      throw new Error(`Expected name at position ${this.peek().position}`);
    }

    const name = this.advance().value;

    // Check for prefix:*
    if (this.match(TokenType.COLON)) {
      if (this.match(TokenType.STAR)) {
        return new ASTNode(NodeType.NAME_TEST, { name: "*", prefix: name });
      }

      if (this.check(TokenType.NAME)) {
        const localName = this.advance().value;
        return new ASTNode(NodeType.NAME_TEST, {
          name: localName,
          prefix: name,
        });
      }

      throw new Error(
        `Expected name or * after : at position ${this.peek().position}`,
      );
    }

    return new ASTNode(NodeType.NAME_TEST, { name, prefix: null });
  }

  // Predicate ::= '[' Expr ']'
  parsePredicate() {
    this.expect(TokenType.LBRACKET);
    const expr = this.parseExpr();
    this.expect(TokenType.RBRACKET);
    return new ASTNode(NodeType.PREDICATE, { expr });
  }

  // FilterExpr ::= PrimaryExpr | FilterExpr Predicate
  parseFilterExpr() {
    let primary = this.parsePrimaryExpr();

    while (this.check(TokenType.LBRACKET)) {
      const predicate = this.parsePredicate();
      primary = new ASTNode(NodeType.PATH_EXPR, {
        filter: primary,
        predicates: [predicate],
      });
    }

    return primary;
  }

  // PrimaryExpr ::= VariableReference | '(' Expr ')' | Literal | Number | FunctionCall
  parsePrimaryExpr() {
    // Variable reference
    if (this.match(TokenType.DOLLAR)) {
      if (!this.check(TokenType.NAME)) {
        throw new Error(
          `Expected variable name at position ${this.peek().position}`,
        );
      }
      const name = this.advance().value;
      let prefix = null;

      if (this.match(TokenType.COLON)) {
        prefix = name;
        if (!this.check(TokenType.NAME)) {
          throw new Error(
            `Expected local name at position ${this.peek().position}`,
          );
        }
        const localName = this.advance().value;
        return new ASTNode(NodeType.VARIABLE_REF, { name: localName, prefix });
      }

      return new ASTNode(NodeType.VARIABLE_REF, { name, prefix });
    }

    // Parenthesized expression
    if (this.match(TokenType.LPAREN)) {
      const expr = this.parseExpr();
      this.expect(TokenType.RPAREN);
      return expr;
    }

    // Literal
    if (this.check(TokenType.LITERAL)) {
      return new ASTNode(NodeType.LITERAL, { value: this.advance().value });
    }

    // Number
    if (this.check(TokenType.NUMBER)) {
      return new ASTNode(NodeType.NUMBER, { value: this.advance().value });
    }

    // Function call
    if (this.check(TokenType.FUNCTION)) {
      return this.parseFunctionCall();
    }

    throw new Error(
      `Unexpected token ${this.peek().type} at position ${this.peek().position}`,
    );
  }

  // FunctionCall ::= FunctionName '(' ( Argument ( ',' Argument )* )? ')'
  // Note: Prefixed function calls (prefix:fn()) are not supported because
  // the tokenizer identifies functions by NAME followed by '(' - prefixed
  // names like 'fn:name()' are tokenized as NAME:NAME() which is parsed
  // as a location path, not a function call.
  parseFunctionCall() {
    const name = this.advance().value;
    return this.parseFunctionCallArgs(name, null);
  }

  parseFunctionCallArgs(name, prefix) {
    this.expect(TokenType.LPAREN);

    const args = [];
    if (!this.check(TokenType.RPAREN)) {
      args.push(this.parseExpr());
      while (this.match(TokenType.COMMA)) {
        args.push(this.parseExpr());
      }
    }

    this.expect(TokenType.RPAREN);

    return new ASTNode(NodeType.FUNCTION_CALL, { name, prefix, args });
  }

  // Helper methods
  isStepStart() {
    const type = this.peek().type;
    return (
      type === TokenType.NAME ||
      type === TokenType.STAR ||
      type === TokenType.AT ||
      type === TokenType.DOT ||
      type === TokenType.DOUBLE_DOT ||
      type === TokenType.AXIS ||
      type === TokenType.NODE_TYPE
    );
  }

  peek() {
    return this.tokens[this.position];
  }

  advance() {
    if (!this.isAtEnd()) {
      return this.tokens[this.position++];
    }
    return this.tokens[this.position];
  }

  check(type) {
    if (this.isAtEnd()) return false;
    return this.peek().type === type;
  }

  match(type) {
    if (this.check(type)) {
      this.advance();
      return true;
    }
    return false;
  }

  expect(type) {
    if (!this.check(type)) {
      throw new Error(
        `Expected ${type} but got ${this.peek().type} at position ${this.peek().position}`,
      );
    }
    return this.advance();
  }

  isAtEnd() {
    return this.peek().type === TokenType.EOF;
  }
}

export function parse(expression) {
  const tokens = tokenize(expression);
  const parser = new XPathParser(tokens);
  return parser.parse();
}
