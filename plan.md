1. `src/extension.ts` から `JulesSessionsProvider` を抽出し、`src/sessionsProvider.ts` に移動する。
2. `src/extension.ts` から `SessionTreeItem` を抽出し、`src/sessionTreeItem.ts` に移動する。
3. `src/extension.ts` から `JulesActivitiesDocumentProvider` を抽出し、`src/activitiesDocumentProvider.ts` に移動する。
4. 適切なエクスポート/インポートを提供する。
5. ビルドとテストが正常に完了することを確認する。
6. pre commit のステップを完了して、検証とテストが適切に行われたことを確認する。
