'use strict';

/** An error in a Pebble program, with the line and column where it happened. */
class PebbleError extends Error {
  constructor(message, line, col, kind = 'Error') {
    super(message);
    this.name = 'PebbleError';
    this.kind = kind; // 'SyntaxError' or 'RuntimeError'
    this.line = line;
    this.col = col;
  }
  format() {
    return `${this.kind} at line ${this.line}, column ${this.col}: ${this.message}`;
  }
}

module.exports = { PebbleError };
