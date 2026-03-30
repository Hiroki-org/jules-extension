import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { downloadAndUnzipVSCode } from "@vscode/test-electron";
import { _electron as electron, ElectronApplication, Page } from "playwright-core";

const COMMAND_LABEL = "Create Jules Session";
const ERROR_MESSAGE = "No source selected. Please list and select a source first.";
// Keep the default VS Code build pinned because this smoke test reaches into
// workbench selectors such as `[aria-label="Open Quick Access"]`,
// `input[aria-label="Type the name of a command to run."]`, and
// `.quick-input-list .monaco-list-row`.
// If a VS Code update breaks them, rerun with
// `PWDEBUG=1 JULES_E2E_VSCODE_VERSION=<candidate> pnpm run test:e2e`, inspect the
// DOM in Playwright, and prefer stable role/aria/text selectors before falling
// back to Monaco-specific CSS hooks.
const VSCODE_VERSION = process.env.JULES_E2E_VSCODE_VERSION || "1.113.0";

type LaunchResult = {
  app: ElectronApplication;
  page: Page;
  tempDirs: string[];
};

function getWorkspaceRoot(): string {
  return path.resolve(__dirname, "../..");
}

function getCommandPaletteShortcut(): string {
  return process.platform === "darwin" ? "Meta+Shift+P" : "Control+Shift+P";
}

async function launchExtensionHost(): Promise<LaunchResult> {
  const workspaceRoot = getWorkspaceRoot();
  const executablePath = await downloadAndUnzipVSCode(VSCODE_VERSION);
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "jules-e2e-user-"));
  const extensionsDir = fs.mkdtempSync(path.join(os.tmpdir(), "jules-e2e-ext-"));

  const app = await electron.launch({
    executablePath,
    args: [
      workspaceRoot,
      `--extensionDevelopmentPath=${workspaceRoot}`,
      `--user-data-dir=${userDataDir}`,
      `--extensions-dir=${extensionsDir}`,
      "--disable-extensions",
      "--disable-gpu",
      "--disable-workspace-trust",
      "--no-sandbox",
      "--skip-release-notes",
      "--skip-welcome",
    ],
    timeout: 60_000,
  });

  const page = await app.firstWindow();
  await page.locator('[aria-label="Open Quick Access"]').waitFor({
    state: "visible",
    timeout: 30_000,
  });

  return {
    app,
    page,
    tempDirs: [userDataDir, extensionsDir],
  };
}

async function openCommandPalette(page: Page, commandLabel: string): Promise<void> {
  await page.keyboard.press(getCommandPaletteShortcut());

  const quickInput = page.locator(
    'input[aria-label="Type the name of a command to run."]',
  );
  await quickInput.waitFor({ state: "visible", timeout: 15_000 });
  await quickInput.fill(`>${commandLabel}`);

  const commandRow = page
    .locator(".quick-input-list .monaco-list-row")
    .filter({ hasText: commandLabel })
    .first();
  await commandRow.waitFor({ state: "visible", timeout: 15_000 });
  await page.keyboard.press("Enter");
}

async function closeApp(app: ElectronApplication): Promise<void> {
  try {
    await app.close();
  } catch {
    // VS Code shutdown can race with the test runner; ignore cleanup errors.
  }
}

function cleanupTempDirs(tempDirs: string[]): void {
  for (const tempDir of tempDirs) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

suite("VS Code UI Smoke Tests", () => {
  test("Create Jules Session shows an error toast when no source is selected", async function () {
    this.timeout(180_000);

    let app: ElectronApplication | undefined;
    let tempDirs: string[] = [];

    try {
      const launched = await launchExtensionHost();
      app = launched.app;
      tempDirs = launched.tempDirs;

      await openCommandPalette(launched.page, COMMAND_LABEL);

      const notification = launched.page
        .locator(".notifications-toasts")
        .getByText(ERROR_MESSAGE, { exact: true })
        .first();
      await notification.waitFor({ state: "visible", timeout: 15_000 });
    } finally {
      if (app) {
        await closeApp(app);
      }
      cleanupTempDirs(tempDirs);
    }
  });
});
