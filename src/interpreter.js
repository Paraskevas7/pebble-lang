'use strict';
const { PebbleError } = require('./errors');
const { parse } = require('./parser');

class BreakSignal {}
class ContinueSignal {}
class ReturnSignal { constructor(value) { this.value = value; } }

class PFunction {
  constructor(name, params, body, closure) { this.name = name; this.params = params; this.body = body; this.closure = closure; }
}
class Builtin {
  constructor(name, arity, fn) { this.name = name; this.arity = arity; this.fn = fn; } // arity: number or [min, max]
}

class Env {
  constructor(parent = null) { this.vars = new Map(); this.parent = parent; }
  find(name) { for (let e = this; e; e = e.parent) if (e.vars.has(name)) return e; return null; }
}

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'list';
  if (v instanceof PFunction || v instanceof Builtin) return 'function';
  return typeof v; // number, string, boolean
}

function show(v, nested = false) {
  if (v === null) return 'null';
  if (typeof v === 'string') return nested ? JSON.stringify(v) : v;
  if (Array.isArray(v)) return '[' + v.map((x) => show(x, true)).join(', ') + ']';
  if (v instanceof PFunction) return `<fn ${v.name || 'anonymous'}>`;
  if (v instanceof Builtin) return `<builtin ${v.name}>`;
  return String(v);
}

function equal(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => equal(x, b[i]));
  return a === b;
}

const truthy = (v) => v !== false && v !== null;

/**
 * Walks the syntax tree and runs it.
 * options: out(text) receives printed output; maxSteps stops runaway loops; maxDepth limits recursion.
 */
class Interpreter {
  constructor({ out = () => {}, maxSteps = 2000000, maxDepth = 200 } = {}) {
    this.out = out; this.maxSteps = maxSteps; this.maxDepth = maxDepth;
    this.steps = 0; this.depth = 0;
    this.globals = new Env();
    this.installBuiltins();
  }

  err(msg, node) { return new PebbleError(msg, node.line, node.col, 'RuntimeError'); }

  tick(node) {
    if (++this.steps > this.maxSteps) throw this.err('the program ran too long (step limit reached)', node);
  }

  installBuiltins() {
    const def = (name, arity, fn) => this.globals.vars.set(name, new Builtin(name, arity, fn));
    const needNum = (v, who, node) => { if (typeof v !== 'number') throw this.err(`${who} needs a number but got ${typeOf(v)}`, node); return v; };
    const needList = (v, who, node) => { if (!Array.isArray(v)) throw this.err(`${who} needs a list but got ${typeOf(v)}`, node); return v; };
    const needStr = (v, who, node) => { if (typeof v !== 'string') throw this.err(`${who} needs a string but got ${typeOf(v)}`, node); return v; };

    def('print', [0, Infinity], (a) => { this.out(a.map((x) => show(x)).join(' ') + '\n'); return null; });
    def('len', 1, ([x], n) => {
      if (typeof x === 'string' || Array.isArray(x)) return x.length;
      throw this.err(`len needs a string or list but got ${typeOf(x)}`, n);
    });
    def('type', 1, ([x]) => typeOf(x));
    def('str', 1, ([x]) => show(x));
    def('num', 1, ([x], n) => {
      if (typeof x === 'number') return x;
      const v = typeof x === 'string' && x.trim() !== '' ? Number(x) : NaN;
      if (Number.isNaN(v)) throw this.err(`cannot turn ${show(x, true)} into a number`, n);
      return v;
    });
    def('range', [1, 2], (a, n) => {
      const lo = a.length === 2 ? needNum(a[0], 'range', n) : 0;
      const hi = needNum(a[a.length - 1], 'range', n);
      if (hi - lo > 1000000) throw this.err('range is too large (max 1,000,000 items)', n);
      const out = [];
      for (let i = lo; i < hi; i++) out.push(i);
      return out;
    });
    def('push', 2, ([l, x], n) => { needList(l, 'push', n).push(x); return l; });
    def('pop', 1, ([l], n) => {
      if (!needList(l, 'pop', n).length) throw this.err('cannot pop from an empty list', n);
      return l.pop();
    });
    def('sort', 1, ([l], n) => {
      needList(l, 'sort', n);
      if (l.every((x) => typeof x === 'number')) return [...l].sort((a, b) => a - b);
      if (l.every((x) => typeof x === 'string')) return [...l].sort();
      throw this.err('sort needs a list of only numbers or only strings', n);
    });
    def('reverse', 1, ([l], n) => [...needList(l, 'reverse', n)].reverse());
    def('join', 2, ([l, sep], n) => needList(l, 'join', n).map((x) => show(x)).join(needStr(sep, 'join', n)));
    def('split', 2, ([s, sep], n) => needStr(s, 'split', n).split(needStr(sep, 'split', n)));
    def('upper', 1, ([s], n) => needStr(s, 'upper', n).toUpperCase());
    def('lower', 1, ([s], n) => needStr(s, 'lower', n).toLowerCase());
    def('abs', 1, ([x], n) => Math.abs(needNum(x, 'abs', n)));
    def('floor', 1, ([x], n) => Math.floor(needNum(x, 'floor', n)));
    def('sqrt', 1, ([x], n) => {
      if (needNum(x, 'sqrt', n) < 0) throw this.err('sqrt of a negative number', n);
      return Math.sqrt(x);
    });
    def('min', [1, Infinity], (a, n) => Math.min(...a.map((x) => needNum(x, 'min', n))));
    def('max', [1, Infinity], (a, n) => Math.max(...a.map((x) => needNum(x, 'max', n))));
  }

  run(source) {
    const ast = parse(source);
    this.execBlock(ast.body, this.globals);
  }

  // ---------------------------------------------------------------- statements
  execBlock(stmts, env) { for (const s of stmts) this.exec(s, env); }

  define(env, name, value, node) {
    if (env.vars.has(name)) throw this.err(`'${name}' is already defined in this scope`, node);
    env.vars.set(name, value);
  }

  exec(n, env) {
    this.tick(n);
    switch (n.type) {
      case 'Let': this.define(env, n.name, this.eval(n.init, env), n); return;
      case 'FnDecl': this.define(env, n.name, new PFunction(n.name, n.params, n.body, env), n); return;
      case 'ExprStmt': this.eval(n.expr, env); return;
      case 'Block': this.execBlock(n.body, new Env(env)); return;
      case 'If':
        if (truthy(this.eval(n.cond, env))) this.exec(n.then, env);
        else if (n.otherwise) this.exec(n.otherwise, env);
        return;
      case 'While':
        while (truthy(this.eval(n.cond, env))) {
          this.tick(n);
          try { this.exec(n.body, env); } catch (s) {
            if (s instanceof BreakSignal) break;
            if (s instanceof ContinueSignal) continue;
            throw s;
          }
        }
        return;
      case 'For': {
        const it = this.eval(n.iter, env);
        if (typeof it !== 'string' && !Array.isArray(it)) throw this.err(`can only loop over a list or string, not ${typeOf(it)}`, n.iter);
        for (const item of Array.from(it)) {
          this.tick(n);
          const inner = new Env(env);
          inner.vars.set(n.name, item);
          try { this.exec(n.body, inner); } catch (s) {
            if (s instanceof BreakSignal) break;
            if (s instanceof ContinueSignal) continue;
            throw s;
          }
        }
        return;
      }
      case 'Break': throw new BreakSignal();
      case 'Continue': throw new ContinueSignal();
      case 'Return': throw new ReturnSignal(n.value ? this.eval(n.value, env) : null);
      default: throw this.err(`unknown statement ${n.type}`, n);
    }
  }

  // --------------------------------------------------------------- expressions
  eval(n, env) {
    this.tick(n);
    switch (n.type) {
      case 'Num': case 'Str': case 'Bool': return n.value;
      case 'Null': return null;
      case 'List': return n.items.map((e) => this.eval(e, env));
      case 'Var': {
        const e = env.find(n.name);
        if (!e) throw this.err(`undefined variable '${n.name}'`, n);
        return e.vars.get(n.name);
      }
      case 'FnExpr': return new PFunction(null, n.params, n.body, env);
      case 'Unary': {
        const v = this.eval(n.arg, env);
        if (n.op === 'not') return !truthy(v);
        if (typeof v !== 'number') throw this.err(`cannot negate ${typeOf(v)}`, n);
        return -v;
      }
      case 'Logical': {
        const l = this.eval(n.left, env);
        if (n.op === 'and') return truthy(l) ? this.eval(n.right, env) : l;
        return truthy(l) ? l : this.eval(n.right, env);
      }
      case 'Binary': return this.binary(n, this.eval(n.left, env), this.eval(n.right, env));
      case 'Assign': return this.assign(n, env);
      case 'Index': return this.getIndex(n, this.eval(n.obj, env), this.eval(n.index, env));
      case 'Call': return this.call(n, env);
      default: throw this.err(`unknown expression ${n.type}`, n);
    }
  }

  binary(n, a, b) {
    const op = n.op;
    if (op === '==') return equal(a, b);
    if (op === '!=') return !equal(a, b);
    if (op === '+') {
      if (typeof a === 'number' && typeof b === 'number') return a + b;
      if (Array.isArray(a) && Array.isArray(b)) return a.concat(b);
      if (typeof a === 'string' || typeof b === 'string') return show(a) + show(b);
      throw this.err(`cannot add ${typeOf(a)} and ${typeOf(b)}`, n);
    }
    if (op === '<' || op === '<=' || op === '>' || op === '>=') {
      const ok = (typeof a === 'number' && typeof b === 'number') || (typeof a === 'string' && typeof b === 'string');
      if (!ok) throw this.err(`cannot compare ${typeOf(a)} with ${typeOf(b)}`, n);
      return op === '<' ? a < b : op === '<=' ? a <= b : op === '>' ? a > b : a >= b;
    }
    if (typeof a !== 'number' || typeof b !== 'number') throw this.err(`'${op}' needs two numbers but got ${typeOf(a)} and ${typeOf(b)}`, n);
    if (op === '-') return a - b;
    if (op === '*') return a * b;
    if ((op === '/' || op === '%') && b === 0) throw this.err('division by zero', n);
    return op === '/' ? a / b : a % b;
  }

  checkIndex(n, obj, idx) {
    if (!Array.isArray(obj) && typeof obj !== 'string') throw this.err(`cannot index into ${typeOf(obj)}`, n);
    if (typeof idx !== 'number' || !Number.isInteger(idx)) throw this.err('an index must be a whole number', n);
    if (idx < 0 || idx >= obj.length) throw this.err(`index ${idx} is out of range (length ${obj.length})`, n);
  }

  getIndex(n, obj, idx) { this.checkIndex(n, obj, idx); return obj[idx]; }

  assign(n, env) {
    const t = n.target;
    if (t.type === 'Var') {
      const e = env.find(t.name);
      if (!e) throw this.err(`undefined variable '${t.name}' (declare it with let first)`, t);
      const v = this.eval(n.value, env);
      e.vars.set(t.name, v);
      return v;
    }
    const obj = this.eval(t.obj, env), idx = this.eval(t.index, env);
    if (!Array.isArray(obj)) throw this.err(`cannot change items of ${typeOf(obj)}; only lists can be changed`, t);
    this.checkIndex(t, obj, idx);
    const v = this.eval(n.value, env);
    obj[idx] = v;
    return v;
  }

  call(n, env) {
    const f = this.eval(n.callee, env);
    const args = n.args.map((a) => this.eval(a, env));
    if (f instanceof Builtin) {
      const [min, max] = Array.isArray(f.arity) ? f.arity : [f.arity, f.arity];
      if (args.length < min || args.length > max) {
        throw this.err(`${f.name} expects ${min === max ? min : `${min} to ${max === Infinity ? 'any number of' : max}`} argument(s) but got ${args.length}`, n);
      }
      return f.fn(args, n);
    }
    if (!(f instanceof PFunction)) throw this.err(`cannot call ${typeOf(f)} (it is not a function)`, n);
    if (args.length !== f.params.length) {
      throw this.err(`${f.name || 'function'} expects ${f.params.length} argument(s) but got ${args.length}`, n);
    }
    if (this.depth >= this.maxDepth) throw this.err('too many nested calls (is a function calling itself forever?)', n);
    const local = new Env(f.closure);
    f.params.forEach((name, i) => local.vars.set(name, args[i]));
    this.depth++;
    try {
      this.execBlock(f.body.body, local);
      return null;
    } catch (s) {
      if (s instanceof ReturnSignal) return s.value;
      if (s instanceof BreakSignal || s instanceof ContinueSignal) throw this.err("'break' and 'continue' only work inside a loop", n);
      throw s;
    } finally { this.depth--; }
  }
}

module.exports = { Interpreter, show };
