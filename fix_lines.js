const fs = require('fs');

// We have 2 lines that we missed coverage for, lines 568 and 569 in src/sessionContextMenu.ts.
// Line 568: const rFetchUrlNoGit = r.fetchUrl.endsWith('.git') ? r.fetchUrl.slice(0, -4) : r.fetchUrl;
// We actually hit both branches. Wait, looking at the codecov patch report it says 80%.
// The only things modified in this PR were lines around 560-580.
// We added tests. Let's run pnpm run test:unit again and see if the patch coverage hits.
// Actually, looking at `BRDA:568,115,0,0` and `BRDA:569,116,0,0` these are branch missed in lcov.
// What are the exact conditions?
// 568: `r.fetchUrl.endsWith('.git') ? r.fetchUrl.slice(0, -4) : r.fetchUrl;`
// We need a test where `r.fetchUrl` does NOT end with `.git` and `rFetchUrlNoGit === headCloneUrlNoGit`.
// We already added one where `r.fetchUrl` DOES NOT end with `.git`.
// In `checkoutToBranchForSession covers fallback to headCloneUrl`:
// `r.fetchUrl = 'https://github.com/fork-owner/fork-repo'`
// `headCloneUrl = 'https://github.com/fork-owner/fork-repo'`

// Let's create a test where `r.fetchUrl` ends with `.git` but `headCloneUrl` does NOT end with `.git`,
// or where `r.fetchUrl` does not end with `.git` but `headCloneUrl` does.
