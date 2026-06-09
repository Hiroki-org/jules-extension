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
.copy-code-button:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }
.copy-code-button:active { transform: scale(0.96); }
@keyframes slide-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
.typing { display: none; align-items: center; gap: 4px; color: var(--vscode-descriptionForeground); font-size: 12px; font-style: italic; padding: 0 8px 8px; }
.typing.visible { display: flex; }
.typing-dot { width: 4px; height: 4px; background: currentColor; border-radius: 50%; animation: typing 1.4s infinite ease-in-out both; }
.typing-dot:nth-child(2) { animation-delay: -0.32s; }
.typing-dot:nth-child(3) { animation-delay: -0.16s; }
@keyframes typing { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }
#composer { display: flex; flex-direction: column; gap: 8px; padding: 12px; background: var(--vscode-editor-background); border-top: 1px solid var(--vscode-widget-border, transparent); }
#messageInput { width: 100%; min-height: 40px; max-height: 120px; resize: none; overflow-y: auto; padding: 8px 12px; border: 1px solid var(--vscode-input-border, transparent); background: var(--vscode-input-background); color: var(--vscode-input-foreground); font-family: inherit; font-size: var(--vscode-editor-font-size); border-radius: 6px; outline: none; box-sizing: border-box; }
#messageInput:focus-visible { border-color: var(--vscode-focusBorder); }
#messageInput:disabled { opacity: 0.6; cursor: not-allowed; resize: none; }
.composer-actions { display: flex; justify-content: space-between; align-items: center; }
.session-label { color: var(--vscode-descriptionForeground); font-size: 11px; user-select: none; max-width: 70%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#sendButton { padding: 6px 16px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; cursor: pointer; font-weight: 500; }
#sendButton:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }
#sendButton:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }
#sendButton:disabled { opacity: 0.5; cursor: not-allowed; }
.activity-log { font-size: 0.9em; opacity: 0.75; margin-bottom: 2px; }
.activity-details { margin-top: 4px; font-size: 0.9em; }
.activity-details summary { cursor: pointer; user-select: none; font-weight: 600; opacity: 0.8; padding: 2px 0; outline: none; }
.activity-details summary:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }
.activity-details summary:hover { opacity: 1; text-decoration: underline; }
.details-content { margin-top: 6px; padding: 10px; background: var(--vscode-editor-background); border: 1px solid var(--vscode-widget-border); border-radius: 6px; max-height: 350px; overflow-y: auto; }
.details-content pre { margin: 0; white-space: pre-wrap; word-break: break-all; }
details[aria-busy="true"] .details-content { animation: pulse 1.5s infinite; opacity: 0.7; }
@keyframes pulse { 0%, 100% { opacity: 0.7; } 50% { opacity: 0.4; } }
@media (prefers-reduced-motion: reduce) { details[aria-busy="true"] .details-content { animation: none; opacity: 0.7; } }
.message-unavailable { opacity: 0.75; font-style: italic; }
.shiki { background-color: transparent !important; }
.shiki span { color: var(--shiki-light); }
[data-vscode-theme-kind="vscode-dark"] .shiki span { color: var(--shiki-dark); }
[data-vscode-theme-kind="vscode-high-contrast"] .shiki span { color: var(--shiki-dark); }
.empty-state { margin: auto; text-align: center; color: var(--vscode-descriptionForeground); padding: 20px; font-size: var(--vscode-editor-font-size); max-width: 80%; display: flex; flex-direction: column; align-items: center; justify-content: center; opacity: 0; animation: fade-in 0.3s ease-out forwards; animation-delay: 0.1s; }
.empty-state h3 { font-size: 16px; margin: 0 0 8px 0; color: var(--vscode-editor-foreground); font-weight: 500; }
.empty-state p { margin: 0; line-height: 1.4; }
@keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .empty-state { animation: none; opacity: 1; } }
`;

export const CHAT_JS = `(function() {
  const vscode = typeof acquireVsCodeApi === "function"
    ? acquireVsCodeApi()
    : { postMessage: (m) => console.warn("VSCode API unavailable", m) };

  const chatContainer = document.getElementById("chat");
  chatContainer.setAttribute("aria-live", "polite");
  chatContainer.setAttribute("aria-atomic", "true");
  const typingIndicator = document.getElementById("typing");
  const messageInput = document.getElementById("messageInput");
  const sendButton = document.getElementById("sendButton");
  const sessionLabel = document.getElementById("sessionLabel");
  const DETAILS_BUSY_TIMEOUT_MS = 15000;

  let state = { sessionId: null, messages: [], isTyping: false };
  let detailsCache = {}; // "activityId|detailType|index" -> html
  let expandedDetails = new Set(); // set of "activityId|detailType|index"
  let detailsBusyTimeouts = {}; // "activityId|detailType|index" -> timeout id

  const DOMPURIFY_ALLOWED_URI_REGEXP = /^(?:(?:https?|mailto|tel|callto|sms|cid|xmpp|vscode-webview-resource):|(?![a-z][a-z0-9+.-]*:))/i;
  const SANITIZATION_FAILURE_HTML = '<span class="message-unavailable" role="status" aria-label="Message unavailable">Message unavailable</span>';
  const SANITIZED_HTML_CACHE_LIMIT = 500;
  const sanitizedHtmlCache = new Map();

  function createSanitizeConfig(overrides) {
    return Object.assign({
      ALLOWED_URI_REGEXP: DOMPURIFY_ALLOWED_URI_REGEXP,
      ADD_TAGS: ["details", "summary"],
      ADD_ATTR: ["data-activity-id", "data-detail-type", "data-index"],
      RETURN_DOM: false,
      RETURN_DOM_FRAGMENT: false,
      USE_PROFILES: { html: true, svg: true, math: false },
    }, overrides || {});
  }

  function rememberSanitizedHtml(html, sanitizedHtml) {
    return sanitizedHtml;
  }

  function sanitizeHtml(html) {
    const rawHtml = typeof html === "string" ? html : "";
    if (typeof DOMPurify === "undefined") {
      const fragment = document.createDocumentFragment();
      fragment.appendChild(createUnavailableNode());
      return fragment;
    }
    try {
      return DOMPurify.sanitize(rawHtml, createSanitizeConfig({ RETURN_DOM_FRAGMENT: true }));
    } catch (error) {
      console.error("Jules: Failed to sanitize chat HTML", error);
      const fragment = document.createDocumentFragment();
      fragment.appendChild(createUnavailableNode());
      return fragment;
    }
  }

  function createUnavailableNode() {
    const node = document.createElement("span");
    node.className = "message-unavailable";
    node.setAttribute("role", "status");
    node.setAttribute("aria-label", "Message unavailable");
    node.textContent = "Message unavailable";
    return node;
  }

  function replaceChildren(element, nodes) {
    if (typeof element.replaceChildren === "function") {
      element.replaceChildren(...nodes);
      return;
    }
    element.textContent = "";
    nodes.forEach(node => element.appendChild(node));
  }

  function renderSanitizedDetailsHtml(contentDiv, html) {
    const rawHtml = typeof html === "string" ? html : "";
    if (typeof DOMPurify === "undefined") {
      replaceChildren(contentDiv, [createUnavailableNode()]);
      return;
    }
    try {
      const fragment = DOMPurify.sanitize(rawHtml, createSanitizeConfig({
        RETURN_DOM_FRAGMENT: true,
      }));
      if (fragment && typeof fragment === "object" && "childNodes" in fragment) {
        replaceChildren(contentDiv, Array.from(fragment.childNodes));
        return;
      }
    } catch (error) {
      console.error("Jules: Failed to sanitize details HTML", error);
    }
    replaceChildren(contentDiv, [createUnavailableNode()]);
  }

  function getDetailsKey(details) {
    const activityId = details.getAttribute("data-activity-id");
    const detailType = details.getAttribute("data-detail-type");
    if (!activityId || !detailType) {
      return "";
    }
    return activityId + "|" + detailType + "|" + (details.getAttribute("data-index") || "");
  }

  function hasDetailsCache(key) {
    return Object.prototype.hasOwnProperty.call(detailsCache, key);
  }

  function clearDetailsBusyTimeout(key) {
    if (detailsBusyTimeouts[key]) {
      clearTimeout(detailsBusyTimeouts[key]);
      delete detailsBusyTimeouts[key];
    }
  }

  function findDetailsByKey(key) {
    const parts = key.split("|");
    const activityId = parts[0];
    const detailType = parts[1];
    const indexStr = parts.slice(2).join("|");
    return Array.from(chatContainer.querySelectorAll("details.activity-details")).find(details =>
      details.getAttribute("data-activity-id") === activityId &&
      details.getAttribute("data-detail-type") === detailType &&
      (details.getAttribute("data-index") || "") === indexStr,
    );
  }

  function markDetailsBusy(key, details) {
    clearDetailsBusyTimeout(key);
    details.setAttribute("aria-busy", "true");
    detailsBusyTimeouts[key] = setTimeout(() => {
      const currentDetails = findDetailsByKey(key);
      if (currentDetails) {
        currentDetails.setAttribute("aria-busy", "false");
      }
      delete detailsBusyTimeouts[key];
    }, DETAILS_BUSY_TIMEOUT_MS);
  }

  function clearDetailsBusy(key, details) {
    clearDetailsBusyTimeout(key);
    details.setAttribute("aria-busy", "false");
  }

  function renderCachedDetails(details, key) {
    if (!hasDetailsCache(key)) {
      return;
    }
    const contentDiv = details.querySelector(".details-content");
    if (contentDiv) {
      renderSanitizedDetailsHtml(contentDiv, detailsCache[key]);
    }
  }

  function restoreExpandedDetails() {
    chatContainer.querySelectorAll("details.activity-details").forEach(details => {
      const key = getDetailsKey(details);
      if (!key || !expandedDetails.has(key)) {
        return;
      }
      details.open = true;
      if (hasDetailsCache(key)) {
        clearDetailsBusy(key, details);
        renderCachedDetails(details, key);
      } else if (detailsBusyTimeouts[key]) {
        details.setAttribute("aria-busy", "true");
      }
    });
  }

  function updateUI() {
    const hasSession = !!state.sessionId;
    const hasText = messageInput.value.trim().length > 0;

    const sendDisabled = !hasSession || !hasText;
    sendButton.disabled = sendDisabled;
    
    messageInput.disabled = !hasSession;

    if (!hasSession) {
      messageInput.value = "";
      messageInput.style.height = "auto";
    }

    messageInput.placeholder = hasSession
      ? "Enter message (Ctrl/Cmd+Enter to send)"
      : "Select a session to start typing";
    messageInput.setAttribute("aria-label", messageInput.placeholder);
    messageInput.title = messageInput.placeholder;

    if (!hasSession) {
      sendButton.title = "Select a session to send a message";
      sendButton.setAttribute("aria-label", "Send (Select a session to send a message)");
    } else if (!hasText) {
      sendButton.title = "Type a message to send";
      sendButton.setAttribute("aria-label", "Send (Type a message to send)");
    } else {
      sendButton.title = "Send message (Ctrl/Cmd+Enter)";
      sendButton.setAttribute("aria-label", "Send message (Ctrl/Cmd+Enter)");
    }

    const sessionText = hasSession ? "Session: " + state.sessionId : "Session: None selected";
    sessionLabel.textContent = sessionText;
    sessionLabel.title = sessionText;
  }

  function formatTime(timestamp) {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    return isNaN(date.getTime()) ? "" : date.toLocaleString();
  }

  function renderMessages() {
    if (state.messages.length === 0 && !state.isTyping) {
      if (!chatContainer.querySelector('.empty-state')) {
        const emptyStateDiv = document.createElement("div");
        emptyStateDiv.className = "empty-state";

        const h3 = document.createElement("h3");
        h3.textContent = state.sessionId ? "Ready to assist" : "Welcome to Jules";

        const p = document.createElement("p");
        p.textContent = state.sessionId
          ? "Type a message to start interacting with Jules."
          : "Select a session or create a new one to begin.";

        emptyStateDiv.appendChild(h3);
        emptyStateDiv.appendChild(p);
        replaceChildren(chatContainer, [emptyStateDiv]);
      }
    } else {
      const nodes = state.messages.map(m => {
        const messageDiv = document.createElement("div");
        messageDiv.className = "message " + (m.role === "user" ? "user" : "assistant");

        const bubbleDiv = document.createElement("div");
        bubbleDiv.className = "bubble";

        const fragment = sanitizeHtml(m.html);
        if (fragment && fragment.childNodes) {
            Array.from(fragment.childNodes).forEach(node => bubbleDiv.appendChild(node));
        }

        const metaDiv = document.createElement("div");
        metaDiv.className = "meta";
        metaDiv.textContent = formatTime(m.createTime);

        messageDiv.appendChild(bubbleDiv);
        messageDiv.appendChild(metaDiv);
        return messageDiv;
      });
      replaceChildren(chatContainer, nodes);
      restoreExpandedDetails();
    }
    typingIndicator.classList.toggle("visible", !!state.isTyping);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    updateUI();
  }

  messageInput.addEventListener("input", () => {
    messageInput.style.height = "auto";
    const computed = window.getComputedStyle(messageInput);
    const borderY = parseFloat(computed.borderTopWidth) + parseFloat(computed.borderBottomWidth);
    messageInput.style.height = (messageInput.scrollHeight + (isNaN(borderY) ? 0 : borderY)) + "px";
    updateUI();
  });

  messageInput.addEventListener("keydown", e => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      if (!sendButton.disabled) {
        const text = messageInput.value.trim();
        vscode.postMessage({ type: "sendMessage", sessionId: state.sessionId, text });
        messageInput.value = "";
        messageInput.style.height = "auto";
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
      messageInput.style.height = "auto";
      updateUI();
    }
  });

  chatContainer.addEventListener("toggle", e => {
    const details = e.target;
    if (details.tagName === "DETAILS" && details.classList.contains("activity-details")) {
      const activityId = details.getAttribute("data-activity-id");
      const detailType = details.getAttribute("data-detail-type");

      if (activityId && detailType) {
        const indexStr = details.getAttribute("data-index");
        const index = indexStr ? parseInt(indexStr, 10) : undefined;
        const key = activityId + "|" + detailType + "|" + (indexStr || "");

        if (details.open) {
          expandedDetails.add(key);
          if (!hasDetailsCache(key)) {
            if (!detailsBusyTimeouts[key]) {
              markDetailsBusy(key, details);
              vscode.postMessage({ type: "requestDetails", activityId, detailType, index });
            } else {
              details.setAttribute("aria-busy", "true");
            }
          } else {
            clearDetailsBusy(key, details);
            renderCachedDetails(details, key);
          }
        } else {
          clearDetailsBusy(key, details);
          expandedDetails.delete(key);
        }
      }
    }
  }, true); // use capture phase for toggle events on non-bubbling elements

  chatContainer.addEventListener("click", async e => {
    const copyButton = e.target.closest(".copy-code-button");
    if (!copyButton || copyButton.hasAttribute("data-copy-feedback-active")) return;
    copyButton.setAttribute("data-copy-feedback-active", "true");

    const code = copyButton.closest(".code-block").querySelector("code").innerText;
    const originalText = copyButton.textContent;
    const originalTitle = copyButton.title;
    const originalAriaLabel = copyButton.getAttribute("aria-label");

    function setButtonState(text) {
      copyButton.textContent = text;
      copyButton.title = text;
      copyButton.setAttribute("aria-label", text);
    }

    function restoreButtonState() {
      copyButton.textContent = originalText;
      if (originalTitle) { copyButton.title = originalTitle; } else { copyButton.removeAttribute("title"); }
      if (originalAriaLabel) { copyButton.setAttribute("aria-label", originalAriaLabel); } else { copyButton.removeAttribute("aria-label"); }
      copyButton.removeAttribute("data-copy-feedback-active");
    }

    try {
      await navigator.clipboard.writeText(code);
      setButtonState("Copied");
      setTimeout(restoreButtonState, 1200);
    } catch {
      setButtonState("Failed");
      setTimeout(restoreButtonState, 1200);
    }
  });

  window.addEventListener("message", e => {
    if (e.data.type === "chatState") {
      state = e.data.payload || state;
      renderMessages();
    } else if (e.data.type === "detailsHtml") {
      const { activityId, detailType, index, html } = e.data;
      const key = activityId + "|" + detailType + "|" + (index !== undefined ? index : "");
      detailsCache[key] = html;

      // Update DOM if currently rendered
      const detailsEls = chatContainer.querySelectorAll('[data-activity-id="' + activityId + '"][data-detail-type="' + detailType + '"]');
      detailsEls.forEach(details => {
        const elIndex = details.getAttribute("data-index") || "";
        const msgIndex = index !== undefined ? String(index) : "";
        if (elIndex === msgIndex) {
          clearDetailsBusy(key, details);
          const contentDiv = details.querySelector(".details-content");
          if (contentDiv) {
            renderSanitizedDetailsHtml(contentDiv, html);
          }
        }
      });
    }
  });

  vscode.postMessage({ type: "requestInitialState" });
  updateUI();
})();`;
