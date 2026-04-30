import * as assert from "assert";
import { CHAT_CSS, CHAT_JS } from "../webview/chatAssets";

suite("chatAssets unit tests", () => {
  test("CHAT_CSS should keep accessibility-focused selectors", () => {
    assert.ok(
      CHAT_CSS.includes(
        ".code-block:hover .copy-code-button, .copy-code-button:focus-visible",
      ),
    );
    assert.ok(CHAT_CSS.includes("#messageInput:focus-visible"));
  });

  test("CHAT_CSS should target typing-dot delays for rendered structure", () => {
    assert.ok(CHAT_CSS.includes(".typing-dot:nth-child(2)"));
    assert.ok(CHAT_CSS.includes(".typing-dot:nth-child(3)"));
    assert.ok(!CHAT_CSS.includes(".typing-dot:nth-child(1)"));
  });

  test("CHAT_JS should include key webview message and copy handlers", () => {
    assert.ok(CHAT_JS.includes("requestInitialState"));
    assert.ok(CHAT_JS.includes('type: "sendMessage"'));
    assert.ok(CHAT_JS.includes("copy-code-button"));
    assert.ok(CHAT_JS.includes("navigator.clipboard.writeText"));
  });

  test("CHAT_CSS should include activity details layout styles", () => {
    assert.ok(CHAT_CSS.includes(".activity-details"));
    assert.ok(CHAT_CSS.includes(".details-content"));
    assert.ok(CHAT_CSS.includes("max-height: 350px"));
    assert.ok(CHAT_CSS.includes("overflow-y: auto"));
  });

  test("CHAT_CSS should keep shiki theme variable selectors", () => {
    assert.ok(CHAT_CSS.includes(".shiki { background-color: transparent !important; }"));
    assert.ok(CHAT_CSS.includes(".shiki span { color: var(--shiki-light); }"));
    assert.ok(
      CHAT_CSS.includes(
        '[data-vscode-theme-kind="vscode-dark"] .shiki span { color: var(--shiki-dark); }',
      ),
    );
    assert.ok(
      CHAT_CSS.includes(
        '[data-vscode-theme-kind="vscode-high-contrast"] .shiki span { color: var(--shiki-dark); }',
      ),
    );
  });

  test("CHAT_CSS should keep session label truncation safeguards", () => {
    assert.ok(CHAT_CSS.includes(".session-label"));
    assert.ok(CHAT_CSS.includes("max-width: 70%"));
    assert.ok(CHAT_CSS.includes("text-overflow: ellipsis"));
    assert.ok(CHAT_CSS.includes("white-space: nowrap"));
  });

  test("CHAT_JS should reset copy button text after failure", () => {
    assert.ok(CHAT_JS.includes('copyButton.textContent = "Failed"'));
    const resetCount = (
      CHAT_JS.match(
        /setTimeout\(\(\) => copyButton\.textContent = originalText, 1200\)/g,
      ) ?? []
    ).length;
    assert.strictEqual(
      resetCount,
      2,
      "both success and failure paths should reset button text",
    );
  });
});
