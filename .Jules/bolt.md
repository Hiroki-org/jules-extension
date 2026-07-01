
## 2026-07-01 - Optimize remote branch existence check with Promise.any
**Learning:** Sequential async checks inside loops (e.g., checking branch existence across multiple remotes) create unnecessary bottlenecks. Utilizing Promise.any() allows checking all remotes concurrently, significantly reducing execution time and returning immediately upon the first successful match.
**Action:** Use Promise.any() (or Promise.all() where appropriate) instead of for...of loops when independent async operations, like querying remotes, can be executed concurrently to improve performance in hot paths.
