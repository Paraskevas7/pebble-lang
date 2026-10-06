# Recursion
fn fib(n) {
  if n < 2 { return n }
  return fib(n - 1) + fib(n - 2)
}

for i in range(11) {
  print("fib(" + i + ") =", fib(i))
}
