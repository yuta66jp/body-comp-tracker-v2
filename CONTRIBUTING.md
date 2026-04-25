# Contributing

Guidelines for development and day-to-day operations on this project.

## Development Workflow

- Work on `feature/*` branches and merge to `main` via pull request.
- Keep commits small and use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `refactor:`, `chore:`, `docs:`, `test:`, etc.).

## Checks Before Merging

All of the following must pass before merging:

- `npm run lint` — ESLint
- `npx tsc --noEmit` — TypeScript type check
- `npm test -- --runInBand` — Jest tests (unit tests + UI integration tests)
- `npm run build` — Next.js production build

Jest は `node` 環境（unit tests）と `jsdom` 環境（UI integration tests）の 2 プロジェクト構成。
保存導線・fallback 導線の自動検証が含まれる。

CI runs these automatically on every push and pull request (`lint-typecheck-build` job and `python-test` job).

### Running the full check locally

```bash
npm ci
npm run lint
npx tsc --noEmit
npm test -- --runInBand
npm run build
```

`npm run build` requires the Supabase public env vars to be present.
Ensure `.env.local` contains `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` before running the build locally.

### Codex / sandbox notes

Codex 作業では、まず以下を標準の切り分けコマンドとして使う。

```bash
npm run lint
npx tsc --noEmit
npm test -- --runInBand
npm run build
npm run e2e:smoke
```

- `lint` / `tsc` / `jest` は sandbox 内でも通ることを期待する。
- `npm run build` は Turbopack が worker process や port bind を使うため、sandbox 制約により失敗する場合がある。sandbox 起因が疑わしい場合は、同じ commit で sandbox 外または CI 上の再実行結果を確認して切り分ける。
- `npm run e2e:smoke` は Playwright が開発サーバーを起動し、ブラウザを起動する。sandbox 内で server bind や browser 起動に失敗した場合は、アプリの不具合と判断する前に sandbox 外または CI の手動 workflow で再確認する。
- Codex が PR を作成する場合、PR 本文に実行できたコマンドと、sandbox 制約で未実行または再実行が必要だったコマンドを明記する。

### Node.js version

CI uses **Node 20 LTS** (`node-version: "20"` in `.github/workflows/ci.yml`).
A `.nvmrc` is provided — run `nvm use` to switch automatically if you use nvm.
`package.json` declares `engines: { "node": ">=20" }` as the minimum.

## E2E Tests (Playwright)

E2E テストは Playwright (Chromium) で実装している。

### テスト種別

| ファイル | 内容 | CI |
|---|---|---|
| `e2e/smoke.spec.ts` | 主要ページ表示確認 (読み取り専用) | 手動トリガー (`e2e.yml`) |
| `e2e/write-flows.spec.ts` | 保存系フロー (日次ログ / 設定) | スキップ (要テスト環境) |

### ローカル実行手順

1. 初回のみ: Playwright ブラウザをインストール

   ```bash
   npx playwright install chromium
   ```

2. 開発サーバーが起動していることを確認 (未起動なら Playwright config が自動起動する)

3. Smoke tests を実行

   ```bash
   npm run e2e:smoke
   # または全テスト
   npm run e2e
   ```

4. UI モードで実行 (デバッグ向け)

   ```bash
   npm run e2e:ui
   ```

### Write tests の実行

Write tests は本番 DB への書き込みを防ぐため**デフォルトでスキップ**する。

実行するには、**テスト専用の Supabase プロジェクト**を用意し、そこを指す環境変数をセットした上で実行すること:

```bash
NEXT_PUBLIC_SUPABASE_URL=<test-project-url> \
NEXT_PUBLIC_SUPABASE_ANON_KEY=<test-project-anon-key> \
npm run e2e:write
```

テスト用の日付 (`2099-12-31`) を使ってレコードを作成し、テスト後に自動削除する。

### CI での実行

Smoke tests は `.github/workflows/e2e.yml` (`workflow_dispatch`) で手動実行できる。PR ゲートには含めない (ブラウザ起動コストのため)。

Smoke tests は主要ページの表示と最低限のナビゲーションを確認する読み取り専用テスト。保存や削除など DB 書き込みを伴うフローは `e2e/write-flows.spec.ts` に分離し、テスト専用 Supabase プロジェクトを指す環境変数がある場合だけ実行する。

---

In addition, the following Python tests run as a separate `python-test` job on the same triggers:
`test_predict.py`, `test_analyze.py`, `test_enrich.py`, `test_feature_registry.py`, `test_backtest.py`.
To run Python tests locally: `cd ml-pipeline && pytest test_predict.py test_analyze.py test_enrich.py test_feature_registry.py test_backtest.py -v`
Dependencies: `pip install -r ml-pipeline/requirements-ci.txt` (pandas / xgboost / scikit-learn / supabase / pytest — no torch required).

## GitHub Actions

- Every workflow file must include an explicit `permissions` block.
- Start with the minimum permission set. `contents: read` is sufficient for most workflows that only checkout code and run scripts.
- Do not rely on default (implicit) token permissions.

Example:

```yaml
permissions:
  contents: read
```

Only add broader permissions when the workflow actually needs them. If you do, leave a short comment explaining why:

```yaml
permissions:
  contents: read
  security-events: write  # required to upload SARIF results to Code Scanning
```

## Security Notes

- Do not include secrets, credentials, or sensitive data in public issues, PR descriptions, or commit messages.
- For vulnerability reports, follow the process in [SECURITY.md](SECURITY.md). Do not open a public issue with vulnerability details.

### Code Scanning

| Severity | Expected action |
|---|---|
| **Critical / High** | Address as a rule. If a fix is not immediately possible, leave a comment explaining the blocker. |
| **Medium** | Evaluate based on exploitability and actual project impact. Fix or dismiss with a recorded reason. |
| **Low** | Address opportunistically; dismissal is acceptable with a brief note. |

When dismissing any alert, always leave a reason in the dismissal comment. If the alert is a false positive, record it explicitly as such (e.g. "False positive — this code path is never reached with untrusted input").
