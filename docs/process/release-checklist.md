# Release Checklist

この文書は llmthink の release を main から切るときの手順を定義する。
各 gate は上から順に実行し、失敗した gate より後の公開操作へ進まない。

## 対象と不変条件

対象は Core npm package、root npm package、local stdio MCP、VSIX extension、README、CHANGELOG、Git tag、GitHub Release とする。private Hosted server workspaceはこのreleaseの対象、dependency、同梱物ではない。

### Hosted service exclusion and next major

root sourceは`@llmthink/server`へ依存せず、Hosted server export、bin、`dist/server/**`を配布しない。private server workspaceのpackage publication、external repository、service deploymentは別のrelease authorityを必要とし、本checklistでは実行しない。

`llmthink@1.3.0`で公開したHosted server exportと`llmthink-hosted-mcp` binを削除するため、次回root releaseはversion bump ruleに従うmajorとする。この記録はrelease、version bump、publish自体を認可しない。

release ごとに次の値を一度だけ確定し、作業記録へ残す。

- `RELEASE_VERSION`: `X.Y.Z`
- `RELEASE_TAG`: `vX.Y.Z`
- `RELEASE_SHA`: release commit の完全な SHA
- `CORE_NPM_TARBALL` と SHA-512 integrity
- `NPM_TARBALL` と SHA-512 integrity
- `VSIX_FILE` と SHA-256 digest

すべての version 表記、配布物、tag、公開先はこの組に一致させる。release commit 確定後は同じ release のソースや成果物を再生成・差し替えしない。

## Gate 1: release source の確定

1. working tree が clean で、対象 branch が `main` であることを確認する
2. release version を docs/process/version-bump-rules.dsl に従って決める
3. packages/core/package.json、package.json、package-lock.json、vscode-extension/package.json、vscode-extension/package-lock.json、src/mcp/server.ts を同じ version へ揃え、root packageがCoreの正確versionへ依存することを確認する
4. CHANGELOG.md に同じ version と release 内容を記載する
5. README.md と vscode-extension/README.md の現行 version、npm URL、GitHub Release URL を同じ version へ揃える
6. version と文書を揃え終えてから `npm run build:extension` と `npm run package:vsix` を実行する
7. 生成された vscode-extension/llmthink.vsix を release 差分へ含める

VSIX を生成した後に version、README、extension source を変更した場合、この gate の生成と検査を最初からやり直す。

## Gate 2: release candidate の検査

1. `npm run format:check`
2. `npm run lint`
3. `npm run typecheck`
4. `npm run typecheck:extension`
5. `npm run test:contract`
6. `npm run test:all`
7. `npm run build`
8. `npm run verify-examples`
9. `npm pack --dry-run --workspace @llmthink/core` と root `npm pack --dry-run` で各公開対象ファイルを確認する
10. root tarballのmanifestとfile listに`@llmthink/server` dependency、`llmthink-hosted-mcp` bin、`dist/server/**`がないことを確認する
11. VSIX 内の extension/package.json と extension/readme.md を展開し、version と文面が source と一致することを確認する
12. current tree と git history 全体を secret scan し、結果とコマンドを作業記録へ残す
13. `git diff --check` と `git status --short` で想定外の差分がないことを確認する

いずれかが不一致なら公開せず Gate 1 へ戻る。

## Gate 3: commit と配布物の凍結

1. release 差分を 1 つの release commit として commit する
2. working tree が clean であることを確認し、`RELEASE_SHA=$(git rev-parse HEAD)` を記録する
3. `RELEASE_SHA` の状態からCoreとrootのnpm tarballをrepository外のartifact directoryへ一度だけ生成し、以後は`npm publish`に同じtarballを渡す
4. Core/root npm tarballのSHA-512 integrityとvscode-extension/llmthink.vsixのSHA-256 digestを記録する
5. annotated tag `RELEASE_TAG` を `RELEASE_SHA` に作成する
6. tag 作成後も working tree が clean で、tag と `HEAD` が `RELEASE_SHA` に一致することを確認する

この gate より後は build、package、文書修正を行わない。差分が必要なら tag を公開せず破棄して Gate 1 から新しい release candidate を作る。

## Gate 4: 公開

公開前に target、version、SHA、artifact digest と最大 write 回数を固定する。通常の write は次の 4 回である。

1. `main` と `RELEASE_TAG` を同一 `RELEASE_SHA` として origin へ atomic push する
2. 凍結済み `CORE_NPM_TARBALL` を一度だけ公開し、registryのversion/integrityを読み戻す
3. Core readback成功後、凍結済み `NPM_TARBALL` を一度だけ公開する
4. `RELEASE_TAG` からGitHub Releaseを作り、凍結済み`VSIX_FILE`とCHANGELOGの該当内容を掲載する

認証エラーや応答不明時は同じ write を直ちに再送しない。先に remote、npm registry、GitHub Release を読み戻し、未完了と確認できた操作だけを再開する。

## Gate 5: 公開後 readback

ローカル成果物ではなく、各公開先から読み戻した値を確認する。

1. origin/main と annotated tag を peel した SHA が `RELEASE_SHA` に一致する
2. npm registryの`@llmthink/core` versionとintegrityが`RELEASE_VERSION`と凍結済みCore tarballに一致する
3. npm registryのroot package version、latest dist-tag、integrityが`RELEASE_VERSION`と凍結済みroot tarballに一致する
4. GitHub Release が draft/prerelease でなく `RELEASE_TAG` を指す
5. GitHub Release から再取得した VSIX の SHA-256 が凍結値に一致する
6. 再取得した VSIX 内の manifest version と README の現行 version が `RELEASE_VERSION` に一致する
7. public main の README.md と vscode-extension/README.md が同じ version と公開 URL を案内する
8. local main が origin/main と一致し、working tree が clean である

全項目と readback 値を release receipt に残して release 完了とする。

## 公開後に不整合を発見した場合

- 公開済み tag を移動しない
- npm の同一 version を再公開しない
- 公開済み GitHub Release asset を同名上書きして履歴を変えない
- 不整合を修正し、version bump rule に従う新しい patch release として全 gate をやり直す
- 部分公開の復旧では、既に正しく公開された対象を再送せず、不足している対象だけを完成させる

## Repository visibility

repository visibility の変更は通常の release と別の承認対象とする。必要な場合は Gate 4 より前に実施し、公開状態を読み戻してから release を続行する。
