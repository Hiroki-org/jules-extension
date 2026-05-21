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
## 2026-05-20 - Default XSS via xmp tag in sanitize-html
**Vulnerability:** Found a sanitizer bypass in `sanitize-html` <= 2.17.3 where the default configuration allowed arbitrary HTML and scripts to execute when wrapped inside an `<xmp>` tag. The library did not treat `<xmp>` as a tag whose entire contents should be discarded by default.
**Learning:** Default configurations of security libraries may harbor silent bypasses if obscure HTML tags (like `<xmp>`) are treated as text nodes during parsing but re-interpreted as active markup when rendered.
**Prevention:** Regularly update dependencies (like `sanitize-html`), especially those performing security-critical tasks like sanitization. Additionally, explicitly configure sanitizers to discard contents of dangerous or obscure elements rather than relying solely on default settings.
