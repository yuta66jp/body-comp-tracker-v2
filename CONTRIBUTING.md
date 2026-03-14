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

CI runs these automatically on every push and pull request.

## GitHub Actions

- Every workflow file must include an explicit `permissions` block.
- Use the minimum permissions required. `contents: read` is sufficient for most workflows that only checkout code and run scripts.
- Do not rely on default (implicit) token permissions.

Example:

```yaml
permissions:
  contents: read
```

If a workflow needs additional permissions (e.g. `security-events: write` for code scanning upload), document the reason in a comment next to the permission.

## Security Notes

- Do not include secrets, credentials, or sensitive data in public issues, PR descriptions, or commit messages.
- Code Scanning alerts at **High** or **Critical** severity should be addressed as a rule. If dismissing, leave a reason in the dismissal comment.
- For vulnerability reports, follow the process in [SECURITY.md](SECURITY.md). Do not open a public issue with vulnerability details.
