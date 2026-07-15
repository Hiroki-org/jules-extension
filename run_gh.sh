gh pr create --head bolt-parallelize-remote-check --title "⚡ Bolt: リモートブランチ存在確認の並列化による高速化" --body "💡 What:
\`src/applyPatchLocally.ts\`の\`resolveStartingBranchRef\`関数において、各リモートに対する\`branchExists\`の確認を直列の\`for\`ループから\`Promise.all\`を用いた並列処理に変更しました。リモートの優先順序（\`origin\`優先など）の副作用を防ぐため、結果を配列順に評価しています。

🎯 Why:
複数のリモート（origin, upstream, forksなど）が存在する場合、非同期API呼び出しが直列に実行され、リモート数に比例してI/O待機時間が増大する非効率を解消するためです。

📊 Impact:
4つのリモートを対象としたベンチマーク測定において、実行時間が約202msから51msへ短縮され、約75%のパフォーマンス向上が確認されました。

🔬 Measurement:
ローカルで50msの非同期遅延をモックしたベンチマークスクリプトを使用し測定。
- Baseline (Sequential): 202ms
- Optimized (Parallel): 51ms"
