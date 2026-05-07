## 2025-02-23 - Avoid .map().filter() in Tooltip Rendering
**Learning:** Chained `.map().filter()` followed by `Array.from(new Map(...))` in UI rendering functions like `buildSessionTooltip` cause unnecessary array allocations and iterations, which can negatively impact performance when rendering large lists of sessions.
**Action:** Replace functional array chaining with direct single-pass `for` loops that populate the target collection (like a `Map`) directly when processing data for frequent UI rendering.
