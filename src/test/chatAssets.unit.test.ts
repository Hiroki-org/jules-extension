import * as assert from "assert";
import { CHAT_CSS, CHAT_JS } from "../webview/chatAssets";

function approximateTextContent(html: string): string {
  let text = "";
  let insideTag = false;

  for (const char of html) {
    if (char === "<") {
      insideTag = true;
      continue;
    }
    if (char === ">") {
      insideTag = false;
      continue;
    }
    if (!insideTag) {
      text += char;
    }
  }

  return text;
}

function createMockClassList(owner: { className?: string }) {
  const readClasses = () =>
    new Set(String(owner.className ?? "").split(/\s+/).filter(Boolean));
  const writeClasses = (classes: Set<string>) => {
    owner.className = Array.from(classes).join(" ");
  };

  return {
    add: (...tokens: string[]) => {
      const classes = readClasses();
      tokens.forEach((token) => classes.add(token));
      writeClasses(classes);
    },
    remove: (...tokens: string[]) => {
      const classes = readClasses();
      tokens.forEach((token) => classes.delete(token));
      writeClasses(classes);
    },
    toggle: (token: string, force?: boolean) => {
      const classes = readClasses();
      const shouldAdd = force ?? !classes.has(token);
      if (shouldAdd) {
        classes.add(token);
      } else {
        classes.delete(token);
      }
      writeClasses(classes);
      return shouldAdd;
    },
    contains: (token: string) => readClasses().has(token),
    toString: () => String(owner.className ?? ""),
  };
}

function createChatScriptHarness(
  domPurify?: { sanitize: (html: string, config: any) => any },
  computedStyle = { borderTopWidth: "1px", borderBottomWidth: "1px" },
) {
  let chatInnerHTML = "";
  let chatInnerHTMLSetCount = 0;
  const chatAttributes: Record<string, string> = {};
  const emptyStateStatusAttributes: Record<string, string> = {
    role: "status",
    "aria-live": "polite",
    "aria-atomic": "true",
  };
  const listeners: Record<string, Record<string, any>> = {
    chat: {},
    messageInput: {},
    composer: {},
  };
  const elements: Record<string, any> = {
    chat: {
      childNodes: [] as any[],
      replaceChildren: function(...nodes: any[]) {
        this.childNodes = nodes;
        chatInnerHTMLSetCount += 1;
        chatInnerHTML = nodes.map((n: any) => typeof n === "string" ? n : n.outerHTML || (n.nodeType === 3 ? n.textContent : (n.innerHTML || n.textContent || ""))).join("");
      },
      get innerHTML() { return chatInnerHTML; },
      set innerHTML(value: string) {
        chatInnerHTMLSetCount += 1;
        chatInnerHTML = value;
      },
      get innerHTMLSetCount() { return chatInnerHTMLSetCount; },
      scrollTop: 0,
      scrollHeight: 0,
      setAttribute: (name: string, value: string) => { chatAttributes[name] = value; },
      getAttribute: (name: string) => chatAttributes[name] ?? null,
      addEventListener: (evt: string, cb: any) => { listeners.chat[evt] = cb; },
      querySelector: (selector: string) => {
        if (selector !== ".empty-state" || !chatInnerHTML.includes('class="empty-state"')) {
          return null;
        }
        return {
          textContent: approximateTextContent(chatInnerHTML),
        };
      },
      querySelectorAll: () => [],
    },
    emptyStateStatus: {
      textContent: "",
      setAttribute: (name: string, value: string) => {
        emptyStateStatusAttributes[name] = value;
      },
      getAttribute: (name: string) => emptyStateStatusAttributes[name] ?? null,
    },
    typing: { classList: { toggle: () => {} } },
    messageInput: {
      value: "",
      disabled: false,
      placeholder: "",
      style: { height: "" },
      scrollHeight: 0,
      setAttribute: function(k: string, v: string) { (this as any)[k] = v; },
      addEventListener: (evt: string, cb: any) => { listeners.messageInput[evt] = cb; },
    },
    sendButton: {
      disabled: false,
      title: "",
      setAttribute: function(k: string, v: string) { (this as any)[k] = v; },
      addEventListener: () => {},
    },
    sessionLabel: { textContent: "" },
    composer: { addEventListener: (evt: string, cb: any) => { listeners.composer[evt] = cb; } },
  };
  const messageListeners: Array<(event: { data: any }) => void> = [];
  const mockDocument = {
    getElementById: (id: string) => elements[id],
    createElement: (tag: string) => {
      const attributes: Record<string, string> = {};
      const el: any = {
        tag,
        tagName: tag.toUpperCase(),
        nodeType: 1,
        className: "",
        textContent: "",
        style: {},
        childNodes: [],
      };
      el.classList = createMockClassList(el);
      el.setAttribute = function(k: string, v: string) {
        attributes[k] = v;
        if (k === "class") {
          this.className = v;
        } else {
          (this as any)[k] = v;
        }
      };
      el.getAttribute = function(k: string) {
        return attributes[k] ?? (this as any)[k] ?? null;
      };
      el.removeAttribute = function(k: string) {
        delete attributes[k];
        delete (this as any)[k];
      };
      el.appendChild = function(child: any) { this.childNodes.push(child); if (child) { child.parentNode = this; } };
      el.cloneNode = function(deep = false) {
        const clone: any = mockDocument.createElement(tag);
        clone.className = this.className;
        clone.textContent = this.textContent;
        clone.innerHTML = this.innerHTML;
        if (this.role) { clone.role = this.role; }
        if (this["aria-label"]) { clone["aria-label"] = this["aria-label"]; }
        if (deep) {
          this.childNodes.forEach((child: any) => {
            clone.appendChild(typeof child.cloneNode === "function" ? child.cloneNode(true) : child);
          });
        }
        return clone;
      };
      Object.defineProperty(el, "outerHTML", {
        get: function() {
          const childrenHtml = this.childNodes.map((c: any) => typeof c === "string" ? c : c.outerHTML || (c.nodeType === 3 ? c.textContent : (c.innerHTML || c.textContent || ""))).join("");
          let attrs = "";
          if (this.className) {attrs += ` class="${this.className}"`;}
          if (this.role) {attrs += ` role="${this.role}"`;}
          if (this["aria-label"]) {attrs += ` aria-label="${this["aria-label"]}"`;}
          return `<${this.tag}${attrs}>${this.innerHTML || (this.textContent && this.childNodes.length === 0 ? this.textContent : childrenHtml)}</${this.tag}>`;
        }
      });
      return el;
    },
    createDocumentFragment: () => {
      const frag: any = { childNodes: [], nodeType: 11 };
      frag.appendChild = function(child: any) {
        this.childNodes.push(child);
        if (child) {
          child.parentNode = this;
        }
      };
      frag.cloneNode = function(deep = false) {
        const clone = mockDocument.createDocumentFragment();
        if (deep) {
          this.childNodes.forEach((child: any) => {
            clone.appendChild(typeof child.cloneNode === "function" ? child.cloneNode(true) : child);
          });
        }
        return clone;
      };
      return frag;
    }
  };
  const mockWindow = {
    addEventListener: (evt: string, cb: (event: { data: any }) => void) => {
      if (evt === "message") {
        messageListeners.push(cb);
      }
    },
    getComputedStyle: () => computedStyle,
  };
  const sentMessages: any[] = [];
  const mockVscode = { postMessage: (msg: any) => sentMessages.push(msg) };
  const mockNavigator = { clipboard: { writeText: async () => {} } };

  const runScript = new Function(
    "document",
    "window",
    "acquireVsCodeApi",
    "navigator",
    "DOMPurify",
    CHAT_JS,
  );
  runScript(mockDocument, mockWindow, () => mockVscode, mockNavigator, domPurify);

  return {
    elements,
    listeners,
    sentMessages,
    postWindowMessage: (data: any) => {
      messageListeners.forEach((listener) => listener({ data }));
    },
  };
}

function createHtmlFragment(html: string, onClone?: () => void) {
  const node = {
    nodeType: 1,
    outerHTML: html,
    cloneNode: () => {
      onClone?.();
      return { nodeType: 1, outerHTML: html };
    },
  };
  return { childNodes: [node] };
}

function createDetailsContentDiv() {
  const contentDiv = {
    innerHTML: "",
    replaceChildren(...nodes: Array<{ outerHTML?: string; textContent?: string }>) {
      contentDiv.innerHTML = nodes.map((node) => node.outerHTML ?? node.textContent ?? "").join("");
    },
  };
  return contentDiv;
}

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

  test("CHAT_JS should sanitize rendered message HTML with the explicit URI allowlist", () => {
    let sanitizedInput = "";
    let sanitizeConfig: any;
    const harness = createChatScriptHarness({
      sanitize: (html, config) => {
        sanitizedInput = html;
        sanitizeConfig = config;
        if (config && config.RETURN_DOM_FRAGMENT) {
            return { childNodes: [{ nodeType: 1, outerHTML: "<p>safe</p>" }] };
        }
        return "<p>safe</p>";
      },
    });

    harness.postWindowMessage({
      type: "chatState",
      payload: {
        sessionId: "session-1",
        messages: [{ role: "assistant", html: '<img src=x onerror="alert(1)">' }],
        isTyping: false,
      },
    });

    assert.strictEqual(sanitizedInput, '<img src=x onerror="alert(1)">');
    assert.ok(harness.elements.chat.innerHTML.includes("<p>safe</p>"));
    assert.ok(!harness.elements.chat.innerHTML.includes("onerror"));
    assert.strictEqual(
      sanitizeConfig.ALLOWED_URI_REGEXP.test("command:jules-extension.openSettings"),
      false,
    );
    assert.strictEqual(sanitizeConfig.ALLOWED_URI_REGEXP.test("javascript:alert(1)"), false);
    assert.strictEqual(sanitizeConfig.ALLOWED_URI_REGEXP.test("data:text/html,<p>x</p>"), false);
    assert.ok(sanitizeConfig.ALLOWED_URI_REGEXP.test("https://example.com"));
    assert.ok(sanitizeConfig.ALLOWED_URI_REGEXP.test("./relative/path"));
    assert.ok(sanitizeConfig.ALLOWED_URI_REGEXP.test("vscode-webview-resource://resource"));
    assert.deepStrictEqual(sanitizeConfig.ADD_TAGS, ["details", "summary"]);
    assert.deepStrictEqual(sanitizeConfig.ADD_ATTR, [
      "data-activity-id",
      "data-detail-type",
      "data-index",
    ]);
    assert.strictEqual(sanitizeConfig.RETURN_DOM, false);
    assert.strictEqual(sanitizeConfig.RETURN_DOM_FRAGMENT, true);
    assert.deepStrictEqual(sanitizeConfig.FORBID_TAGS, ["math", "annotation", "annotation-xml", "maction", "mi", "mn", "mo", "ms", "mtext", "semantics"]);
  });

  test("CHAT_JS should fail closed when DOMPurify is unavailable", () => {
    const harness = createChatScriptHarness();

    harness.postWindowMessage({
      type: "chatState",
      payload: {
        sessionId: "session-1",
        messages: [{ role: "assistant", html: '<img src=x onerror="alert(1)">' }],
        isTyping: false,
      },
    });

    assert.ok(harness.elements.chat.innerHTML.includes("message-unavailable"));
    assert.ok(harness.elements.chat.innerHTML.includes('aria-label="Message unavailable"'));
    assert.ok(!harness.elements.chat.innerHTML.includes("<img"));
    assert.ok(!harness.elements.chat.innerHTML.includes("onerror"));
  });

  test("CHAT_JS should constrain message role class names", () => {
    const harness = createChatScriptHarness({
      sanitize: (html: any, config: any) => {
        if (config && config.RETURN_DOM_FRAGMENT) {
            return { childNodes: [{ nodeType: 1, outerHTML: html }] };
        }
        return html;
      },
    });

    harness.postWindowMessage({
      type: "chatState",
      payload: {
        sessionId: "session-1",
        messages: [{ role: 'assistant" onclick="alert(1)', html: "<p>safe</p>" }],
        isTyping: false,
      },
    });

    assert.ok(harness.elements.chat.innerHTML.includes('class="message assistant"'));
    assert.ok(!harness.elements.chat.innerHTML.includes("onclick"));
  });

  test("CHAT_JS should cache sanitized HTML across renders", () => {
    let sanitizeCalls = 0;
    let cloneCalls = 0;
    const harness = createChatScriptHarness({
      sanitize: (html: any, config: any) => {
        sanitizeCalls += 1;
        if (config && config.RETURN_DOM_FRAGMENT) {
          return createHtmlFragment(html, () => {
            cloneCalls += 1;
          });
        }
        return html;
      },
    });
    const payload = {
      sessionId: "session-1",
      messages: [{ role: "assistant", html: "<p>cached</p>" }],
      isTyping: false,
    };

    harness.postWindowMessage({ type: "chatState", payload });
    harness.postWindowMessage({ type: "chatState", payload });

    assert.strictEqual(sanitizeCalls, 1);
    assert.strictEqual(cloneCalls, 2);
  });

  test("CHAT_JS should sanitize lazy-loaded details HTML", () => {
    let sanitizedInput = "";
    let cloneCalls = 0;
    const attributes: Record<string, string> = {};
    const contentDiv = createDetailsContentDiv();
    const details = {
      getAttribute: (name: string) => {
        if (name === "data-index") {
          return "";
        }
        if (name === "data-activity-id") {
          return "act-1";
        }
        if (name === "data-detail-type") {
          return "plan";
        }
        return attributes[name] ?? null;
      },
      setAttribute: (name: string, value: string) => {
        attributes[name] = value;
      },
      querySelector: (selector: string) =>
        selector === ".details-content" ? contentDiv : null,
    };
    const harness = createChatScriptHarness({
      sanitize: (html, config) => {
        sanitizedInput = html;
        if (config.RETURN_DOM_FRAGMENT) {
          return createHtmlFragment("<p>details safe</p>", () => {
            cloneCalls += 1;
          });
        }
        return "<p>details safe</p>";
      },
    });
    harness.elements.chat.querySelectorAll = () => [details];

    harness.postWindowMessage({
      type: "detailsHtml",
      activityId: "act-1",
      detailType: "plan",
      html: '<img src=x onerror="alert(1)">',
    });

    assert.strictEqual(sanitizedInput, '<img src=x onerror="alert(1)">');
    assert.strictEqual(cloneCalls, 1);
    assert.strictEqual(attributes["aria-busy"], "false");
    assert.strictEqual(contentDiv.innerHTML, "<p>details safe</p>");
  });

  test("CHAT_JS should restore expanded cached details after rerender", () => {
    const attributes: Record<string, string> = {};
    const contentDiv = createDetailsContentDiv();
    const details = {
      tagName: "DETAILS",
      open: true,
      classList: { contains: (className: string) => className === "activity-details" },
      getAttribute: (name: string) => {
        if (name === "data-index") {
          return "";
        }
        if (name === "data-activity-id") {
          return "act-1";
        }
        if (name === "data-detail-type") {
          return "plan";
        }
        return attributes[name] ?? null;
      },
      setAttribute: (name: string, value: string) => {
        attributes[name] = value;
      },
      querySelector: (selector: string) =>
        selector === ".details-content" ? contentDiv : null,
    };
    const harness = createChatScriptHarness({
      sanitize: (html, config) => {
        if (config.RETURN_DOM_FRAGMENT) {
          return createHtmlFragment("<p>cached details</p>");
        }
        return html;
      },
    });
    harness.elements.chat.querySelectorAll = () => [details];

    harness.postWindowMessage({
      type: "detailsHtml",
      activityId: "act-1",
      detailType: "plan",
      html: "<p>cached details</p>",
    });
    harness.listeners.chat.toggle({ target: details });
    contentDiv.innerHTML = "";
    details.open = false;

    harness.postWindowMessage({
      type: "chatState",
      payload: {
        sessionId: "session-1",
        messages: [{ role: "assistant", html: "<p>message</p>" }],
        isTyping: false,
      },
    });

    assert.strictEqual(details.open, true);
    assert.strictEqual(attributes["aria-busy"], "false");
    assert.strictEqual(contentDiv.innerHTML, "<p>cached details</p>");
    assert.strictEqual(
      harness.sentMessages.filter((message) => message.type === "requestDetails").length,
      0,
    );
  });

  test("CHAT_CSS should include activity details layout styles", () => {
    assert.ok(CHAT_CSS.includes(".activity-details"));
    assert.ok(CHAT_CSS.includes(".details-content"));
    assert.ok(CHAT_CSS.includes("max-height: 350px"));
    assert.ok(CHAT_CSS.includes("overflow-y: auto"));
    assert.ok(CHAT_CSS.includes("aria-busy"));
    assert.ok(CHAT_CSS.includes("@keyframes pulse { 0%, 100% { opacity: 0.7; } 50% { opacity: 0.4; } }"));
    assert.ok(CHAT_CSS.includes("prefers-reduced-motion: reduce"));
  });

  test("CHAT_JS should manage aria-busy for lazy-loaded details", () => {
    const attributes: Record<string, string> = {};
    const details = {
      tagName: "DETAILS",
      open: true,
      classList: { contains: (className: string) => className === "activity-details" },
      getAttribute: (name: string) => {
        if (name === "data-activity-id") {
          return "act-1";
        }
        if (name === "data-detail-type") {
          return "plan";
        }
        if (name === "data-index") {
          return "";
        }
        return attributes[name] ?? null;
      },
      setAttribute: (name: string, value: string) => {
        attributes[name] = value;
      },
    };
    const harness = createChatScriptHarness();

    harness.listeners.chat.toggle({ target: details });
    assert.strictEqual(attributes["aria-busy"], "true");
    assert.strictEqual(
      harness.sentMessages.filter((message) => message.type === "requestDetails").length,
      1,
    );

    details.open = false;
    harness.listeners.chat.toggle({ target: details });
    assert.strictEqual(attributes["aria-busy"], "false");

    details.open = true;
    harness.listeners.chat.toggle({ target: details });
    assert.strictEqual(attributes["aria-busy"], "true");
    assert.strictEqual(
      harness.sentMessages.filter((message) => message.type === "requestDetails").length,
      2,
    );
  });

  test("CHAT_JS should clear aria-busy timeout on the current details node", () => {
    const oldAttributes: Record<string, string> = {};
    const currentAttributes: Record<string, string> = {};
    const getAttribute = (attributes: Record<string, string>, name: string) => {
      if (name === "data-activity-id") {
        return "act-1";
      }
      if (name === "data-detail-type") {
        return "plan";
      }
      if (name === "data-index") {
        return "";
      }
      return attributes[name] ?? null;
    };
    const oldDetails = {
      tagName: "DETAILS",
      open: true,
      classList: { contains: (className: string) => className === "activity-details" },
      getAttribute: (name: string) => getAttribute(oldAttributes, name),
      setAttribute: (name: string, value: string) => {
        oldAttributes[name] = value;
      },
    };
    const currentDetails = {
      getAttribute: (name: string) => getAttribute(currentAttributes, name),
      setAttribute: (name: string, value: string) => {
        currentAttributes[name] = value;
      },
    };
    const harness = createChatScriptHarness();
    harness.elements.chat.querySelectorAll = () => [currentDetails];
    const originalSetTimeout = global.setTimeout;
    const originalClearTimeout = global.clearTimeout;
    let timeoutCallback: (() => void) | null = null;
    (global as any).setTimeout = (callback: () => void) => {
      timeoutCallback = callback;
      return 1;
    };
    (global as any).clearTimeout = () => {};

    try {
      harness.listeners.chat.toggle({ target: oldDetails });
      assert.strictEqual(oldAttributes["aria-busy"], "true");

      assert.ok(timeoutCallback);
      (timeoutCallback as () => void)();

      assert.strictEqual(oldAttributes["aria-busy"], "true");
      assert.strictEqual(currentAttributes["aria-busy"], "false");
    } finally {
      global.setTimeout = originalSetTimeout;
      global.clearTimeout = originalClearTimeout;
    }
  });

  test("CHAT_JS should avoid duplicate detail requests after rerender while loading", () => {
    const firstAttributes: Record<string, string> = {};
    const secondAttributes: Record<string, string> = {};
    const getAttribute = (attributes: Record<string, string>, name: string) => {
      if (name === "data-activity-id") {
        return "act-1";
      }
      if (name === "data-detail-type") {
        return "plan";
      }
      if (name === "data-index") {
        return "";
      }
      return attributes[name] ?? null;
    };
    const createDetails = (attributes: Record<string, string>) => ({
      tagName: "DETAILS",
      open: true,
      classList: { contains: (className: string) => className === "activity-details" },
      getAttribute: (name: string) => getAttribute(attributes, name),
      setAttribute: (name: string, value: string) => {
        attributes[name] = value;
      },
    });
    const firstDetails = createDetails(firstAttributes);
    const secondDetails = createDetails(secondAttributes);
    const harness = createChatScriptHarness();

    harness.listeners.chat.toggle({ target: firstDetails });
    harness.listeners.chat.toggle({ target: secondDetails });

    assert.strictEqual(firstAttributes["aria-busy"], "true");
    assert.strictEqual(secondAttributes["aria-busy"], "true");
    assert.strictEqual(
      harness.sentMessages.filter((message) => message.type === "requestDetails").length,
      1,
    );
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

  test("CHAT_CSS should keep empty state accessible and reduced-motion friendly", () => {
    assert.ok(CHAT_CSS.includes("font-size: var(--vscode-editor-font-size)"));
    assert.ok(!CHAT_CSS.includes("height: 100%; opacity: 0; animation: fade-in"));
    assert.ok(CHAT_CSS.includes("@media (prefers-reduced-motion: reduce)"));
    assert.ok(CHAT_CSS.includes(".empty-state { animation: none; opacity: 1; }"));
    assert.ok(CHAT_CSS.includes(".sr-only"));
  });

  test("CHAT_JS should render welcome empty state when no session is selected", () => {
    const harness = createChatScriptHarness();

    harness.postWindowMessage({
      type: "chatState",
      payload: { sessionId: null, messages: [], isTyping: false },
    });

    const emptyState = harness.elements.chat.querySelector(".empty-state");
    assert.ok(emptyState);
    assert.strictEqual(harness.elements.chat.getAttribute("role"), null);
    assert.strictEqual(harness.elements.chat.getAttribute("aria-live"), null);
    assert.strictEqual(harness.elements.emptyStateStatus.getAttribute("role"), "status");
    assert.strictEqual(harness.elements.emptyStateStatus.getAttribute("aria-live"), "polite");
    assert.strictEqual(harness.elements.emptyStateStatus.getAttribute("aria-atomic"), "true");
    assert.strictEqual(
      harness.elements.emptyStateStatus.textContent,
      "Welcome to Jules. Select a session or create a new one to begin.",
    );
    assert.ok(emptyState.textContent.includes("Welcome to Jules"));
    assert.ok(emptyState.textContent.includes("Select a session or create a new one"));
  });

  test("CHAT_JS should render ready empty state when a session has no messages", () => {
    const harness = createChatScriptHarness();

    harness.postWindowMessage({
      type: "chatState",
      payload: { sessionId: "session-1", messages: [], isTyping: false },
    });

    const emptyState = harness.elements.chat.querySelector(".empty-state");
    assert.ok(emptyState);
    assert.strictEqual(harness.elements.chat.getAttribute("role"), null);
    assert.strictEqual(harness.elements.chat.getAttribute("aria-live"), null);
    assert.strictEqual(harness.elements.emptyStateStatus.getAttribute("role"), "status");
    assert.strictEqual(harness.elements.emptyStateStatus.getAttribute("aria-live"), "polite");
    assert.strictEqual(harness.elements.emptyStateStatus.getAttribute("aria-atomic"), "true");
    assert.strictEqual(
      harness.elements.emptyStateStatus.textContent,
      "Ready to assist. Type a message to start interacting with Jules.",
    );
    assert.ok(emptyState.textContent.includes("Ready to assist"));
    assert.ok(emptyState.textContent.includes("Type a message to start interacting"));
  });

  test("CHAT_JS should keep regular message rendering out of the empty state live region", () => {
    const harness = createChatScriptHarness({
      sanitize: (html, config) => config.RETURN_DOM_FRAGMENT ? createHtmlFragment(html) : html,
    });

    harness.postWindowMessage({
      type: "chatState",
      payload: {
        sessionId: "session-1",
        messages: [{ role: "assistant", html: "<p>Hello</p>" }],
        isTyping: false,
      },
    });

    assert.strictEqual(harness.elements.chat.getAttribute("role"), null);
    assert.strictEqual(harness.elements.chat.getAttribute("aria-live"), null);
    assert.strictEqual(harness.elements.emptyStateStatus.textContent, "");
    assert.ok(harness.elements.chat.innerHTML.includes("<p>Hello</p>"));
  });

  test("CHAT_JS should not reinsert the same empty state repeatedly", () => {
    const harness = createChatScriptHarness();
    const payload = { sessionId: "session-1", messages: [], isTyping: false };

    harness.postWindowMessage({ type: "chatState", payload });
    const firstRenderCount = harness.elements.chat.innerHTMLSetCount;
    harness.postWindowMessage({ type: "chatState", payload });

    assert.strictEqual(firstRenderCount, 1);
    assert.strictEqual(harness.elements.chat.innerHTMLSetCount, 1);
  });

  test("CHAT_JS should reset copy button text after failure", () => {
    assert.ok(CHAT_JS.includes('setButtonState("Failed")'));
    const resetCount = (
      CHAT_JS.match(
        /setTimeout\(restoreButtonState, 1200\)/g,
      ) ?? []
    ).length;
    assert.strictEqual(
      resetCount,
      2,
      "both success and failure paths should restore button state",
    );
  });

  test("CHAT_JS should adjust height to scrollHeight plus border height on input", () => {
    const harness = createChatScriptHarness();
    harness.postWindowMessage({
      type: "chatState",
      payload: { sessionId: "session-1", messages: [], isTyping: false },
    });
    harness.elements.messageInput.scrollHeight = 50;
    harness.listeners.messageInput.input();
    assert.strictEqual(harness.elements.messageInput.style.height, "52px");
  });

  test("CHAT_JS chatState should clear input and reset height to auto if no session", () => {
    const harness = createChatScriptHarness();
    harness.elements.messageInput.value = "old text";
    harness.elements.messageInput.style.height = "52px";
    harness.postWindowMessage({
      type: "chatState",
      payload: { sessionId: null, messages: [], isTyping: false },
    });
    assert.strictEqual(harness.elements.messageInput.value, "");
    assert.strictEqual(harness.elements.messageInput.style.height, "auto");
  });

  test("CHAT_JS submit should send trimmed message, clear input, and reset height to auto", () => {
    const harness = createChatScriptHarness();
    harness.postWindowMessage({
      type: "chatState",
      payload: { sessionId: "session-1", messages: [], isTyping: false },
    });

    harness.elements.messageInput.value = "  hello world  ";
    harness.elements.messageInput.style.height = "52px";

    harness.listeners.composer.submit({ preventDefault: () => {} });

    const sendMessages = harness.sentMessages.filter((m: any) => m.type === "sendMessage");
    assert.strictEqual(sendMessages.length, 1);
    assert.deepStrictEqual(sendMessages[0], { type: "sendMessage", sessionId: "session-1", text: "hello world" });
    assert.strictEqual(harness.elements.messageInput.value, "");
    assert.strictEqual(harness.elements.messageInput.style.height, "auto");
  });

  test("CHAT_JS keydown Ctrl+Enter should send trimmed message, clear input, and reset height to auto", () => {
    const harness = createChatScriptHarness();
    harness.postWindowMessage({
      type: "chatState",
      payload: { sessionId: "session-1", messages: [], isTyping: false },
    });

    harness.elements.messageInput.value = "  hello keydown  ";
    harness.listeners.messageInput.input();
    harness.elements.messageInput.style.height = "52px";

    harness.listeners.messageInput.keydown({ ctrlKey: true, metaKey: false, key: "Enter", preventDefault: () => {} });

    const sendMessages = harness.sentMessages.filter((m: any) => m.type === "sendMessage");
    assert.strictEqual(sendMessages.length, 1);
    assert.deepStrictEqual(sendMessages[0], { type: "sendMessage", sessionId: "session-1", text: "hello keydown" });
    assert.strictEqual(harness.elements.messageInput.value, "");
    assert.strictEqual(harness.elements.messageInput.style.height, "auto");
  });

  test("CHAT_JS updateUI should properly configure disabled states and ARIA attributes", () => {
    const elements: any = {
      chat: {
        innerHTML: "",
        childNodes: [] as any[],
        replaceChildren: function(...nodes: any[]) {
          this.childNodes = nodes;
          this.innerHTML = nodes.map((n: any) => typeof n === "string" ? n : n.outerHTML || (n.nodeType === 3 ? n.textContent : (n.innerHTML || n.textContent || ""))).join("");
        },
        scrollTop: 0,
        scrollHeight: 0,
        addEventListener: () => {},
        setAttribute: function(k: string, v: string) { (this as any)[k] = v; },
        getAttribute: function(k: string) { return (this as any)[k] ?? null; },
        querySelectorAll: () => [],
      },
      emptyStateStatus: { textContent: "" },
      typing: { classList: { toggle: () => {} } },
      messageInput: {
        value: "",
        disabled: false,
        placeholder: "",
        title: "",
        style: { height: "" },
        setAttribute: function(k: string, v: string) { (this as any)[k] = v; },
        addEventListener: () => {}
      },
      sendButton: {
        disabled: false,
        title: "",
        setAttribute: function(k: string, v: string) { (this as any)[k] = v; },
        addEventListener: () => {}
      },
      sessionLabel: { textContent: "" },
      composer: { addEventListener: () => {} },
    };

    const mockDocument = {
      getElementById: (id: string) => elements[id],
      createElement: (tag: string) => ({ tag, className: "", childNodes: [] as any[], setAttribute: function(k: string, v: string) { (this as any)[k] = v; }, appendChild: function(child: any) { this.childNodes.push(child); } }),
      createDocumentFragment: () => ({ childNodes: [] as any[], appendChild: function(child: any) { this.childNodes.push(child); } })
    };
    let messageListener: any = null;
    const mockWindow = {
      addEventListener: (evt: string, cb: any) => {
        if (evt === "message") {
          messageListener = cb;
        }
      },
    };
    const mockVscode = { postMessage: () => {} };

    const runScript = new Function("document", "window", "acquireVsCodeApi", "navigator", CHAT_JS);
    runScript(mockDocument, mockWindow, () => mockVscode, {});

    // (1) state.sessionId = null
    messageListener({ data: { type: "chatState", payload: { sessionId: null, messages: [], isTyping: false } } });
    assert.strictEqual(elements.messageInput.disabled, true);
    assert.strictEqual(elements.messageInput["aria-disabled"], "true");
    assert.ok(elements.messageInput.placeholder.startsWith("Select a session"));
    assert.strictEqual(elements.messageInput["aria-label"], elements.messageInput.placeholder);
    assert.strictEqual(elements.messageInput.title, elements.messageInput.placeholder);
    assert.strictEqual(elements.sendButton.disabled, true);
    assert.strictEqual(elements.sendButton["aria-disabled"], "true");
    assert.strictEqual(elements.sendButton.title, "Select a session to send a message");
    assert.strictEqual(elements.sendButton["aria-label"], "Send (Select a session to send a message)");
    assert.strictEqual(elements.sessionLabel.textContent, "Session: None selected");

    // (2) sessionId present + empty input value
    elements.messageInput.value = "   "; // whitespace
    messageListener({ data: { type: "chatState", payload: { sessionId: "session-123", messages: [], isTyping: false } } });
    assert.strictEqual(elements.sendButton.disabled, true);
    assert.strictEqual(elements.sendButton["aria-disabled"], "true");
    assert.strictEqual(elements.sendButton.title, "Type a message to send");
    assert.strictEqual(elements.sendButton["aria-label"], "Send (Type a message to send)");
    assert.strictEqual(elements.sessionLabel.textContent, "Session: session-123");

    // (3) sessionId present + non-empty input value
    elements.messageInput.value = "Hello";
    messageListener({ data: { type: "chatState", payload: { sessionId: "session-123", messages: [], isTyping: false } } });
    assert.strictEqual(elements.messageInput["aria-label"], elements.messageInput.placeholder);
    assert.strictEqual(elements.messageInput.title, elements.messageInput.placeholder);
    assert.strictEqual(elements.sendButton.disabled, false);
    assert.strictEqual(elements.sendButton["aria-disabled"], "false");
    assert.strictEqual(elements.sendButton.title, "Send message (Ctrl/Cmd+Enter)");
    assert.strictEqual(elements.sendButton["aria-label"], "Send message (Ctrl/Cmd+Enter)");
  });

  test("CHAT_JS should preserve fractional border widths when auto-resizing", () => {
    const harness = createChatScriptHarness(undefined, { borderTopWidth: "1.5px", borderBottomWidth: "1.5px" });
    harness.postWindowMessage({
      type: "chatState",
      payload: { sessionId: "session-1", messages: [], isTyping: false },
    });
    harness.elements.messageInput.scrollHeight = 50;
    harness.listeners.messageInput.input();
    assert.strictEqual(harness.elements.messageInput.style.height, "53px");
  });
});

  test("CHAT_JS should ignore clicks while copy feedback is active", () => {
    assert.ok(CHAT_JS.includes('copyButton.hasAttribute("data-copy-feedback-active")'));
  });
