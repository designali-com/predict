# Predict — live demo

The full Predict platform (Operations console, clinic panel, patient site) running on **fictional data**.
Nothing leaves a demo deploy: WhatsApp, Meta, SMS, Google and email calls are answered locally with a fake
success, uploads stay inline, and the database is wiped and re-seeded every night.

| App | Folder | What it is |
|---|---|---|
| Operations | `apps/automation` | Leads, call queue, WhatsApp inbox and automation, reports, ad ROI |
| Clinic | `apps/clinic` | Patients, appointments, therapy courses, billing, stock, health reports |
| Patient site | `apps/web` | The patient-facing app (optional for the demo) |

## How demo mode works

- `DEMO_MODE=1` (server) and `NEXT_PUBLIC_DEMO_MODE=1` (browser) switch it on.
- `packages/db/src/demo-mode.ts` — a network guard installed at server start (`src/instrumentation.ts` in each
  app) that answers every call to Meta / WhatsApp / MSG91 / Twilio / Google / Resend / Razorpay with a fake
  success. Email is logged, uploads become inline data URLs (2 MB cap), and the ad report gets stable fake spend.
- `packages/db/src/demo-seed.ts` — the fictional world: 2 clinics, 6 staff accounts, ~300 leads from 7 ads,
  ~30 patients, courses, payments, medicine bills and 1,300+ WhatsApp messages. Refuses to run unless `DEMO_MODE=1`.
- `packages/ui/src/components/demo-mode.tsx` — the demo banner (closable) and the "Try the demo" buttons.

## Demo accounts

All use the password `predict-demo-2026` (or `NEXT_PUBLIC_DEMO_PASSWORD`), and the login pages sign in with one click.

| Role | Email | App |
|---|---|---|
| Operations manager | `ops@demo.predict.fit` | Operations |
| Telecaller | `caller@demo.predict.fit` | Operations |
| Clinic admin | `admin@demo.predict.fit` | Clinic |
| Front desk | `desk@demo.predict.fit` | Clinic |
| Doctor | `doctor@demo.predict.fit` | Clinic |
| Predict (diagnosis) | `predict@demo.predict.fit` | Clinic |
| Demo patient | `patient@demo.predict.fit` | Patient site — biological age, domains, biomarkers |

## Run it locally

```bash
pnpm install
# 1. A Postgres database for the demo ONLY (e.g. a new Neon database).
#    Put its URLs in packages/db/.env and each app's .env (see the variables below).
pnpm --filter @workspace/db db:push                          # create the tables
pnpm --filter @workspace/db exec tsx scripts/seed-care-plan-catalog.ts
pnpm --filter @workspace/db demo:seed                         # the fictional world (also sets role permissions)
pnpm --filter automation dev                                  # http://localhost:3001/login
pnpm --filter clinic dev                                      # http://localhost:3002/auth/login
```

## Deploy on Vercel — no settings needed

The repo carries working defaults for everything (packages/db/src/demo-env.ts and each app's next.config.ts):
demo mode on, the demo database (a Neon login that can open **only** the `predict_demo` database), a session
secret, dummy keys, and the three apps' addresses. **No environment variables are required.**

Make one Vercel project per app, all from this repo, with these **project names** (the name decides the
`.vercel.app` address, and the apps link to each other by these addresses):

| Vercel project name | Root Directory | Opens as |
|---|---|---|
| `predictfitdemo` | `apps/web` | https://predictfitdemo.vercel.app (patient dashboard) |
| `predictfitdemo-ops` | `apps/automation` | https://predictfitdemo-ops.vercel.app/login |
| `predictfitdemo-clinic` | `apps/clinic` | https://predictfitdemo-clinic.vercel.app/auth/login |

New Project → import the repo → set the name and Root Directory → Deploy. That is all. The database is already
seeded, and the Ops project's cron re-seeds it nightly.

Optional: a different name or a custom domain — set `NEXT_PUBLIC_APP_URL` / `NEXT_PUBLIC_PATIENT_URL`,
`NEXT_PUBLIC_OPERATIONS_URL` and `NEXT_PUBLIC_CLINIC_URL` to the real addresses in all three projects. Any
variable you set wins over the built-in default. `CRON_SECRET` (Ops) makes only Vercel able to trigger the reset.

### Nightly reset

`apps/automation/vercel.json` schedules `GET /api/demo/reset` at 21:30 UTC (03:00 IST). Vercel's cron is let in by its user agent (or, with `CRON_SECRET` set, only by that bearer token); the route wipes the demo database and re-seeds it, shifted to the current date.
To reset by hand:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<your-ops-demo>.vercel.app/api/demo/reset
```

## What is not in the demo

The background worker (BullMQ + Redis) and the WhatsApp webhook do not run on Vercel, so flows do not advance and
no inbound messages arrive. The seed already contains a realistic history of both, so every report and inbox has
data to show.
