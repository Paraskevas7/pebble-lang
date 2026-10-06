const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { tokenize, parse, run } = require('../src');

const out = (src, opts) => { const r = run(src, opts); assert.strictEqual(r.error, null, r.error && r.error.format()); return r.output; };
const err = (src, opts) => { const r = run(src, opts); assert.ok(r.error, 'expected an error'); return r.error; };

test('lexer: tokens, positions, comments', () => {
  const t = tokenize('let x = 12.5 # note\nprint("a\\n")');
  assert.deepStrictEqual(t.map((x) => x.type), ['kw', 'id', 'op', 'num', 'nl', 'id', 'op', 'str', 'op', 'eof']);
  assert.strictEqual(t[3].value, 12.5);
  assert.strictEqual(t[7].value, 'a\n');
  assert.deepStrictEqual([t[5].line, t[5].col], [2, 1]);
});

test('lexer: newlines inside brackets are ignored', () => {
  const t = tokenize('f(1,\n 2)');
  assert.ok(!t.some((x) => x.type === 'nl'));
});

test('lexer errors', () => {
  assert.throws(() => tokenize('"open'), /unterminated string/);
  assert.throws(() => tokenize('let x = @'), /unexpected character/);
});

test('arithmetic precedence and associativity', () => {
  assert.strictEqual(out('print(1 + 2 * 3)'), '7\n');
  assert.strictEqual(out('print((1 + 2) * 3)'), '9\n');
  assert.strictEqual(out('print(10 - 4 - 3)'), '3\n');
  assert.strictEqual(out('print(2 * 3 % 4)'), '2\n');
  assert.strictEqual(out('print(-2 + 5)'), '3\n');
  assert.strictEqual(out('print(7 / 2)'), '3.5\n');
});

test('comparison, logic and short-circuit', () => {
  assert.strictEqual(out('print(1 < 2 and 2 < 3, not false, 1 == 1, "a" != "b")'), 'true true true true\n');
  assert.strictEqual(out('fn boom() { print("bad"); return true }\nprint(false and boom())'), 'false\n');
  assert.strictEqual(out('print(null or "default")'), 'default\n');
});

test('strings and lists', () => {
  assert.strictEqual(out('print("n=" + 3)'), 'n=3\n');
  assert.strictEqual(out('print([1, 2] + [3], len("abc"), "abc"[1])'), '[1, 2, 3] 3 b\n');
  assert.strictEqual(out('let a = [1, 2]\na[0] = 9\nprint(a)'), '[9, 2]\n');
  assert.strictEqual(out('print([1, "x", [null]])'), '[1, "x", [null]]\n');
});

test('variables and scope', () => {
  assert.strictEqual(out('let x = 1\n{ let x = 2; print(x) }\nprint(x)'), '2\n1\n');
  assert.strictEqual(out('let x = 1\n{ x = 5 }\nprint(x)'), '5\n');
  assert.match(err('let x = 1\nlet x = 2').message, /already defined/);
  assert.match(err('x = 1').message, /undefined variable/);
});

test('control flow', () => {
  assert.strictEqual(out('let i = 0\nwhile i < 3 { i = i + 1 }\nprint(i)'), '3\n');
  assert.strictEqual(out('for i in range(10) { if i == 3 { break } print(i) }'), '0\n1\n2\n');
  assert.strictEqual(out('for i in range(4) { if i % 2 == 0 { continue } print(i) }'), '1\n3\n');
  assert.strictEqual(out('if false { print(1) }\nelse if false { print(2) }\nelse { print(3) }'), '3\n');
  assert.strictEqual(out('for c in "ab" { print(c) }'), 'a\nb\n');
});

test('functions, recursion and closures', () => {
  assert.strictEqual(out('fn fact(n) { if n <= 1 { return 1 } return n * fact(n - 1) }\nprint(fact(10))'), '3628800\n');
  assert.strictEqual(out('fn adder(a) { return fn(b) { return a + b } }\nprint(adder(2)(3))'), '5\n');
  assert.strictEqual(out('fn f() { }\nprint(f())'), 'null\n');
  const counter = 'fn mk() { let c = 0; return fn() { c = c + 1; return c } }\nlet a = mk()\nlet b = mk()\nprint(a(), a(), b())';
  assert.strictEqual(out(counter), '1 2 1\n');
});

test('builtins', () => {
  assert.strictEqual(out('print(sort([3, 1, 2]), reverse([1, 2]), join(["a", "b"], "-"))'), '[1, 2, 3] [2, 1] a-b\n');
  assert.strictEqual(out('print(upper("ab"), split("a,b", ","), num("4") + 1, str(2) + "x")'), 'AB ["a", "b"] 5 2x\n');
  assert.strictEqual(out('print(min(3, 1, 2), max(3, 1, 2), abs(-4), floor(2.7), sqrt(9), type([]))'), '1 3 4 2 3 list\n');
  assert.strictEqual(out('let l = [1]\npush(l, 2)\nprint(pop(l), l)'), '2 [1]\n');
});

test('runtime errors carry line and column', () => {
  const e = err('let a = 1\nprint(a / 0)');
  assert.strictEqual(e.kind, 'RuntimeError');
  assert.strictEqual(e.line, 2);
  assert.match(e.message, /division by zero/);
  assert.match(err('print([1][5])').message, /out of range/);
  assert.match(err('print(1 + null)').message, /cannot add/);
  assert.match(err('print(1 < "a")').message, /cannot compare/);
  assert.match(err('let f = 3\nf()').message, /not a function/);
  assert.match(err('fn f(a) { }\nf()').message, /expects 1 argument/);
  assert.match(err('print(nope)').message, /undefined variable 'nope'/);
});

test('syntax errors carry line and column', () => {
  let e = err('let x = \nprint(1)');
  assert.strictEqual(e.kind, 'SyntaxError');
  assert.strictEqual(e.line, 1);
  assert.match(err('if true { print(1)').message, /missing '}'/);
  assert.match(err('let a = 1 let b = 2').message, /end of line/);
  assert.match(err('1 = 2').message, /only assign/);
  assert.match(err('fn f(a, a) { }').message, /duplicate parameter/);
});

test('output before an error is kept', () => {
  const r = run('print("one")\nprint(1 / 0)');
  assert.strictEqual(r.output, 'one\n');
  assert.ok(r.error);
});

test('safety limits stop runaway programs', () => {
  assert.match(err('while true { }', { maxSteps: 10000 }).message, /ran too long/);
  assert.match(err('fn f() { return f() }\nf()').message, /too many nested calls/);
  assert.match(err('print(range(5000000))').message, /too large/);
});

test('parse returns a tree', () => {
  const ast = parse('let x = 1 + 2');
  assert.strictEqual(ast.body[0].type, 'Let');
  assert.strictEqual(ast.body[0].init.type, 'Binary');
});

const dir = path.join(__dirname, '..', 'examples');
fs.readdirSync(dir).filter((f) => f.endsWith('.pb')).forEach((f) => {
  test(`example ${f} gives the expected output`, () => {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    const expected = fs.readFileSync(path.join(dir, f.replace('.pb', '.expected')), 'utf8');
    assert.strictEqual(out(src), expected);
  });
});
