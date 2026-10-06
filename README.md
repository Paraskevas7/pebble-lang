# Pebble

[![CI](https://github.com/Paraskevas7/pebble-lang/actions/workflows/ci.yml/badge.svg)](https://github.com/Paraskevas7/pebble-lang/actions)

**Pebble is a tiny programming language I built from scratch**: a tokenizer, a recursive-descent parser and a
tree-walking interpreter, in plain JavaScript with no libraries.

**[Open the playground in your browser (works on phones)](https://paraskevas7.github.io/pebble-lang/)**

```
fn makeCounter() {
  let count = 0
  return fn() {
    count = count + 1
    return count
  }
}

let a = makeCounter()
print(a(), a(), a())          # 1 2 3
```

## The language

| Feature | Example |
|---|---|
| Values | numbers `3.14`, strings `"hi"`, booleans, `null`, lists `[1, 2]` |
| Variables | `let x = 1`, then `x = x + 1` (block scoping) |
| Operators | `+ - * / %`, `== != < <= > >=`, `and or not` (short-circuit) |
| Control flow | `if / else if / else`, `while`, `for x in list`, `break`, `continue` |
| Functions | `fn add(a, b) { return a + b }`, recursion, anonymous `fn(x) { ... }`, closures |
| Lists and strings | indexing `xs[0]`, assignment `xs[0] = 9`, `+` joins lists |
| Built-ins | `print len str num type range push pop sort reverse join split upper lower abs floor sqrt min max` |

Only `false` and `null` count as false. Statements end with a new line or `;`. Comments start with `#`.

## How it works

```
source text --tokenize--> tokens --parse--> syntax tree --interpret--> output
 src/lexer.js              src/parser.js       src/interpreter.js
```

1. **Lexer** (`src/lexer.js`) turns characters into tokens with line and column numbers. Newlines inside `( )` and `[ ]` are ignored so long calls can span lines.
2. **Parser** (`src/parser.js`) uses recursive descent with one function per precedence level, so `1 + 2 * 3` is parsed as `1 + (2 * 3)`. The grammar is written at the top of the file.
3. **Interpreter** (`src/interpreter.js`) walks the tree. Variables live in a chain of environments, which is what makes closures work. `break`, `continue` and `return` are implemented with exceptions.
4. **Errors** point at the exact place: `RuntimeError at line 2, column 9: division by zero`.
5. **Safety limits**: a step limit stops infinite loops and a depth limit stops runaway recursion, so the playground can never freeze your browser tab.

## Run it

```bash
npm test                              # 21 tests: lexer, parser, interpreter, errors, limits, examples
node bin/pebble.js examples/fizzbuzz.pb
node bin/pebble.js --tokens examples/hello.pb   # see the tokens
node bin/pebble.js --ast examples/hello.pb      # see the syntax tree
npm run build                         # rebuild the browser bundle in docs/
```

`examples/` holds small programs (FizzBuzz, Fibonacci, prime sieve, bubble sort, closures). Each one has a `.expected`
file, and the tests check that running the program gives exactly that output.

## Ideas to extend
A bytecode compiler and virtual machine, maps/dictionaries, a static type checker, string interpolation, a debugger that
steps through the program in the playground.

## License
MIT
