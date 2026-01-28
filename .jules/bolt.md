# Bolt's Journal

## 2024-05-22 - Initial Setup
**Learning:** Performance is a continuous process.
**Action:** Start profiling.

**Action:** Start profiling.


## 2026-01-28 - Non-blocking Branch Refresh
**Learning:** Background tasks (like cache refresh) must never invoke UI elements (like `showQuickPick`) as they can block the extension host or disrupt the user.
**Optimization:** Implemented a `silent` mode in `getActiveRepository` to suppress UI and infer the repository from context (active editor) or fail silently, preventing blocking in background branch refresh.
