# Release Checklist

この文書は llmthink の release を main から切るときの最小手順を定義する。

## 対象

- root package
- MCP server
- VSIX extension
- Git tag
- GitHub repository visibility と binary 配布物

## 事前確認

1. working tree が clean であることを確認する
2. release version を docs/process/version-bump-rules.dsl に従って決める
3. package.json、package-lock.json、vscode-extension/package.json、vscode-extension/package-lock.json、src/mcp/server.ts を同じ version へ揃える
4. CHANGELOG.md と README.md を release 内容に合わせて更新する

## 機密情報チェック

1. current tree を scan する
2. git history 全体を scan する
3. secret が見つかった場合は公開前に history rewrite を含めて除去する
4. scan 結果と使用したコマンドを release note または作業記録に残す

## 検証

1. npm run typecheck
2. npm test
3. npm run build
4. npm run build:extension
5. npm run package:vsix

## 配布物

1. vscode-extension/llmthink.vsix を生成する
2. 必要なら checksum を生成する
3. 配布先に version と changelog を添える

## GitHub 操作

1. repository を public に変更する場合は visibility 変更を先に実施する
2. release commit を main へ push する
3. annotated tag を v<version> 形式で作成する
4. tag を origin へ push する

## 公開後確認

1. origin/main が release commit を指していることを確認する
2. origin の tag 一覧に release tag が載っていることを確認する
3. public repository の README と配布導線が崩れていないことを確認する