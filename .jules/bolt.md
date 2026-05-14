## 2024-05-01 - Avoid loop recreation of Sets
**Learning:** During review, we noticed `new Set([ ... ])` being instantiated inside a loop for activity logging in `extension.ts`. While it is just logging, moving static `Set` declarations out of repeated execution paths is a fundamental performance practice in V8.
**Action:** Move the activity log key `Set` declarations to module-level constants in `extension.ts` to prevent redundant garbage collection and allocation on hot code paths.

## 2025-02-23 - Avoid .map().filter() in Tooltip Rendering
**Learning:** Chained `.map().filter()` followed by `Array.from(new Map(...))` in UI rendering functions like `buildSessionTooltip` cause unnecessary array allocations and iterations, which can negatively impact performance when rendering large lists of sessions.
**Action:** Replace functional array chaining with direct single-pass `for` loops that populate the target collection (like a `Map`) directly when processing data for frequent UI rendering.

## 2024-05-12 - Replacing .sort() for array equality checks
**Learning:** Using `.sort()` followed by index-based iteration is a common, but slow O(N log N) way to determine multiset equality (when order doesn't matter). Replacing it with an O(N) Map lookup eliminates memory reallocation and algorithmic overhead.
**Action:** When comparing arrays where element order is independent (e.g. file paths or branch names), build a Map of element counts rather than `.sort()`.

## 2024-05-12 - Handling Multiset arrays composed of Objects
**Learning:** A simple tally map works well to compare arrays composed of strings or numbers, but you need to be careful when the array contains objects. Simply matching lengths and hashing the stringified keys or specific properties (e.g. `path + status`) correctly allows a Frequency Map representation of a Multiset of Objects without the memory allocation and O(N log N) overhead of sorts.
**Action:** Always verify if arrays you are comparing allow duplicate items. Use `.length` validation, then build a Frequency map and decrement values when comparing.

## 2024-05-14 - Optimize Session Tree Rendering (Multiple iterations avoidance)
**Learning:** In UI rendering code, multiple calls to `Array.prototype.filter()` and `Array.prototype.map()` cause unnecessary array allocations and sequential iterations. This can be especially problematic when rendering lists in tree views.
**Action:** Replace multiple chained functional array methods like `filter()` and `map()` with a single `for...of` loop or single pass loop that combines filtering and mapping logic directly, returning the formatted items while only traversing the source list once.
