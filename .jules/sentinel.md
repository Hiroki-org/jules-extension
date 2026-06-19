## 2024-05-24 - Add timeout to execFile to prevent DoS
**Vulnerability:** childProcess.execFile does not have a timeout, which can cause the extension host to hang indefinitely if the git process stalls.
**Learning:** External processes should always have a timeout to prevent DoS.
**Prevention:** Always add a timeout option when using childProcess.execFile or similar functions.

## 2024-05-13 - [DOMPurify MathML Tags Disable]
**Vulnerability:** Unnecessary MathML parsing in DOMPurify could widen the attack surface for Cross-Site Scripting (XSS), but using `USE_PROFILES` incorrectly strips default HTML tags.
**Learning:** `USE_PROFILES` resets `ALLOWED_TAGS`. If you provide an invalid key or do not include standard profiles like `html`, DOMPurify removes safe HTML tags like `<p>` and `<a>`, causing UI breakage.
**Prevention:** To disable specific attack vectors like MathML while preserving default safe tags, use `FORBID_TAGS: ['math', 'annotation', ...]` rather than altering profiles.

## 2024-05-25 - [innerHTML replacement]

**Vulnerability:** Use of innerHTML in composer.ts to set loading spinner.
**Learning:** Assigning strings containing HTML to innerHTML is inherently risky and can lead to XSS if user inputs are ever involved. Using document.createElement and appendChild is the safe and secure approach.
**Prevention:** Avoid .innerHTML and use safer DOM APIs like textContent, document.createElement, and appendChild.
## 2026-06-03 - DOMPurify MathML bypass prevention
**Vulnerability:** mXSS vulnerability via MathML parsing bypass in DOMPurify.
**Learning:** Using FORBID_TAGS is insufficient for disabling MathML namespace robustly. DOMPurify's USE_PROFILES configuration is required, but setting { math: false } alone resets defaults and breaks standard HTML tags.
**Prevention:** Explicitly configure USE_PROFILES: { html: true, svg: true, math: false } to securely disable MathML while preserving expected rendering.

## 2026-06-19 - [Path Traversal Check Fix]
**Vulnerability:** legitimate files starting with `..` (e.g., `..config`) could be incorrectly rejected by `!relative.startsWith('..')`.
**Learning:** When using `path.relative(root, target)`, checking for path traversal should strictly check for `..` followed by `path.sep` or exact match to prevent false positives.
**Prevention:** Use `!relative.startsWith('..' + path.sep) && relative !== '..'` and `!path.isAbsolute(relative)` for proper boundary validation.
