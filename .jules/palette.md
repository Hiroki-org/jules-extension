
## 2024-08-08 - Accessible disabled states on form elements with labels
**Learning:** When dynamically adding an `aria-label` to explain a disabled state (e.g., "Cannot change while sending") on an element that previously relied on a linked `<label>` for its accessible name, the new `aria-label` will completely override the `<label>`. This causes the user to lose context of what the element is.
**Action:** When updating `aria-label` for disabled states on elements with visible labels, concatenate the original label text with the disabled explanation (e.g., `Create PR automatically? (Cannot change while sending)`), or use `aria-description` if appropriate, to maintain context.
