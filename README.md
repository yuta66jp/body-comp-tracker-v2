# body-comp-tracker-v2

A personal body composition and contest prep tracker. Logs daily weight, nutrition, and condition data, and surfaces trends via an ML-backed dashboard.

## What it does

- Tracks daily weight, macros, and condition tags
- Computes 7-day moving averages and TDEE estimates
- Runs NeuralProphet weight forecasts and XGBoost factor analysis via a daily batch
- Compares progress across contest seasons on a history page

## Tech stack

| Layer | Stack |
|---|---|
| Frontend | Next.js (App Router) + TypeScript + Tailwind CSS |
| Database | Supabase (PostgreSQL + RLS) |
| Charts | Recharts |
| ML batch | Python — NeuralProphet, XGBoost (GitHub Actions, daily cron) |

## Project structure

```
src/          — Next.js app (pages, components, hooks, utils)
ml-pipeline/  — Python batch scripts (enrich.py, predict.py, analyze.py)
.github/      — CI and ML batch workflows
supabase/     — DB migrations
```

## Local development

1. Copy `.env.local.example` to `.env.local` and fill in your Supabase credentials.
2. Install dependencies and start the dev server:

```bash
npm install
npm run dev
```

3. Run checks before committing:

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
```

The ML batch scripts require `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` and are designed to run in GitHub Actions, not locally.

## Security

See [SECURITY.md](SECURITY.md) for the vulnerability reporting policy.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development and workflow guidelines.
