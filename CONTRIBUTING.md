# Contributing

Guidelines for development and day-to-day operations on this project.

## Development Workflow

- Work on `feature/*` branches and merge to `main` via pull request.
- Keep commits small and use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `refactor:`, `chore:`, `docs:`, `test:`, etc.).

## Checks Before Merging

All of the following must pass before merging:

- `npm run lint` — ESLint
- `npx tsc --noEmit` — TypeScript type check
- `node_modules/.bin/jest --no-coverage` — Jest tests (unit tests + UI integration tests)
- `npm run build` — Next.js production build

Jest は `node` 環境（unit tests）と `jsdom` 環境（UI integration tests）の 2 プロジェクト構成。
保存導線・fallback 導線の自動検証が含まれる。

CI runs these automatically on every push and pull request (`lint-typecheck-build` job).

### Running the full check locally

```bash
npm ci
npm run lint
npx tsc --noEmit
node_modules/.bin/jest --no-coverage
npm run build
```

`npm run build` requires the Supabase public env vars to be present.
Ensure `.env.local` contains `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` before running the build locally.

### Node.js version

CI uses **Node 20 LTS** (`node-version: "20"` in `.github/workflows/ci.yml`).
A `.nvmrc` is provided — run `nvm use` to switch automatically if you use nvm.
`package.json` declares `engines: { "node": ">=20" }` as the minimum.

In addition, `ml-pipeline/test_analyze.py` runs as a separate `python-test` job on the same triggers.
To run Python tests locally: `cd ml-pipeline && pytest test_analyze.py -v`
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
