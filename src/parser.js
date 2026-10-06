'use strict';
const { PebbleError } = require('./errors');
const { tokenize } = require('./lexer');

/**
 * Recursive-descent parser. Grammar (lowest to highest precedence):
 *
 *   program    -> statement*
 *   statement  -> let | fn-decl | return | if | while | for | break | continue | block | expr-stmt
 *   expression -> assignment
 *   assignment -> (name | index) "=" assignment | or
 *   or         -> and ("or" and)*
 *   and        -> equality ("and" equality)*
 *   equality   -> comparison (("==" | "!=") comparison)*
 *   comparison -> term (("<" | "<=" | ">" | ">=") term)*
 *   term       -> factor (("+" | "-") factor)*
 *   factor     -> unary (("*" | "/" | "%") unary)*
 *   unary      -> ("-" | "not") unary | postfix
 *   postfix    -> primary ( "(" args ")" | "[" expression "]" )*
 *   primary    -> number | string | true | false | null | name | "[" items "]" | "(" expression ")" | fn-expr
 */
function parse(source) {
  const tokens = tokenize(source);
  let p = 0;

  const peek = () => tokens[p];
  const at = (type, value) => tokens[p].type === type && (value === undefined || tokens[p].value === value);
  const isOp = (v) => at('op', v);
  const isKw = (v) => at('kw', v);
  const advance = () => tokens[p++];
  const fail = (msg, tok = peek()) => { throw new PebbleError(msg, tok.line, tok.col, 'SyntaxError'); };
  const describe = (t) => (t.type === 'eof' ? 'end of program' : t.type === 'nl' ? 'end of line' : `'${t.value}'`);
  const expectOp = (v, what) => {
    if (!isOp(v)) fail(`expected ${what || `'${v}'`} but found ${describe(peek())}`);
    return advance();
  };
  const expectName = (what) => {
    if (!at('id')) fail(`expected ${what} but found ${describe(peek())}`);
    return advance().value;
  };
  const skipLines = () => { while (at('nl') || isOp(';')) advance(); };
  const node = (type, tok, props) => ({ type, line: tok.line, col: tok.col, ...props });

  function endOfStatement() {
    if (at('nl') || isOp(';')) { advance(); return; }
    if (isOp('}') || at('eof')) return;
    fail(`expected end of line but found ${describe(peek())}`);
  }

  function block() {
    const open = expectOp('{');
    const body = [];
    skipLines();
    while (!isOp('}')) {
      if (at('eof')) fail("missing '}' to close the block that starts here", open);
      body.push(statement());
      skipLines();
    }
    advance();
    return node('Block', open, { body });
  }

  function params() {
    expectOp('(');
    const names = [];
    if (!isOp(')')) {
      do {
        const n = expectName('a parameter name');
        if (names.includes(n)) fail(`duplicate parameter '${n}'`, tokens[p - 1]);
        names.push(n);
      } while (isOp(',') && advance());
    }
    expectOp(')');
    return names;
  }

  function statement() {
    const t = peek();
    if (isKw('let')) {
      advance();
      const name = expectName('a variable name');
      expectOp('=', "'=' after the variable name");
      const init = expression();
      endOfStatement();
      return node('Let', t, { name, init });
    }
    if (isKw('fn') && tokens[p + 1].type === 'id') {
      advance();
      const name = advance().value;
      const ps = params();
      return node('FnDecl', t, { name, params: ps, body: block() });
    }
    if (isKw('return')) {
      advance();
      const value = at('nl') || isOp(';') || isOp('}') || at('eof') ? null : expression();
      endOfStatement();
      return node('Return', t, { value });
    }
    if (isKw('if')) return ifStatement();
    if (isKw('while')) {
      advance();
      const cond = expression();
      return node('While', t, { cond, body: block() });
    }
    if (isKw('for')) {
      advance();
      const name = expectName('a loop variable name');
      if (!isKw('in')) fail(`expected 'in' but found ${describe(peek())}`);
      advance();
      const iter = expression();
      return node('For', t, { name, iter, body: block() });
    }
    if (isKw('break') || isKw('continue')) {
      advance();
      endOfStatement();
      return node(t.value === 'break' ? 'Break' : 'Continue', t, {});
    }
    if (isOp('{')) return block();
    const expr = expression();
    endOfStatement();
    return node('ExprStmt', t, { expr });
  }

  function ifStatement() {
    const t = advance(); // 'if'
    const cond = expression();
    const then = block();
    let save = p;
    skipLines();
    let otherwise = null;
    if (isKw('else')) {
      advance();
      otherwise = isKw('if') ? ifStatement() : block();
    } else p = save;
    return node('If', t, { cond, then, otherwise });
  }

  function expression() { return assignment(); }

  function assignment() {
    const left = orExpr();
    if (isOp('=')) {
      const eq = advance();
      if (left.type !== 'Var' && left.type !== 'Index') fail('you can only assign to a variable or a list item', eq);
      return node('Assign', eq, { target: left, value: assignment() });
    }
    return left;
  }

  function binaryLevel(next, ops, kind = 'Binary') {
    return () => {
      let left = next();
      while ((at('op') && ops.includes(peek().value)) || (at('kw') && ops.includes(peek().value))) {
        const op = advance();
        while (at('nl')) advance(); // a line may end with an operator
        left = node(kind, op, { op: op.value, left, right: next() });
      }
      return left;
    };
  }

  const unary = () => {
    if (isOp('-') || isKw('not')) {
      const op = advance();
      return node('Unary', op, { op: op.value, arg: unary() });
    }
    return postfix();
  };
  const factor = binaryLevel(unary, ['*', '/', '%']);
  const term = binaryLevel(factor, ['+', '-']);
  const comparison = binaryLevel(term, ['<', '<=', '>', '>=']);
  const equality = binaryLevel(comparison, ['==', '!=']);
  const andExpr = binaryLevel(equality, ['and'], 'Logical');
  const orExpr = binaryLevel(andExpr, ['or'], 'Logical');

  function postfix() {
    let e = primary();
    for (;;) {
      if (isOp('(')) {
        const open = advance();
        const args = [];
        if (!isOp(')')) { do { args.push(expression()); } while (isOp(',') && advance()); }
        expectOp(')', "')' to close the call");
        e = node('Call', open, { callee: e, args });
      } else if (isOp('[')) {
        const open = advance();
        const index = expression();
        expectOp(']', "']' to close the index");
        e = node('Index', open, { obj: e, index });
      } else return e;
    }
  }

  function primary() {
    const t = peek();
    if (t.type === 'num') { advance(); return node('Num', t, { value: t.value }); }
    if (t.type === 'str') { advance(); return node('Str', t, { value: t.value }); }
    if (isKw('true') || isKw('false')) { advance(); return node('Bool', t, { value: t.value === 'true' }); }
    if (isKw('null')) { advance(); return node('Null', t, {}); }
    if (t.type === 'id') { advance(); return node('Var', t, { name: t.value }); }
    if (isOp('(')) {
      advance();
      const e = expression();
      expectOp(')', "')' to close the parentheses");
      return e;
    }
    if (isOp('[')) {
      advance();
      const items = [];
      if (!isOp(']')) { do { items.push(expression()); } while (isOp(',') && advance()); }
      expectOp(']', "']' to close the list");
      return node('List', t, { items });
    }
    if (isKw('fn')) {
      advance();
      const ps = params();
      return node('FnExpr', t, { name: null, params: ps, body: block() });
    }
    fail(`expected a value but found ${describe(t)}`);
  }

  const body = [];
  skipLines();
  while (!at('eof')) { body.push(statement()); skipLines(); }
  return { type: 'Program', body };
}

module.exports = { parse };
