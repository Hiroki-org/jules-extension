
## 2025-05-13 - [Performance] Optimized Git repository resolution
**Learning:** In multi-root workspaces with many repositories, finding the active repository by calling `path.relative` inside an `Array.find` loop over all repositories causes an O(N * M) performance bottleneck, where N is the number of repositories and M is the cost of computing relative paths.
**Action:** When finding the parent repository of a file, pre-index the repositories into a `Map` keyed by their normalized root paths, and traverse the document's path up the directory tree using `path.dirname` until a match is found in the Map. This reduces the time complexity to O(D), where D is the depth of the document path.
