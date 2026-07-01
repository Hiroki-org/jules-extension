
## 2026-07-01 - ⚡ Bolt: Optimize debug state counting by merging array iterations
**Learning:** Separate loops over the same array length (e.g. mapping followed by reducing) cause redundant iterations, especially when standard `reduce` creates unnecessary object abstractions or copies.
**Action:** When filtering or mapping data, look ahead to see if aggregations or side calculations can be merged into the primary map/filter loop to reduce overhead and memory footprint.
