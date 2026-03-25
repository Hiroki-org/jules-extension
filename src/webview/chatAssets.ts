export const CHAT_CSS = `
* { box-sizing: border-box; }
body { margin: 0; padding: 10px; color: var(--vscode-editor-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); height: 100vh; display: flex; flex-direction: column; gap: 10px; }
#chat { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; padding-right: 2px; }
.message { display: flex; flex-direction: column; max-width: 92%; animation: slide-in .18s ease-out; gap: 4px; }
.message.user { margin-left: auto; align-items: flex-end; }
.message.assistant { margin-right: auto; align-items: flex-start; }
.bubble { border: 1px solid var(--vscode-widget-border, transparent); border-radius: 12px; padding: 10px 12px; backdrop-filter: blur(8px); box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12); line-height: 1.5; overflow-wrap: anywhere; }
.user .bubble { background: color-mix(in srgb, var(--vscode-button-background) 28%, transparent); border-color: var(--vscode-button-background); }
.assistant .bubble { background: color-mix(in srgb, var(--vscode-editorHoverWidget-background) 75%, transparent); }
.meta { color: var(--vscode-descriptionForeground); font-size: 11px; padding: 0 4px; }
blockquote { margin: 8px 0; border-left: 3px solid var(--vscode-textBlockQuote-border); padding-left: 10px; color: var(--vscode-textBlockQuote-foreground); background: color-mix(in srgb, var(--vscode-editorHoverWidget-background) 35%, transparent); border-radius: 6px; }
ul, ol { padding-left: 18px; margin: 6px 0; }
p { margin: 0 0 8px; }
.code-block { position: relative; margin: 8px 0; }
.code-block pre { margin: 0; padding: 10px; border-radius: 8px; background: var(--vscode-textCodeBlock-background); overflow-x: auto; border: 1px solid var(--vscode-widget-border, transparent); }
.code-block code { font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size); }
.copy-code-button { position: absolute; top: 6px; right: 6px; opacity: 0; transition: opacity .15s ease; border: 1px solid var(--vscode-button-border, transparent); background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 11px; }
.code-block:hover .copy-code-button, .copy-code-button:focus-visible { opacity: 1; }
.copy-code-button:hover { background: var(--vscode-button-secondaryHoverBackground); }
.copy-code-button:active { transform: scale(0.96); }
@keyframes slide-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
.typing { display: none; align-items: center; gap: 4px; color: var(--vscode-descriptionForeground); font-size: 12px; font-style: italic; padding: 0 8px 8px; }
.typing.visible { display: flex; }
.typing-dot { width: 4px; height: 4px; background: currentColor; border-radius: 50%; animation: typing 1.4s infinite ease-in-out both; }
.typing-dot:nth-child(2) { animation-delay: -0.32s; }
.typing-dot:nth-child(3) { animation-delay: -0.16s; }
@keyframes typing { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }
#composer { display: flex; flex-direction: column; gap: 8px; padding: 12px; background: var(--vscode-editor-background); border-top: 1px solid var(--vscode-widget-border, transparent); }
#messageInput { width: 100%; min-height: 40px; max-height: 120px; resize: vertical; padding: 8px 12px; border: 1px solid var(--vscode-input-border, transparent); background: var(--vscode-input-background); color: var(--vscode-input-foreground); font-family: inherit; font-size: var(--vscode-editor-font-size); border-radius: 6px; outline: none; }
#messageInput:focus-visible { border-color: var(--vscode-focusBorder); }
.composer-actions { display: flex; justify-content: space-between; align-items: center; }
.session-label { color: var(--vscode-descriptionForeground); font-size: 11px; user-select: none; }
#sendButton { padding: 6px 16px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; cursor: pointer; font-weight: 500; }
#sendButton:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }
#sendButton:disabled { opacity: 0.5; cursor: not-allowed; }
.activity-log { font-size: 0.9em; opacity: 0.75; margin-bottom: 2px; }
.activity-details { margin-top: 4px; font-size: 0.9em; }
.activity-details summary { cursor: pointer; user-select: none; font-weight: 600; opacity: 0.8; padding: 2px 0; outline: none; }
.activity-details summary:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }
.activity-details summary:hover { opacity: 1; text-decoration: underline; }
.details-content { margin-top: 6px; padding: 10px; background: var(--vscode-editor-background); border: 1px solid var(--vscode-widget-border); border-radius: 6px; max-height: 350px; overflow-y: auto; }
.details-content pre { margin: 0; white-space: pre-wrap; word-break: break-all; }
`;

export const CHAT_JS = `(function() {
  const vscode = typeof acquireVsCodeApi === "function"
    ? acquireVsCodeApi()
    : { postMessage: (m) => console.warn("VSCode API unavailable", m) };

  const chatContainer = document.getElementById("chat");
  const typingIndicator = document.getElementById("typing");
  const messageInput = document.getElementById("messageInput");
  const sendButton = document.getElementById("sendButton");
  const sessionLabel = document.getElementById("sessionLabel");

  let state = { sessionId: null, messages: [], isTyping: false };

  function updateUI() {
    const hasSession = !!state.sessionId;
    sendButton.disabled = !hasSession || messageInput.value.trim().length === 0;
    sessionLabel.textContent = hasSession ? "Session: " + state.sessionId : "Session: None selected";
  }

  function formatTime(timestamp) {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    return isNaN(date.getTime()) ? "" : date.toLocaleString();
  }

  function renderMessages() {
    chatContainer.innerHTML = state.messages.map(m => \`
      <div class="message \${m.role}">
        <div class="bubble">\${m.html}</div>
        <div class="meta">\${formatTime(m.createTime)}</div>
      </div>
    \`).join("");
    typingIndicator.classList.toggle("visible", !!state.isTyping);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    updateUI();
  }

  messageInput.addEventListener("input", updateUI);
  messageInput.addEventListener("keydown", e => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      if (!sendButton.disabled) {
        const text = messageInput.value.trim();
        vscode.postMessage({ type: "sendMessage", sessionId: state.sessionId, text });
        messageInput.value = "";
        updateUI();
      }
    }
  });

  document.getElementById("composer").addEventListener("submit", e => {
    e.preventDefault();
    const text = messageInput.value.trim();
    if (state.sessionId && text) {
      vscode.postMessage({ type: "sendMessage", sessionId: state.sessionId, text });
      messageInput.value = "";
      updateUI();
    }
  });

  chatContainer.addEventListener("click", async e => {
    const copyButton = e.target.closest(".copy-code-button");
    if (!copyButton) return;
    const code = copyButton.closest(".code-block").querySelector("code").innerText;
    try {
      await navigator.clipboard.writeText(code);
      const originalText = copyButton.textContent;
      copyButton.textContent = "Copied";
      setTimeout(() => copyButton.textContent = originalText, 1200);
    } catch {
      copyButton.textContent = "Failed";
    }
  });

  window.addEventListener("message", e => {
    if (e.data.type === "chatState") {
      state = e.data.payload || state;
      renderMessages();
    }
  });

  vscode.postMessage({ type: "requestInitialState" });
})();`;
