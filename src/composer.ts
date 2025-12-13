import * as vscode from "vscode";
import * as crypto from "crypto";

export interface ComposerOptions {
  title: string;
  placeholder?: string;
  value?: string;
  showCreatePrCheckbox?: boolean;
  showRequireApprovalCheckbox?: boolean;
}

export interface ComposerResult {
  prompt: string;
  createPR: boolean;
  requireApproval: boolean;
}

export async function showMessageComposer(
  options: ComposerOptions
): Promise<ComposerResult | undefined> {
  const panel = vscode.window.createWebviewPanel(
    "julesMessageComposer",
    options.title,
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    }
  );

  const nonce = getNonce();
  panel.webview.html = getComposerHtml(panel.webview, options, nonce);

  return new Promise((resolve) => {
    let resolved = false;

    const finalize = (value: ComposerResult | undefined) => {
      if (resolved) {
        return;
      }
      resolved = true;
      resolve(value);
    };

    panel.onDidDispose(() => finalize(undefined));

    panel.webview.onDidReceiveMessage((message) => {
      if (message?.type === "submit") {
        finalize({
          prompt: typeof message.value === "string" ? message.value : "",
          createPR: !!message.createPR,
          requireApproval: !!message.requireApproval,
        });
        panel.dispose();
      } else if (message?.type === "cancel") {
        finalize(undefined);
        panel.dispose();
      }
    });
  });
}

export function getComposerHtml(
  webview: vscode.Webview,
  options: ComposerOptions,
  nonce: string
): string {
  const placeholder = escapeAttribute(options.placeholder ?? "");
  const value = escapeHtml(options.value ?? "");
  const title = escapeHtml(options.title);
  const createPrCheckbox = options.showCreatePrCheckbox
    ? `
    <div class="create-pr-container">
      <input type="checkbox" id="create-pr" checked />
      <label for="create-pr">Create PR automatically?</label>
    </div>
  `
    : "";
  const requireApprovalCheckbox = options.showRequireApprovalCheckbox
    ? `
    <div class="require-approval-container">
      <input type="checkbox" id="require-approval" />
      <label for="require-approval">Require plan approval before execution?</label>
    </div>
  `
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; script-src 'nonce-${nonce}'; style-src ${webview.cspSource} 'nonce-${nonce}';" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${title}</title>
<style nonce="${nonce}">
  body {
    margin: 0;
    padding: 16px;
    background-color: var(--vscode-editor-background);
    color: var(--vscode-editor-foreground);
    font-family: var(--vscode-font-family);
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    box-sizing: border-box;
  }

  textarea {
    flex: 1;
    width: 100%;
    resize: vertical;
    font-family: var(--vscode-editor-font-family);
    font-size: var(--vscode-editor-font-size);
    color: var(--vscode-input-foreground);
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border);
    border-radius: 4px;
    padding: 12px;
    box-sizing: border-box;
    line-height: 1.5;
  }

  textarea:focus {
    outline: 1px solid var(--vscode-focusBorder);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 16px;
    margin-top: 16px;
  }

  .create-pr-container {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-right: auto;
  }

  .require-approval-container {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  button {
    padding: 6px 14px;
    border-radius: 4px;
    border: 1px solid var(--vscode-button-border, transparent);
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    cursor: pointer;
  }

  button.primary {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }

  button.primary:hover {
    background: var(--vscode-button-hoverBackground);
  }

  button:focus-visible {
    outline: 1px solid var(--vscode-focusBorder);
    outline-offset: 2px;
  }

  input[type="checkbox"] {
    cursor: pointer;
    accent-color: var(--vscode-button-background);
  }

  input[type="checkbox"]:focus-visible {
    outline: 1px solid var(--vscode-focusBorder);
    outline-offset: 2px;
  }

  label {
    cursor: pointer;
  }
</style>
</head>
<body>
  <textarea id="message" aria-label="${placeholder || 'Message input'}" placeholder="${placeholder}" autofocus>${value}</textarea>
  <div class="actions">
    ${createPrCheckbox}
    ${requireApprovalCheckbox}
    <button type="button" id="cancel" title="Cancel (Esc)" aria-label="Cancel (Esc)">Cancel</button>
    <button type="button" id="submit" class="primary" title="Send (Cmd/Ctrl+Enter)" aria-label="Send message (Cmd/Ctrl+Enter)">Send</button>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const textarea = document.getElementById('message');
    const createPrCheckbox = document.getElementById('create-pr');
    const requireApprovalCheckbox = document.getElementById('require-approval');
    const submit = () => {
      vscode.postMessage({
        type: 'submit',
        value: textarea.value,
        createPR: createPrCheckbox ? createPrCheckbox.checked : false,
        requireApproval: requireApprovalCheckbox ? requireApprovalCheckbox.checked : false,
      });
    };

    document.getElementById('submit').addEventListener('click', submit);
    document.getElementById('cancel').addEventListener('click', () => {
      vscode.postMessage({ type: 'cancel' });
    });

    textarea.addEventListener('keydown', (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        submit();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        vscode.postMessage({ type: 'cancel' });
      }
    });
  </script>
</body>
</html>`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function getNonce(): string {
  return crypto.randomBytes(16).toString("hex");
}
