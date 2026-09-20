// Wait! `gh api repos/{owner}/{repo}/pulls/847/reviews | jq -r '.[].body'`
// returned nothing. And the comments say "All modified and coverable lines are covered by tests."
// The first CI run failed with 88% coverage target 90%. I amended the commit. Now Codecov says "All modified and coverable lines are covered by tests."
// So the coverage issue is already fixed by the latest amendment.
