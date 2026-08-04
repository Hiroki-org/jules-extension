## 2024-08-04 - [Test]
**Learning:** [Test]
**Action:** [Test]
## 2026-08-04 - ComposerのSubmit時のフォーカス制御
**Learning:** 送信ボタンクリックなどにより非同期処理を開始した際、ボタンがdisabledになるとフォーカスが失われキーボード操作が途切れる問題がある。
**Action:** 送信処理開始時に、もしアクティブな要素が送信ボタンだった場合は、入力用のtextareaにフォーカスを明示的に戻す（`if (document.activeElement === submitButton) { textarea.focus(); }`）ようにする。
