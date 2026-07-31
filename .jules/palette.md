## 2026-07-31 - Add reasons to disabled states
**Learning:** When disabling interactive elements (like buttons) during asynchronous operations, relying solely on the `disabled` state is insufficient. It is crucial to set the `title` and `aria-label` attributes to explicitly explain to all users why the element is disabled (e.g., 'Cannot cancel while sending').
**Action:** Always verify if a disabled element requires an explanation and implement synchronous updates to its visual tooltip (`title`) and accessible label (`aria-label`).
