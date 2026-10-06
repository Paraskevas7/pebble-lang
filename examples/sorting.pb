# Bubble sort, written by hand
fn bubbleSort(list) {
  let a = list + []        # a copy, so the original is untouched
  let swapped = true
  while swapped {
    swapped = false
    for i in range(len(a) - 1) {
      if a[i] > a[i + 1] {
        let tmp = a[i]
        a[i] = a[i + 1]
        a[i + 1] = tmp
        swapped = true
      }
    }
  }
  return a
}

let data = [5, 2, 9, 1, 5, 6]
print("before:", data)
print("after: ", bubbleSort(data))
