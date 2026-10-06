#!/usr/bin/env node
// Usage: node bin/pebble.js program.pb        run a file
//        node bin/pebble.js --tokens file.pb   print the tokens
//        node bin/pebble.js --ast file.pb      print the syntax tree
const fs = require('fs');
const { run, tokenize, parse, PebbleError } = require('../src');

const args = process.argv.slice(2);
const flag = args[0] && args[0].startsWith('--') ? args.shift() : null;
if (!args[0]) { console.error('usage: pebble [--tokens|--ast] program.pb'); process.exit(2); }
const src = fs.readFileSync(args[0], 'utf8');
try {
  if (flag === '--tokens') tokenize(src).forEach((t) => console.log(`${t.line}:${t.col}\t${t.type}\t${JSON.stringify(t.value)}`));
  else if (flag === '--ast') console.log(JSON.stringify(parse(src), null, 2));
  else {
    const r = run(src);
    process.stdout.write(r.output);
    if (r.error) { console.error(r.error.format()); process.exit(1); }
  }
} catch (e) {
  if (e instanceof PebbleError) { console.error(e.format()); process.exit(1); }
  throw e;
}
