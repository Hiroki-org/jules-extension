## 2024-05-01 - Avoid loop recreation of Sets
**Learning:** During review, we noticed `new Set([ ... ])` being instantiated inside a loop for activity logging in `extension.ts`. While it is just logging, moving static `Set` declarations out of repeated execution paths is a fundamental performance practice in V8.
**Action:** Move the activity log key `Set` declarations to module-level constants in `extension.ts` to prevent redundant garbage collection and allocation on hot code paths.

## 2025-02-23 - Avoid .map().filter() in Tooltip Rendering
**Learning:** Chained `.map().filter()` followed by `Array.from(new Map(...))` in UI rendering functions like `buildSessionTooltip` cause unnecessary array allocations and iterations, which can negatively impact performance when rendering large lists of sessions.
**Action:** Replace functional array chaining with direct single-pass `for` loops that populate the target collection (like a `Map`) directly when processing data for frequent UI rendering.
## 2026-05-09 - [Object.keys() vs for...in iteration]
**Learning:** Replacing `for...in` with `Object.keys()` combined with index-based `for` loops for simple property iterations is considered an unmeasurable micro-optimization that sacrifices readability and introduces array allocation overhead. It does not align with the codebase's performance philosophy.
**Action:** Do not optimize `for...in` loops or basic JS iterators unless a specific, measurable bottleneck is proven. Focus on macro-optimizations like network I/O, cache improvements, or preventing redundant computations.
