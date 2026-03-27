import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";

const WORKFLOW_PATH = path.resolve(__dirname, "../../.github/workflows/publish.yml");

suite("Publish Workflow Test Suite", () => {
    let workflowContent: string;

    setup(() => {
        workflowContent = fs.readFileSync(WORKFLOW_PATH, "utf8");
    });

    test("workflow file exists and is readable", () => {
        assert.ok(fs.existsSync(WORKFLOW_PATH), "publish.yml should exist");
        assert.ok(workflowContent.length > 0, "publish.yml should not be empty");
    });

    test("vsce publish command includes --skip-duplicate flag", () => {
        assert.ok(
            workflowContent.includes("--skip-duplicate"),
            "vsce publish command should include --skip-duplicate to avoid failing on duplicate versions"
        );
    });

    test("vsce publish command still includes --no-dependencies flag", () => {
        assert.ok(
            workflowContent.includes("--no-dependencies"),
            "vsce publish command should still include --no-dependencies (regression check)"
        );
    });

    test("vsce publish command still passes the VSCE_PAT token", () => {
        assert.ok(
            workflowContent.includes('-p "$VSCE_PAT"'),
            "vsce publish command should still pass the PAT token via -p"
        );
    });

    test("vsce publish command has correct full form with --skip-duplicate", () => {
        assert.ok(
            workflowContent.includes('vsce publish --no-dependencies --skip-duplicate -p "$VSCE_PAT"'),
            "vsce publish command should be: vsce publish --no-dependencies --skip-duplicate -p \"$VSCE_PAT\""
        );
    });

    test("vsce publish command does not use old form without --skip-duplicate", () => {
        // The old command was: vsce publish --no-dependencies -p "$VSCE_PAT"
        // After adding --skip-duplicate the old form should no longer appear
        const oldCommand = 'vsce publish --no-dependencies -p "$VSCE_PAT"';
        assert.strictEqual(
            workflowContent.includes(oldCommand),
            false,
            "Old vsce publish command without --skip-duplicate should not be present"
        );
    });

    test("workflow installs vsce before publishing", () => {
        const installIndex = workflowContent.indexOf("npm install -g @vscode/vsce");
        const publishIndex = workflowContent.indexOf("vsce publish");
        assert.ok(installIndex !== -1, "workflow should install @vscode/vsce");
        assert.ok(publishIndex !== -1, "workflow should run vsce publish");
        assert.ok(
            installIndex < publishIndex,
            "vsce should be installed before the publish command runs"
        );
    });

    test("workflow uses VSCE_PAT secret as env variable", () => {
        assert.ok(
            workflowContent.includes("VSCE_PAT: ${{ secrets.VSCE_PAT }}"),
            "workflow should source VSCE_PAT from repository secrets"
        );
    });

    test("workflow triggers on version tags", () => {
        assert.ok(
            workflowContent.includes("v*-publish"),
            "workflow should trigger on v*-publish tags"
        );
    });

    test("--skip-duplicate appears only once in the workflow", () => {
        const occurrences = (workflowContent.match(/--skip-duplicate/g) || []).length;
        assert.strictEqual(
            occurrences,
            1,
            "--skip-duplicate should appear exactly once in the publish command"
        );
    });
});