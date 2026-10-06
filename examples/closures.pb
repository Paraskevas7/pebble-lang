# Functions are values, and they remember where they were created
fn makeCounter() {
  let count = 0
  return fn() {
    count = count + 1
    return count
  }
}

let a = makeCounter()
let b = makeCounter()
print(a(), a(), a())
print(b())

fn map(list, f) {
  let out = []
  for x in list { push(out, f(x)) }
  return out
}
print(map([1, 2, 3, 4], fn(x) { return x * x }))
