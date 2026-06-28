## 2024-06-28 - Unnecessary Set Creation Replaced with Array Includes for Lookups
**Learning:** Creating a `Set` from an array purely to check for the existence of a single element (`new Set(arr).has(item)`) introduces measurable overhead (object allocation and iteration) without leveraging the structural benefits of a Set.
**Action:** Opt for `Array.includes()` for solitary inclusion checks unless the Set is cached and utilized across multiple lookups.
## 2024-06-28 - Avoid Intermediate Arrays in Set Initialization
**Learning:** Instantiating a `Set` from mapped data (e.g., `new Set(arr.map(x => x.id))`) causes an unnecessary intermediate array allocation which can spike garbage collection in hot paths.
**Action:** Use a `for...of` loop to directly accumulate items into the `Set` via `.add()`, thereby avoiding intermediate allocations.
