import * as assert from "assert";
import * as vscode from "vscode";
import {
  buildSessionTooltip,
  getPrivacyIcon,
  getPrivacyStatusText,
  getStateDescription,
} from "../tooltipUtils";
import type { Session, SourceType } from "../types";

suite("tooltipUtils Unit Tests", () => {
  suite("privacy helpers", () => {
    test("getPrivacyIcon returns expected icon", () => {
      assert.strictEqual(getPrivacyIcon(true), "🔒 ");
      assert.strictEqual(getPrivacyIcon(false), "🌐 ");
      assert.strictEqual(getPrivacyIcon(undefined), "");
    });

    test("getPrivacyStatusText returns expected text", () => {
      assert.strictEqual(getPrivacyStatusText(true), "");
      assert.strictEqual(getPrivacyStatusText(true, "long"), " (Private)");
      assert.strictEqual(getPrivacyStatusText(false), "");
      assert.strictEqual(getPrivacyStatusText(false, "long"), " (Public)");
      assert.strictEqual(getPrivacyStatusText(undefined, "long"), "");
    });
  });

  suite("state description helper", () => {
    test("getStateDescription returns known and unknown mappings", () => {
      assert.strictEqual(getStateDescription("IN_PROGRESS"), "In progress");
      assert.strictEqual(getStateDescription("FAILED"), "Failed");
      assert.strictEqual(getStateDescription("NO_SUCH_STATE"), undefined);
    });
  });

  suite("buildSessionTooltip", () => {
    test("builds minimal tooltip and falls back to session name when title is missing", () => {
      const session = {
        name: "sessions/minimal",
        state: "RUNNING",
        rawState: "NO_SUCH_STATE",
      } as Session;

      const tooltip = buildSessionTooltip({
        session,
        hasDiff: false,
        hasChangeset: false,
      });

      assert.ok(tooltip instanceof vscode.MarkdownString);
      const value = tooltip.value;
      assert.ok(value.includes("**sessions/minimal**"));
      assert.ok(value.includes("Status: **RUNNING**"));
      assert.ok(!value.includes("State:"));
      assert.ok(!value.includes("Artifacts:"));
      assert.ok(!value.includes("🔗 **Pull Request"));
      assert.ok(value.includes("ID: `sessions/minimal`"));
    });

    test("renders detailed tooltip with de-duplicated PRs, artifacts, source info, timestamps, and failure reason", () => {
      const longDescription = `line1\r\n${"a".repeat(120)}`;
      const session: Session = {
        name: "sessions/full",
        title: "Full Session",
        state: "COMPLETED",
        rawState: "IN_PROGRESS",
        requirePlanApproval: true,
        automationMode: "AUTO_CREATE_PR",
        outputs: [
          {
            pullRequest: {
              url: "https://github.com/octo/repo/pull/42",
              title: "Fix parser duplicate",
            },
          },
          {
            pullRequest: {
              url: "https://github.com/octo/repo/pull/42",
              title: "Fix parser",
              description: longDescription,
            },
          },
          {
            pullRequest: {
              url: "https://github.com/octo/another/pull/5",
            },
          },
          {
            pullRequest: {
              url: "https://example.com/not-github",
              description: "non github pr",
            },
          },
        ],
        sourceContext: {
          source: "sources/github/my-org/my-repo",
          githubRepoContext: {
            startingBranch: "feature/add-tests",
          },
        },
        createTime: "2024-01-01T00:00:00Z",
        updateTime: "2024-01-02T00:00:00Z",
      };

      const selectedSource: SourceType = {
        name: "sources/github/my-org/my-repo",
        id: "my-org/my-repo",
        isPrivate: true,
      };

      const tooltip = buildSessionTooltip({
        session,
        hasDiff: true,
        hasChangeset: true,
        selectedSource,
        failureReasonPreview: "Build failed in CI",
      });

      const value = tooltip.value;
      assert.ok(value.includes("**Full Session**"));
      assert.ok(value.includes("Status: **COMPLETED**"));
      assert.ok(value.includes("State: In progress"));
      assert.ok(value.includes("⚠️ **Plan Approval Required**"));
      assert.ok(value.includes("Mode: 🤖 Auto Create PR"));
      assert.ok(value.includes("🔗 **Pull Requests**"));

      const openPrLinks = value.match(/\[Open PR/g) || [];
      assert.strictEqual(openPrLinks.length, 3);
      assert.ok(value.includes("[Open PR (repo#42)](https://github.com/octo/repo/pull/42)"));
      assert.ok(value.includes("[Open PR (another#5)](https://github.com/octo/another/pull/5)"));
      assert.ok(value.includes("[Open PR](https://example.com/not-github)"));
      assert.ok(value.includes("..."));
      assert.ok(!value.includes("\r\n"));

      assert.ok(value.includes("Artifacts: 📄 Diff, 📁 Changeset"));
      assert.ok(value.includes("Source: 🔒 `my-org/my-repo` (Private)"));
      assert.ok(value.includes("Branch: `feature/add-tests`"));
      assert.ok(value.includes("Created:"));
      assert.ok(value.includes("Updated:"));
      assert.ok(value.includes("❌ **Failure Reason:**"));
      assert.ok(value.includes("Build failed in CI"));
      assert.ok(value.includes("ID: `sessions/full`"));
    });

    test("renders manual and custom automation modes plus public source formatting", () => {
      const manualSession: Session = {
        name: "sessions/manual",
        title: "Manual Session",
        state: "RUNNING",
        rawState: "STATE_UNSPECIFIED",
        automationMode: "MANUAL",
        sourceContext: {
          source: "custom/source/path",
        },
      };

      const publicSource: SourceType = {
        name: "custom/source/path",
        id: "custom/source/path",
        isPrivate: false,
      };

      const manualTooltip = buildSessionTooltip({
        session: manualSession,
        hasDiff: false,
        hasChangeset: true,
        selectedSource: publicSource,
      }).value;

      assert.ok(manualTooltip.includes("State: Unknown state"));
      assert.ok(manualTooltip.includes("Mode: ✋ Manual"));
      assert.ok(manualTooltip.includes("Artifacts: 📁 Changeset"));
      assert.ok(manualTooltip.includes("Source: 🌐 `custom/source/path` (Public)"));

      const customModeSession = {
        ...manualSession,
        name: "sessions/custom",
        title: "Custom Session",
        automationMode: "AUTOMATION_MODE_UNSPECIFIED",
      } as Session;

      const customTooltip = buildSessionTooltip({
        session: customModeSession,
        hasDiff: false,
        hasChangeset: false,
      }).value;

      assert.ok(customTooltip.includes("Mode: AUTOMATION_MODE_UNSPECIFIED"));
      assert.ok(!customTooltip.includes("Artifacts:"));
    });
  });
});
