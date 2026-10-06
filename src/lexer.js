'use strict';
const { PebbleError } = require('./errors');

const KEYWORDS = new Set(['let', 'fn', 'return', 'if', 'else', 'while', 'for', 'in', 'break', 'continue',
  'true', 'false', 'null', 'and', 'or', 'not']);
const TWO_CHAR = new Set(['==', '!=', '<=', '>=']);
const ONE_CHAR = new Set(['+', '-', '*', '/', '%', '<', '>', '=', '(', ')', '[', ']', '{', '}', ',', ';']);
const ESCAPES = { n: '\n', t: '\t', '"': '"', '\\': '\\' };

/**
 * Turns source text into tokens: { type, value, line, col }.
 * Types: num, str, id, kw, op, nl (end of line), eof.
 * Newlines inside ( ) and [ ] are ignored so long calls and lists can span lines.
 */
function tokenize(src) {
  const tokens = [];
  const brackets = []; // stack of open ( [ {
  let i = 0, line = 1, col = 1;

  const add = (type, value, l, c) => tokens.push({ type, value, line: l, col: c });
  const next = () => {
    const ch = src[i++];
    if (ch === '\n') { line++; col = 1; } else col++;
    return ch;
  };
  const isDigit = (ch) => ch >= '0' && ch <= '9';
  const isIdStart = (ch) => (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_';

  while (i < src.length) {
    const ch = src[i], l = line, c = col;
    if (ch === ' ' || ch === '\t' || ch === '\r') { next(); continue; }
    if (ch === '#') { while (i < src.length && src[i] !== '\n') next(); continue; }
    if (ch === '\n') {
      next();
      const top = brackets[brackets.length - 1];
      if (top !== '(' && top !== '[') add('nl', '\n', l, c);
      continue;
    }
    if (isDigit(ch)) {
      let text = '';
      while (isDigit(src[i])) text += next();
      if (src[i] === '.' && isDigit(src[i + 1])) { text += next(); while (isDigit(src[i])) text += next(); }
      add('num', Number(text), l, c);
      continue;
    }
    if (ch === '"') {
      next();
      let text = '';
      for (;;) {
        if (i >= src.length || src[i] === '\n') throw new PebbleError('unterminated string', l, c, 'SyntaxError');
        const s = next();
        if (s === '"') break;
        if (s === '\\') {
          const e = next();
          if (!(e in ESCAPES)) throw new PebbleError(`unknown escape \\${e}`, line, col - 1, 'SyntaxError');
          text += ESCAPES[e];
        } else text += s;
      }
      add('str', text, l, c);
      continue;
    }
    if (isIdStart(ch)) {
      let text = '';
      while (i < src.length && (isIdStart(src[i]) || isDigit(src[i]))) text += next();
      add(KEYWORDS.has(text) ? 'kw' : 'id', text, l, c);
      continue;
    }
    const two = src.substr(i, 2);
    if (TWO_CHAR.has(two)) { next(); next(); add('op', two, l, c); continue; }
    if (ONE_CHAR.has(ch)) {
      next();
      if (ch === '(' || ch === '[' || ch === '{') brackets.push(ch);
      if (ch === ')' || ch === ']' || ch === '}') brackets.pop();
      add('op', ch, l, c);
      continue;
    }
    throw new PebbleError(`unexpected character '${ch}'`, l, c, 'SyntaxError');
  }
  add('eof', null, line, col);
  return tokens;
}

module.exports = { tokenize };
