import * as assert from "assert";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { handleFilterActivitiesCommand } from "../extension";
import type { ActivityCategory } from "../activityUtils";

suite("Command Coverage Unit Tests", () => {
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
  });

  teardown(() => {
    sandbox.restore();
  });

  function createFilterProvider(currentFilter = new Set<ActivityCategory>()) {
    const setActivityCategoryFilter = sandbox.stub();

    return {
      provider: {
        getActivityCategoryFilter: () => currentFilter,
        setActivityCategoryFilter,
      },
      setActivityCategoryFilter,
    };
  }

  test("jules.filterActivities should show quick pick with English placeholder", async () => {
    const showQuickPickStub = sandbox.stub(vscode.window, "showQuickPick");
    const { provider, setActivityCategoryFilter } = createFilterProvider();

    await handleFilterActivitiesCommand(provider);

    assert.ok(showQuickPickStub.calledOnce);
    assert.strictEqual(showQuickPickStub.firstCall.args[1]?.placeHolder, "Select Activity categories to filter (empty = show all)");
    assert.strictEqual(showQuickPickStub.firstCall.args[1]?.canPickMany, true);
    const quickPickItems = showQuickPickStub.firstCall.args[0] as readonly vscode.QuickPickItem[];
    assert.deepStrictEqual(
      quickPickItems.map((item) => ({
        label: item.label,
        picked: item.picked,
      })),
      [
        { label: "Plan", picked: true },
        { label: "Progress", picked: true },
        { label: "Artifacts", picked: true },
        { label: "Messages", picked: true },
        { label: "Errors", picked: true },
      ],
    );
    assert.ok(setActivityCategoryFilter.notCalled);
  });

  test("jules.filterActivities should update provider filter and refresh when items are selected", async () => {
    const showQuickPickStub = sandbox.stub(vscode.window, "showQuickPick");
    showQuickPickStub.resolves([
      { label: "Plan", picked: true },
      { label: "Messages", picked: true }
    ] as any);
    const { provider, setActivityCategoryFilter } = createFilterProvider(
      new Set<ActivityCategory>(["Plan"]),
    );

    await handleFilterActivitiesCommand(provider);

    assert.ok(showQuickPickStub.calledOnce);
    assert.ok(setActivityCategoryFilter.calledOnce);
    const selectedFilter = setActivityCategoryFilter.firstCall.args[0] as Set<string>;
    assert.deepStrictEqual([...selectedFilter].sort(), ["Messages", "Plan"]);
  });
});
