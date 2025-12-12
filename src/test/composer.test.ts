import * as assert from "assert";
import { getComposerHtml, escapeHtml, escapeAttribute } from "../composer";
import * as vscode from "vscode";

// Mock vscode.Webview
const mockWebview = {
  cspSource: "https://example.com",
} as vscode.Webview;

suite("Composer Test Suite", () => {
  suite("escapeHtml", () => {
    test("should escape essential HTML characters", () => {
      assert.strictEqual(escapeHtml("<script>"), "&lt;script&gt;");
      assert.strictEqual(escapeHtml("a & b"), "a &amp; b");
      assert.strictEqual(escapeHtml(`'quote'`), "'quote'"); // single quote is not escaped
    });
  });

  suite("escapeAttribute", () => {
    test("should escape characters for HTML attributes", () => {
      assert.strictEqual(escapeAttribute(`"hello"`), "&quot;hello&quot;");
      assert.strictEqual(escapeAttribute("<tag>"), "&lt;tag&gt;");
      assert.strictEqual(escapeAttribute("a & b"), "a &amp; b");
    });
  });

  suite("getComposerHtml", () => {
    test("should embed and escape title, placeholder, and value", () => {
      const html = getComposerHtml(
        mockWebview,
        {
          title: "<Title>",
          placeholder: `Your "placeholder"`,
          value: "Initial & value",
        },
        "nonce-123"
      );
      assert.ok(html.includes("<title>&lt;Title&gt;</title>"));
      assert.ok(
        html.includes(
          `<textarea id="message" aria-label="Your &quot;placeholder&quot;" placeholder="Your &quot;placeholder&quot;" autofocus>`
        )
      );
      assert.ok(html.includes(">Initial &amp; value</textarea>"));
    });

    test("should include accessibility attributes", () => {
      const html = getComposerHtml(
        mockWebview,
        { title: "Test", placeholder: "Type here" },
        "nonce-123"
      );
      assert.ok(html.includes('aria-label="Type here"'));
      assert.ok(html.includes('title="Send (Cmd/Ctrl+Enter)"'));
      assert.ok(html.includes('aria-label="Cancel (Esc)"'));
      assert.ok(html.includes('title="Cancel (Esc)"'));
      assert.ok(html.includes('aria-label="Send message (Cmd/Ctrl+Enter)"'));
    });

    test("should use default aria-label when placeholder is empty", () => {
      const html = getComposerHtml(
        mockWebview,
        { title: "Test" }, // placeholder is undefined
        "nonce-123"
      );
      assert.ok(html.includes('aria-label="Message input"'));
    });

    test("should show create PR checkbox when option is true", () => {
      const html = getComposerHtml(
        mockWebview,
        { title: "Test", showCreatePrCheckbox: true },
        "nonce-123"
      );
      assert.ok(html.includes(`<label for="create-pr">Create PR automatically?</label>`));
    });

    test("should not show create PR checkbox when option is false or undefined", () => {
      const html1 = getComposerHtml(
        mockWebview,
        { title: "Test", showCreatePrCheckbox: false },
        "nonce-123"
      );
      assert.ok(!html1.includes(`<label for="create-pr">`));

      const html2 = getComposerHtml(mockWebview, { title: "Test" }, "nonce-123");
      assert.ok(!html2.includes(`<label for="create-pr">`));
    });

    test("should show require approval checkbox when option is true", () => {
      const html = getComposerHtml(
        mockWebview,
        { title: "Test", showRequireApprovalCheckbox: true },
        "nonce-123"
      );
      assert.ok(
        html.includes(
          `<label for="require-approval">Require plan approval before execution?</label>`
        )
      );
    });

    test("should not show require approval checkbox when option is false or undefined", () => {
      const html1 = getComposerHtml(
        mockWebview,
        { title: "Test", showRequireApprovalCheckbox: false },
        "nonce-123"
      );
      assert.ok(!html1.includes(`<label for="require-approval">`));

      const html2 = getComposerHtml(mockWebview, { title: "Test" }, "nonce-123");
      assert.ok(!html2.includes(`<label for="require-approval">`));
    });
  });
});
