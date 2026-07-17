## 2026-07-15 - Optimize VS Code Git Extension branch fetching
**Learning:** Sequential async calls to VS Code Git Extension API for checking branch existence are slow and add significant overhead.
**Action:** Use batch fetching `repository.getBranches()` and check suffixes locally using `array.includes()`.
