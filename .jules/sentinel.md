## 2024-05-24 - Add timeout to execFile to prevent DoS
**Vulnerability:** childProcess.execFile does not have a timeout, which can cause the extension host to hang indefinitely if the git process stalls.
**Learning:** External processes should always have a timeout to prevent DoS.
**Prevention:** Always add a timeout option when using childProcess.execFile or similar functions.

## 2024-05-13 - [DOMPurify MathML Profile Disable]
**Vulnerability:** Unnecessary MathML parsing in DOMPurify could widen the attack surface for Cross-Site Scripting (XSS).
**Learning:** DOMPurify's default configuration enables MathML. If math rendering is not required by the application (as in simple chat webviews), this unnecessary capability introduces risk, as MathML has historically been a vector for sanitizer bypasses.
**Prevention:** Always explicitly disable unused DOMPurify profiles. Use USE_PROFILES: { mathML: false } or specify only the required profiles (e.g., { html: true }) as a defense-in-depth measure.

## 2024-05-13 - [DOMPurify MathML Tags Disable]
**Vulnerability:** Unnecessary MathML parsing in DOMPurify could widen the attack surface for Cross-Site Scripting (XSS), but using `USE_PROFILES` incorrectly strips default HTML tags.
**Learning:** `USE_PROFILES` resets `ALLOWED_TAGS`. If you provide an invalid key or do not include standard profiles like `html`, DOMPurify removes safe HTML tags like `<p>` and `<a>`, causing UI breakage.
**Prevention:** To disable specific attack vectors like MathML while preserving default safe tags, use `FORBID_TAGS: ['math', 'annotation', ...]` rather than altering profiles.
