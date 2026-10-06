'use strict';
const { tokenize } = require('./lexer');
const { parse } = require('./parser');
const { Interpreter, show } = require('./interpreter');
const { PebbleError } = require('./errors');

/** Run a program. Returns { output, error } where error is null or a PebbleError. */
function run(source, options = {}) {
  let output = '';
  const interp = new Interpreter({ ...options, out: (t) => { output += t; } });
  try {
    interp.run(source);
    return { output, error: null, steps: interp.steps };
  } catch (e) {
    if (e instanceof PebbleError) return { output, error: e, steps: interp.steps };
    throw e;
  }
}

module.exports = { tokenize, parse, run, show, PebbleError };
