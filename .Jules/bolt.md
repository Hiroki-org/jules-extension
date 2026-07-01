
## 2026-07-01 - Optimize Branch Name Checking
**Learning:** Sequential await calls for branch existence check can be slow if multiple branches exist. Batching checks with Promise.all reduces network/IO roundtrips while preserving the required order of assignment.
**Action:** When finding an available name sequentially, use small batches (e.g. 5) via Promise.all if the cost of checking concurrently is low compared to sequential network latency.
