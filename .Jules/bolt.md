## 2024-07-07 - Avoid Set instantiations for single lookups
**Learning:** `new Set(array).has(value)` is an anti-pattern for single membership checks. While `has()` is O(1), building the `Set` from an array is O(N) in both time and space, causing unnecessary garbage collection pressure and CPU overhead during frequent UI/state operations like branch switching.
**Action:** Always prefer the native `array.includes(value)` for one-off membership checks. Only use `Set` when checking multiple items against a persistent collection.
