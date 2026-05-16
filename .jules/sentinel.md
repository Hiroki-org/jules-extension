## 2024-05-24 - Add timeout to execFile to prevent DoS
**Vulnerability:** childProcess.execFile does not have a timeout, which can cause the extension host to hang indefinitely if the git process stalls.
**Learning:** External processes should always have a timeout to prevent DoS.
**Prevention:** Always add a timeout option when using childProcess.execFile or similar functions.

## 2024-05-13 - [DOMPurify MathML Tags Disable]
**Vulnerability:** Unnecessary MathML parsing in DOMPurify could widen the attack surface for Cross-Site Scripting (XSS), but using `USE_PROFILES` incorrectly strips default HTML tags.
**Learning:** `USE_PROFILES` resets `ALLOWED_TAGS`. If you provide an invalid key or do not include standard profiles like `html`, DOMPurify removes safe HTML tags like `<p>` and `<a>`, causing UI breakage.
**Prevention:** To disable specific attack vectors like MathML while preserving default safe tags, use `FORBID_TAGS: ['math', 'annotation', ...]` rather than altering profiles.
## 2026-05-16 - [DOMPurify Profile Configuration for MathML]
**Vulnerability:** Adding `USE_PROFILES: { math: false }` incorrectly stripped all standard HTML/SVG tags because missing profiles default to false.
**Learning:** When using `USE_PROFILES` in DOMPurify to disable a specific attack vector (like MathML), you must explicitly enable the standard profiles (e.g., `html: true, svg: true`) to avoid breaking regular content rendering.
**Prevention:** Use `USE_PROFILES: { html: true, svg: true, math: false }` to retain core formatting while closing niche profile vulnerabilities.
