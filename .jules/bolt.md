# 2024-05-01 - Avoid loop recreation of Sets

**Learning:** During review, we noticed `new Set([ ... ])` being instantiated inside a loop for activity logging in `extension.ts`. While it is just logging, moving static `Set` declarations out of repeated execution paths is a fundamental performance practice in V8.
**Action:** Move the activity log key `Set` declarations to module-level constants in `extension.ts` to prevent redundant garbage collection and allocation on hot code paths.
