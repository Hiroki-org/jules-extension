## 2024-05-01 - [Avoid loop recreation of Sets]
**Learning:** During review, we noticed `new Set([ ... ])` being instantiated inside a loop for `activity` logging in `extension.ts` (`logChannel.appendLine`). While it's just logging, moving static `Set` declarations outside the loop is a fundamental performance practice in V8.

**Action:** Move `baseKeys` and `unionKeys` `Set` instantiations outside the `forEach` loop in the `refreshActivities` loop inside `extension.ts` to prevent redundant garbage collection and allocation on hot code paths.
