# Contributing

Guidelines for development and day-to-day operations on this project.

## Development Workflow

- Work on `feature/*` branches and merge to `main` via pull request.
- `dev` can be used for integration testing before merging to `main`.
- Keep commits small and use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`, etc.).

## Checks Before Merging

All of the following must pass before merging:

- `npm run lint` — ESLint
- `npx tsc --noEmit` — TypeScript type check
- `npm test` — Jest unit tests
- `npm run build` — Next.js production build

CI runs these automatically on every push and pull request (`lint-typecheck-build` job).

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
