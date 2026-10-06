# Sieve of Eratosthenes: all primes below 50
let limit = 50
let isPrime = []
for i in range(limit) { push(isPrime, true) }

let p = 2
while p * p < limit {
  if isPrime[p] {
    let m = p * p
    while m < limit {
      isPrime[m] = false
      m = m + p
    }
  }
  p = p + 1
}

let primes = []
for n in range(2, limit) {
  if isPrime[n] { push(primes, n) }
}
print(primes)
