const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/test/activityUtils.unit.test.ts');
let content = fs.readFileSync(filePath, 'utf-8');

if (!content.includes('isActivityCorrupted')) {
    content = content.replace(
        'getActivitySummaryText,\n} from "../activityUtils";',
        'getActivitySummaryText,\n    isActivityCorrupted,\n} from "../activityUtils";'
    );

    const newTests = `
suite("activityUtils isActivityCorrupted", () => {
    test("returns false for a completely valid activity with matching type and payload", () => {
        const activity = mockActivity({
            type: "planGenerated",
            planGenerated: { plan: { title: "p1", steps: [] } as any },
        });
        assert.strictEqual(isActivityCorrupted(activity), false);
    });

    test("returns true for a corrupted activity missing its payload", () => {
        const activity = mockActivity({
            type: "planGenerated",
            // Notice: no planGenerated field is present
        });
        assert.strictEqual(isActivityCorrupted(activity), true);
    });

    test("returns false when type is undefined but some other payload exists", () => {
        const activity = mockActivity({
            type: undefined,
            agentMessaged: { agentMessage: "Hello" },
        });
        assert.strictEqual(isActivityCorrupted(activity), false);
    });

    test("returns false when type does not belong to union keys", () => {
        const activity = mockActivity({
            type: "customUnknownType",
        });
        assert.strictEqual(isActivityCorrupted(activity), false);
    });
});
`;

    content += newTests;
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log("Patched test file");
} else {
    console.log("Already patched");
}
