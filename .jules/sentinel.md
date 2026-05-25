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

## 2024-05-24 - Avoid `.innerHTML` in webviews
**Vulnerability:** Assigning strings to `.innerHTML` in `src/webview/chatAssets.ts` exposes the UI to Cross-Site Scripting (XSS) risks.
**Learning:** Even if the payload originates from a sanitized source or static string, using `.innerHTML` inherently breaks defense-in-depth and makes the code brittle to future changes. It also requires strings to be properly escaped (which is error-prone).
**Prevention:** Use DOM manipulation methods like `document.createElement`, `textContent`, and `replaceChildren()` to build the DOM structure safely. For parsed fragments (like DOMPurify outputs), rely on `RETURN_DOM_FRAGMENT: true` and then insert via `replaceChildren(Array.from(fragment.childNodes))`. Ensure to update unit test mocks correctly to reflect these operations.
