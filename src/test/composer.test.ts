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
      assert.strictEqual(escapeHtml(`'quote'`), "&#39;quote&#39;");
      assert.strictEqual(escapeHtml(`"quote"`), "&quot;quote&quot;");
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

    test("should include checkbox styles", () => {
      const html = getComposerHtml(
        mockWebview,
        { title: "Test" },
        "nonce-123"
      );
      assert.ok(html.includes('input[type="checkbox"]'));
      assert.ok(html.includes('accent-color: var(--vscode-button-background)'));
      assert.ok(html.includes('input[type="checkbox"]:focus-visible'));
    });

    test("should include validation logic", () => {
      const html = getComposerHtml(
        mockWebview,
        { title: "Test" },
        "nonce-123"
      );
      assert.ok(html.includes('button:disabled'));
      assert.ok(html.includes('submitButton.disabled = !isValid'));
      assert.ok(html.includes("textarea.addEventListener('input', validate)"));
    });

    test("should include validate function that checks trimmed textarea value", () => {
      const html = getComposerHtml(
        mockWebview,
        { title: "Test" },
        "nonce-123"
      );
      assert.ok(html.includes('const validate = () => {'));
      assert.ok(html.includes('const isValid = textarea.value.trim().length > 0;'));
      assert.ok(html.includes('submitButton.disabled = !isValid;'));
      assert.ok(html.includes('return isValid;'));
    });

    test("should call validate on initial load", () => {
      const html = getComposerHtml(
        mockWebview,
        { title: "Test" },
        "nonce-123"
      );
      // Validate should be called at the end of the script
      const validateCallIndex = html.lastIndexOf('validate();');
      const scriptEndIndex = html.lastIndexOf('</script>');
      assert.ok(validateCallIndex > 0 && validateCallIndex < scriptEndIndex);
    });

    test("should prevent submit when validation fails", () => {
      const html = getComposerHtml(
        mockWebview,
        { title: "Test" },
        "nonce-123"
      );
      assert.ok(html.includes('const submit = () => {'));
      assert.ok(html.includes('if (!validate()) {'));
      assert.ok(html.includes('return;'));
      // Ensure the early return happens before postMessage
      const validateCheckIndex = html.indexOf('if (!validate()) {');
      const postMessageIndex = html.indexOf("vscode.postMessage({", validateCheckIndex);
      assert.ok(validateCheckIndex > 0 && postMessageIndex > validateCheckIndex);
    });

    test("should call validate when Cmd/Ctrl+Enter is pressed", () => {
      const html = getComposerHtml(
        mockWebview,
        { title: "Test" },
        "nonce-123"
      );
      assert.ok(html.includes("if ((event.metaKey || event.ctrlKey) && event.key === 'Enter')"));
      assert.ok(html.includes('if (validate()) {'));
      assert.ok(html.includes('submit();'));
    });

    test("should attach input listener to textarea for validation", () => {
      const html = getComposerHtml(
        mockWebview,
        { title: "Test" },
        "nonce-123"
      );
      assert.ok(html.includes("textarea.addEventListener('input', validate);"));
    });

    test("should reference submitButton element in script", () => {
      const html = getComposerHtml(
        mockWebview,
        { title: "Test" },
        "nonce-123"
      );
      assert.ok(html.includes("const submitButton = document.getElementById('submit');"));
    });

    test("should include disabled button styles", () => {
      const html = getComposerHtml(
        mockWebview,
        { title: "Test" },
        "nonce-123"
      );
      assert.ok(html.includes('button:disabled {'));
      assert.ok(html.includes('opacity: 0.5;'));
      assert.ok(html.includes('cursor: not-allowed;'));
    });

    test("should include secondary button hover styles", () => {
      const html = getComposerHtml(
        mockWebview,
        { title: "Test" },
        "nonce-123"
      );
      assert.match(
        html,
        /button:not\(\.primary\):hover\s*{\s*background:\s*var\(--vscode-button-secondaryHoverBackground\);\s*}/
      );
    });

    test("validation logic should work with empty initial value", () => {
      const html = getComposerHtml(
        mockWebview,
        { title: "Test", value: "" },
        "nonce-123"
      );
      // Should call validate() at the end which will disable the button
      assert.ok(html.includes('validate();'));
      assert.ok(html.includes('textarea.value.trim().length > 0'));
    });

    test("validation logic should work with whitespace-only initial value", () => {
      const html = getComposerHtml(
        mockWebview,
        { title: "Test", value: "   \n\t  " },
        "nonce-123"
      );
      // The value will be escaped but validation should use trim()
      assert.ok(html.includes('textarea.value.trim().length > 0'));
    });

    test("validation logic should work with valid initial value", () => {
      const html = getComposerHtml(
        mockWebview,
        { title: "Test", value: "Valid input" },
        "nonce-123"
      );
      assert.ok(html.includes('>Valid input</textarea>'));
      assert.ok(html.includes('validate();'));
    });

    test("should not allow keyboard shortcut submission when validation fails", () => {
      const html = getComposerHtml(
        mockWebview,
        { title: "Test" },
        "nonce-123"
      );
      // Find the keydown handler
      const keydownIndex = html.indexOf("textarea.addEventListener('keydown'");
      assert.ok(keydownIndex > 0);
      
      // Check that Cmd+Enter handler validates before submitting
      const cmdEnterIndex = html.indexOf("if ((event.metaKey || event.ctrlKey) && event.key === 'Enter')", keydownIndex);
      const validateBeforeSubmitIndex = html.indexOf('if (validate()) {', cmdEnterIndex);
      const submitCallIndex = html.indexOf('submit();', validateBeforeSubmitIndex);
      
      assert.ok(cmdEnterIndex > 0);
      assert.ok(validateBeforeSubmitIndex > cmdEnterIndex);
      assert.ok(submitCallIndex > validateBeforeSubmitIndex);
    });

    test("should preserve Escape key handler for cancellation", () => {
      const html = getComposerHtml(
        mockWebview,
        { title: "Test" },
        "nonce-123"
      );
      assert.ok(html.includes("else if (event.key === 'Escape')"));
      assert.ok(html.includes("vscode.postMessage({ type: 'cancel' });"));
    });

    test("validation should work with checkboxes present", () => {
      const html = getComposerHtml(
        mockWebview,
        { 
          title: "Test",
          showCreatePrCheckbox: true,
          showRequireApprovalCheckbox: true
        },
        "nonce-123"
      );
      assert.ok(html.includes("const createPrCheckbox = document.getElementById('create-pr');"));
      assert.ok(html.includes("const requireApprovalCheckbox = document.getElementById('require-approval');"));
      assert.ok(html.includes('const validate = () => {'));
      assert.ok(html.includes('textarea.value.trim().length > 0'));
    });

    test("should structure validation check before postMessage in submit function", () => {
      const html = getComposerHtml(
        mockWebview,
        { title: "Test" },
        "nonce-123"
      );
      // Find the submit function
      const submitFnIndex = html.indexOf('const submit = () => {');
      const validationCheckIndex = html.indexOf('if (!validate()) {', submitFnIndex);
      const returnIndex = html.indexOf('return;', validationCheckIndex);
      const postMessageIndex = html.indexOf('vscode.postMessage({', returnIndex);
      
      assert.ok(submitFnIndex > 0, 'Should have submit function');
      assert.ok(validationCheckIndex > submitFnIndex, 'Should check validation in submit');
      assert.ok(returnIndex > validationCheckIndex, 'Should return early if invalid');
      assert.ok(postMessageIndex > returnIndex, 'Should postMessage only after validation passes');
    });

    test("should include complete validation flow in correct order", () => {
      const html = getComposerHtml(
        mockWebview,
        { title: "Test" },
        "nonce-123"
      );
      
      // Check order of key elements
      const textareaDefIndex = html.indexOf("const textarea = document.getElementById('message');");
      const submitButtonDefIndex = html.indexOf("const submitButton = document.getElementById('submit');");
      const validateDefIndex = html.indexOf('const validate = () => {');
      const submitDefIndex = html.indexOf('const submit = () => {');
      const inputListenerIndex = html.indexOf("textarea.addEventListener('input', validate);");
      const validateCallIndex = html.lastIndexOf('validate();');
      
      assert.ok(textareaDefIndex > 0, 'Should define textarea');
      assert.ok(submitButtonDefIndex > textareaDefIndex, 'Should define submitButton after textarea');
      assert.ok(validateDefIndex > submitButtonDefIndex, 'Should define validate function');
      assert.ok(submitDefIndex > validateDefIndex, 'Should define submit function after validate');
      assert.ok(inputListenerIndex > submitDefIndex, 'Should attach input listener');
      assert.ok(validateCallIndex > inputListenerIndex, 'Should call validate at end');
    });

    test("should handle edge case of single space character", () => {
      const html = getComposerHtml(
        mockWebview,
        { title: "Test", value: " " },
        "nonce-123"
      );
      // Validation uses trim(), so single space should be invalid
      assert.ok(html.includes('textarea.value.trim().length > 0'));
    });

    test("should handle edge case of tabs and newlines only", () => {
      const html = getComposerHtml(
        mockWebview,
        { title: "Test", value: "\t\n\r" },
        "nonce-123"
      );
      // Validation uses trim(), which should remove all whitespace
      assert.ok(html.includes('textarea.value.trim().length > 0'));
    });

    test("should properly handle validation with special characters in value", () => {
      const html = getComposerHtml(
        mockWebview,
        { title: "Test", value: "<script>alert('xss')</script>" },
        "nonce-123"
      );
      // Value should be escaped but validation logic should still work
      assert.ok(html.includes('&lt;script&gt;'));
      assert.ok(html.includes('textarea.value.trim().length > 0'));
      assert.ok(html.includes('validate();'));
    });

    test("should include nonce in all script and style tags", () => {
      const testNonce = "test-nonce-12345";
      const html = getComposerHtml(
        mockWebview,
        { title: "Test" },
        testNonce
      );
      assert.ok(html.includes(`<style nonce="${testNonce}">`));
      assert.ok(html.includes(`<script nonce="${testNonce}">`));
    });

    test("should set submitButton disabled state based on validation result", () => {
      const html = getComposerHtml(
        mockWebview,
        { title: "Test" },
        "nonce-123"
      );
      // The validate function should set submitButton.disabled
      assert.ok(html.includes('submitButton.disabled = !isValid;'));
    });

    test("should prevent default on Cmd/Ctrl+Enter before validation", () => {
      const html = getComposerHtml(
        mockWebview,
        { title: "Test" },
        "nonce-123"
      );
      const cmdEnterIndex = html.indexOf("if ((event.metaKey || event.ctrlKey) && event.key === 'Enter')");
      const preventDefaultIndex = html.indexOf('event.preventDefault();', cmdEnterIndex);
      const validateIndex = html.indexOf('if (validate()) {', preventDefaultIndex);
      
      assert.ok(preventDefaultIndex > cmdEnterIndex);
      assert.ok(validateIndex > preventDefaultIndex);
    });

    test("should return validation result from validate function", () => {
      const html = getComposerHtml(
        mockWebview,
        { title: "Test" },
        "nonce-123"
      );
      const validateIndex = html.indexOf('const validate = () => {');
      const returnIndex = html.indexOf('return isValid;', validateIndex);
      
      assert.ok(validateIndex > 0);
      assert.ok(returnIndex > validateIndex);
    });

    test("should use correct validation threshold of greater than 0", () => {
      const html = getComposerHtml(
        mockWebview,
        { title: "Test" },
        "nonce-123"
      );
      // Should use > 0, not >= 0 or > 1
      assert.ok(html.includes('textarea.value.trim().length > 0'));
      assert.ok(!html.includes('textarea.value.trim().length >= 1'));
    });

    test("should validate empty string value correctly", () => {
      const html = getComposerHtml(
        mockWebview,
        { title: "Test", value: "" },
        "nonce-123"
      );
      assert.ok(html.includes('></textarea>'));
      assert.ok(html.includes('validate();'));
    });

    test("should have submitButton click listener use submit function", () => {
      const html = getComposerHtml(
        mockWebview,
        { title: "Test" },
        "nonce-123"
      );
      assert.ok(html.includes("submitButton.addEventListener('click', submit);"));
    });

    test("validation should not interfere with cancel button functionality", () => {
      const html = getComposerHtml(
        mockWebview,
        { title: "Test" },
        "nonce-123"
      );
      assert.ok(html.includes("document.getElementById('cancel').addEventListener('click', () => {"));
      assert.ok(html.includes("vscode.postMessage({ type: 'cancel' });"));
      // Cancel should not call validate
      const cancelIndex = html.indexOf("document.getElementById('cancel')");
      const nextValidateIndex = html.indexOf('validate()', cancelIndex);
      const cancelEndIndex = html.indexOf('});', cancelIndex);
      assert.ok(nextValidateIndex < 0 || nextValidateIndex > cancelEndIndex);
    });

    test("should show loading state on submit", () => {
      const html = getComposerHtml(
        mockWebview,
        { title: "Test" },
        "nonce-123"
      );
      // Check for loading state logic
      assert.ok(html.includes("submitButton.innerText = 'Sending...';"));
      assert.ok(html.includes("submitButton.disabled = true;"));
      assert.ok(html.includes("textarea.disabled = true;"));
      assert.ok(html.includes("document.getElementById('cancel').disabled = true;"));
      assert.ok(html.includes("document.body.style.cursor = 'wait';"));
    });

    test("should disable checkboxes in loading state when present", () => {
      const html = getComposerHtml(
        mockWebview,
        { title: "Test", showCreatePrCheckbox: true, showRequireApprovalCheckbox: true },
        "nonce-123"
      );
      assert.ok(html.includes("if (createPrCheckbox) createPrCheckbox.disabled = true;"));
      assert.ok(html.includes("if (requireApprovalCheckbox) requireApprovalCheckbox.disabled = true;"));
    });
  });
});
