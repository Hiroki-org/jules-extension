
## 2025-05-13 - [Performance] Optimized Git repository resolution
**Learning:** In multi-root workspaces with many repositories, finding the active repository by calling `path.relative` inside an `Array.find` loop over all repositories causes an O(N * M) performance bottleneck, where N is the number of repositories and M is the cost of computing relative paths.
**Action:** When finding the parent repository of a file, pre-index the repositories into a `Map` keyed by their normalized root paths, and traverse the document's path up the directory tree using `path.dirname` until a match is found in the Map. This reduces the time complexity to O(D), where D is the depth of the document path.
## 2025-02-23 - Avoid .map().filter() in Tooltip Rendering
**Learning:** Chained `.map().filter()` followed by `Array.from(new Map(...))` in UI rendering functions like `buildSessionTooltip` cause unnecessary array allocations and iterations, which can negatively impact performance when rendering large lists of sessions.
**Action:** Replace functional array chaining with direct single-pass `for` loops that populate the target collection (like a `Map`) directly when processing data for frequent UI rendering.

## 2024-05-12 - Replacing .sort() for array equality checks
**Learning:** Using `.sort()` followed by index-based iteration is a common, but slow O(N log N) way to determine multiset equality (when order doesn't matter). Replacing it with an O(N) Map lookup eliminates memory reallocation and algorithmic overhead.
**Action:** When comparing arrays where element order is independent (e.g. file paths or branch names), build a Map of element counts rather than `.sort()`.

## 2024-05-12 - Handling Multiset arrays composed of Objects
**Learning:** A simple tally map works well to compare arrays composed of strings or numbers, but you need to be careful when the array contains objects. Simply matching lengths and hashing the stringified keys or specific properties (e.g. `path + status`) correctly allows a Frequency Map representation of a Multiset of Objects without the memory allocation and O(N log N) overhead of sorts.
**Action:** Always verify if arrays you are comparing allow duplicate items. Use `.length` validation, then build a Frequency map and decrement values when comparing.

## 2026-05-13 - Array.find() optimizations

**Learning:** Replacing multiple O(N) Array.find() calls sequentially with an O(1) Map lookup ensures worst-case performance bounds and scales better for larger collections. However, for very small collections (like Git remotes) that are only looked up once or twice, the Map allocation and hashing overhead usually outweighs the O(1) lookup benefit, causing performance degradation.
**Action:** Always prefer Maps when resolving objects across multiple fields iteratively **only** if the collection is large or if there are many subsequent lookups on the same structure. For small, infrequent lookups, stick to `Array.find()` or simple `for` loops.

## 2024-05-13 - Fast Path & Single-Pass Filtering for `JulesSessionsProvider.getChildren`

**Learning:** Sequential `.filter()` calls, especially those dependent on settings (`hideClosedPRSessions`), can create multiple intermediate arrays and cause unnecessary O(N) iterations.
**Action:** Implemented a 'Fast Path' to avoid allocations entirely when no filtering is needed (e.g., All Sources selected and hide closed PRs disabled). Consolidated remaining filter logic into a single loop, manually maintaining required counters (`sourceFilteredCount`, `terminatedFilteredCount`) to preserve telemetry/logging parity while optimizing speed and memory.

## 2026-05-15 - [test] E2EテストをLinuxと仮想ディスプレイ上で実行するように変更

**Learning:** CI環境においてElectron/PlaywrightのUIベースE2Eテストは仮想ディスプレイ(xvfb)がないと初期化エラーになる。
**Action:** CIでVSCode/Electron E2Eテストを動かすときはmacOSではなく、Linux環境にxvfbを導入し `xvfb-run -a <command>` を使う。

## 2026-05-15 - [test] E2EテストのVSCode起動安定化

**Learning:** Linux CI環境での共有メモリ不足や、macOS(arm64等)でのGPU関連の初期化エラーにより、Electronアプリ(VSCode E2Eテスト)が起動直後にクラッシュし `Target page closed` エラーになることがある。
**Action:** PlaywrightからVSCodeをlaunchする引数に `--disable-dev-shm-usage` と `--disable-software-rasterizer` を追加してクラッシュを回避する。

## 2026-05-16 - Avoid .map() inside Map constructor

**Learning:** Instantiating a `Map` using `new Map(array.map(...))` creates an intermediate array containing key-value pairs, which causes unnecessary memory allocations and iteration overhead, especially for large arrays or frequently called functions.
**Action:** Replace `new Map(array.map(...))` with `new Map()` followed by a `for...of` loop that directly calls `.set()` on the `Map` instance to avoid the intermediate array allocation.

## 2026-05-15 - [Performance] Eliminating spread operators and .filter() chains
**Learning:** Using spread syntax `...` inside an array literal followed by `.filter()` creates multiple intermediate arrays and forces multiple O(N) iterations, leading to unnecessary memory allocations and CPU overhead during simple array processing.
**Action:** Use a single-pass `for...of` loop combined with a `Set` to handle array concatenation, type checking, and deduplication simultaneously.
## 2026-05-20 - [Performance] Single-pass array operations over chaining
**Learning:** Functional array method chaining like `.map().filter()` or combining `.filter()` with spread operators (`[...array1, ...array2]`) forces multiple iterations over the data and allocates several intermediate temporary arrays. In hot paths or large collections, this results in measurable CPU overhead and increased memory pressure for garbage collection.
**Action:** Replace functional array method chains with a single `for...of` loop where filtering logic (via `if` conditions) and mapping logic (direct assignment/pushing) are combined into one pass, pushing directly to the final collection.

## 2024-05-19 - Avoid Chaining Array Methods for UI Lists
**Learning:** Chaining functional array methods like `.filter().map()` to generate lists for UI components (like VS Code's `showQuickPick`) introduces unnecessary intermediate array allocations and redundant sequential traversals. This is particularly relevant when mapping data for dropdowns, quick picks, or tree views where performance matters.
**Action:** When filtering and transforming arrays for UI components, use a single-pass loop (e.g., `for...of`) to combine both operations. This directly populates the final array, reducing GC pressure and avoiding O(2N) iteration.
