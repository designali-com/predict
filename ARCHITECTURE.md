# PredictFit — Architecture

> Companion to [`PredictFit-Architecture.xlsx`](./PredictFit-Architecture.xlsx), which holds the same
> information as filterable tables. The spreadsheet is generated — edit
> [`scripts/architecture-data.mjs`](./scripts/architecture-data.mjs) and run `pnpm arch:xlsx`.

---

## 1. What this system is

PredictFit is a preventive-health platform. A patient signs up, uploads lab reports, gets a
**biological age** computed from their biomarkers, chats with an AI health assistant, connects a
wearable, and books clinic appointments. Behind that, a care team (doctor, health coach,
nutritionist) reviews the same data, and an ops team runs WhatsApp-driven lifecycle automation
against leads and patients.

It is **three deployables plus one sibling service**:

| # | Deployable | Runtime | Port | Repo path |
|---|-----------|---------|------|-----------|
| 1 | `apps/web` | Next.js 16 server | 3000 | `predictfit/apps/web` |
| 2 | `apps/clinic` | Next.js 16 server | 3002 | `predictfit/apps/clinic` |
| 3 | `apps/automation` (console) | Next.js 16 server | 3001 | `predictfit/apps/automation` |
| 4 | `apps/automation` (worker + webhook) | long-running Node (`tsx`) | — / 3100 | same package, different entrypoints |
| 4 | Open Wearables | FastAPI + Celery + Vite portal (Docker Compose) | 8000 / 3000 | `open-wearables/` (sibling repo) |

Deployables 1–3 share **one PostgreSQL database** through `@workspace/db`. Open Wearables has its
**own database and its own migrations** — the two systems talk over HTTP only, never over shared
tables. That boundary is deliberate: Open Wearables is an upstream open-source project (MIT, v0.6.3,
by Momentum) that gets updated independently, so coupling it at the schema level would make every
upstream bump a migration problem.

---

## 2. High-level topology

```
                            ┌──────────────────────────────┐
      Patient / Care team ──▶│  apps/web  (Next.js :3000)   │
                            │  pages + route handlers      │
                            └───┬──────┬──────┬────────┬────┘
                                │      │      │        │
                 ┌──────────────┘      │      │        └──────────────┐
                 │                     │      │                       │
                 ▼                     ▼      ▼                       ▼
        ┌────────────────┐   ┌──────────────────────┐        ┌────────────────┐
        │  PostgreSQL    │   │ OpenAI / Gemini      │        │  Cal.com v2    │
        │  (Drizzle)     │   │ Cloudinary / Resend  │        │  (scheduling)  │
        └───┬────────┬───┘   └──────────────────────┘        └────────────────┘
            │        │
            │        │  lifecycle_event rows
            │        ▼
            │   ┌──────────────────────────────────────────────┐
            │   │ apps/automation                              │
            │   │  ├─ console (Next.js :3001)                  │
            │   │  ├─ worker  (BullMQ ← Redis)                 │
            │   │  └─ webhook (:3100)  ◀── Meta WhatsApp       │
            │   └───────────────┬──────────────────────────────┘
            │                   │  sends
            │                   ▼
            │           WhatsApp Cloud API / Resend
            │
            │  HTTP proxy: /api/patient/wearables/[...path]
            └──────────────────────────────┐
                                           ▼
                        ┌───────────────────────────────────────┐
                        │  Open Wearables  (own DB + Redis)     │
                        │  FastAPI :8000 · Celery · Svix        │
                        │  Garmin · Oura · Whoop · Polar ·      │
                        │  Suunto · Strava · Fitbit · Ultrahuman│
                        │  Apple / Samsung / Health Connect SDK │
                        └───────────────────────────────────────┘
```

---

## 3. Why a monorepo, and how it is wired

`pnpm-workspace.yaml` globs `apps/*` and `packages/*`; **Turborepo** runs the task graph.

Three specific reasons the monorepo exists rather than separate repos:

1. **One schema, three apps.** `apps/web` writes a `contact` row, `apps/automation`'s worker reads it.
   With `@workspace/db` as a workspace package, a column added to `schema.ts` is typed in both places
   immediately — no client generation, no version skew.
2. **One design system.** `@workspace/ui` exports raw `.tsx` source (`"./components/*": "./src/components/*.tsx"`),
   and both Next apps list it in `transpilePackages`. There is no build step for the UI package, and
   both apps compile against the same Tailwind v4 theme file.
3. **One communication layer.** Both the patient app (manual admin sends) and the worker (automated
   sends) call the same `sendCommunication()`, so a WhatsApp send is logged identically no matter who
   triggered it.

`turbo.json` lists every environment variable that affects a build under `tasks.build.env`. That list
is not decoration — `eslint-plugin-turbo` fails lint on an undeclared `process.env` read, which is
what keeps the build cache from serving a stale bundle after a key rotates.

---

## 4. `apps/web` — the product

### 4.1 Route groups

| Group | Purpose |
|---|---|
| `(home)` | Marketing landing page, composed from `components/home/*` (3D + shader + GSAP sections). |
| `(docs)` | `docs`, `blogs`, and `biomarkers` — three separate fumadocs MDX collections. |
| `(dashboard)` | `dashboard` (patient), `doctor`, `health-coach`, `nutritionist`, `admin`, `superadmin`. |
| `api` | The entire backend. Namespaced by caller: `public/`, `patient/`, `staff/`, `admin/`, `superadmin/`. |

The API namespacing is the access-control convention: a route's path segment tells you which guard it
must apply, and the guards live in `src/lib/auth/require-role.ts` and `require-admin.ts`.

### 4.2 Auth (Better Auth)

`src/lib/auth/auth.ts` configures:

- `drizzleAdapter(db, { provider: "pg", schema })` — Better Auth writes into **the project's own**
  `user`/`session`/`account`/`verification` tables. That is why `user.role` is directly joinable from
  application queries instead of living in a separate auth store.
- `emailAndPassword` with `requireEmailVerification: false` — verification is informational; the
  column exists because Better Auth requires it.
- `socialProviders.google` with `accountLinking.enabled` — a Google sign-in merges into an existing
  email account rather than creating a duplicate.
- `plugins: [admin({...}), emailOTP()]` — the `admin` plugin validates **every** role string against
  its access map, so `doctor`, `health_coach` and `nutritionist` must be declared there even though
  they carry no admin permissions (`userAc`). Only `admin`/`superadmin` get `adminAc`.
- `nextCookies()` — makes session cookies behave in server actions and route handlers.

`src/lib/auth/config.ts` holds the role logic that the rest of the app calls: `resolveRole()`
lowercases and maps known typo aliases (a `neutritionsit` row in the DB behaves as `nutritionist`),
`getRoleBasedRedirect()` sends each role to its dashboard, and unrecognized roles fall through to
`/dashboard` as the deliberate catch-all.

There is **no `middleware.ts`** — every route handler and server component checks the session itself.

### 4.3 Biomarkers and biological age

This is the clinical core, and it is intentionally **data-driven rather than hard-coded**:

```
biomarker_index ──(index_domain_map)── biomarker_domain ──(domain_biomarker_map)── biomarker
                                              │                                        │
                                     domain_age_result                        biomarker_reading
                                              │                                        │
                                    biological_age_result ◀───────── calculate.ts ─────┘
```

A superadmin edits that taxonomy through `/api/superadmin/biomarker-config/*`. The model then reads
it at calculation time. `src/lib/biological-age/calculate.ts` is a **pure function** — no DB, no I/O —
so the math is testable in isolation:

- per biomarker: `mean = (min+max)/2`, `sd = (max-min)/4`, `Z = (value-mean)/sd`, take `|Z|`
- per domain: `Mean|Z|_d` over the biomarkers that actually have readings (a domain with none is
  dropped entirely)
- `W_d = Mean|Z|_d / Σ Mean|Z|_d` (sums to 1.0)
- `α_d = round(5·(Mean|Z|_d − min)/(max − min) + 1)`, clamped to 1..6

Both `W_d` and `α_d` are computed **relative to the domains present in that run**, not stored as
admin constants. The file documents one known deviation: the clinical rule is "Up adds, Down
subtracts", but this pass always adds, pending confirmation.

### 4.4 Report ingestion

`pdfjs-dist` extracts text **in the browser** (`src/lib/pdf/pdf.ts`) — the PDF never needs to reach a
server to be read. `src/lib/pdf/parser.ts` matches biomarker aliases and a fixed unit regex
(`mg/dL`, `mg/L`, `ng/mL`, `pg/mL`, `%`), normalizes units, and returns a `ParsedReport`. The patient
confirms the extracted values before `POST /api/patient/biomarker-readings/from-parsed-report` writes
them. The file itself goes to Cloudinary, not Postgres.

### 4.5 AI assistant

`POST /api/patient/ai/chat`:

1. session check → 2. count today's messages against the limit in `ai_assistant_config` →
3. `buildPatientContext()` assembles the patient's clinical data → 4. `buildSystemPrompt()` →
5. `streamText()` from the Vercel AI SDK against **either** `getOpenAI()` or `getGemini()` depending
on the config row → 6. stream to `@ai-sdk/react` → 7. persist both turns as `ai_message`.

The provider is a runtime choice, not a build-time one — which is the entire reason for the
provider-agnostic `ai` package instead of calling the OpenAI SDK directly. `streamdown` on the render
side matters for the same class of reason: it renders markdown that is still arriving, so a
half-written code fence does not flicker the transcript.

### 4.6 The Open Wearables proxy

`apps/web/src/app/api/patient/wearables/[...path]/route.ts` is a **catch-all GET proxy**:

```
/api/patient/wearables/<anything>  →  ${OPEN_WEARABLES_API_URL}/api/v1/<anything>
```

It forwards query params and any `Authorization` header, and responds `cache-control: no-store`.
One route covers the whole v1 surface, which is why the wearables page can call
`/api/patient/wearables/oauth/providers` and `/api/patient/wearables/oauth/{provider}/authorize`
without a route per endpoint.

Why proxy at all rather than let the browser call Open Wearables: the backend URL and credentials stay
server-side, and there is no CORS surface to configure. `NEXT_PUBLIC_OPEN_WEARABLES_API_URL` exists
for direct browser access but the proxy is the preferred path.

> **Known gaps in the current wearables page** (`(dashboard)/dashboard/wearables/page.tsx`): the
> Open Wearables `user_id` is read from `localStorage` with a **hard-coded UUID fallback**, and the
> proxy only implements `GET`. Connecting a wearable for a real patient needs the PredictFit user
> mapped to an Open Wearables user id (stored server-side), and the proxy extended to `POST`.

---

## 5. `apps/automation` — CRM + flow engine

One package, **three entrypoints**:

| Entrypoint | Command | What it is |
|---|---|---|
| Console | `pnpm dev` (:3001) | Next.js UI laid out along the pipeline: Home (an 8-stage / 4-phase derived funnel + what is stuck), Work (inbox, people, tasks, schedule — open to health coaches and receptionists), Automation (XYFlow canvas, run activity) and Setup (templates, media, audiences, availability), both admin-only, plus the 4-tab contact 360 view. |
| Worker | `pnpm worker` | BullMQ consumer — the thing that actually runs flows. |
| Webhook | `pnpm webhook` (:3100) | Raw `node:http` server for Meta's WhatsApp webhook. |

It is a separate app from `web` because the worker and webhook are **long-running processes**. A
serverless Next deployment cannot host a BullMQ worker that must survive between requests.

### 5.1 The event → flow pipeline

```
apps/web writes a row          worker polls every 5s        BullMQ
      │                               │                        │
emitDomainEvent(type, payload)        │                        │
      ▼                               ▼                        ▼
 lifecycle_event  ──────▶  findActiveFlowsForEvent  ──▶  automation_trigger_execution
                                                              (unique claim)
                                                                   │
                                                                   ▼
                                                        automation_flow_run
                                                                   │
                                                    engine.advanceRun() per node
                                                                   │
                                                        automation_node_execution
```

Design points worth knowing:

- **`emitDomainEvent()` is idempotent.** Pass the same `idempotencyKey` and a repeat call returns
  `null` instead of a duplicate row (it catches Postgres `23505`). Pass a transaction handle and the
  event becomes durable in the same transaction as the write that caused it.
- **Polling is an acknowledged MVP choice.** The worker rescans the 200 most recent events each tick
  and relies on the `(lifecycleEventId, flowId)` unique index to skip already-claimed pairs.
  `LISTEN/NOTIFY` or a watermark cursor is the documented next step.
- **A parked `Wait for Event` node wins over starting a new run.** That is what makes
  "wait up to 7 days for `APPOINTMENT_CREATED`" actually resume rather than kicking off a second flow.
- **Flow versions are immutable.** Editing publishes a new `automation_flow_version`; in-flight runs
  keep executing the graph they started on.
- **Delays are real delayed jobs**, not a cron sweep. `schedule-resume.ts` converts a run's wait state
  into a BullMQ delayed job after every step, so timing survives a worker restart.

The 20 node types are listed on the **09 Automation Engine** sheet. Note `nodes/ai.ts` is a
deliberate placeholder — a real registry entry with stub behavior, so graphs can reference an AI node
today and get a model later without a schema or graph migration.

### 5.2 WhatsApp

Outbound lives in `packages/communication/src/adapters/whatsapp.ts`, hand-rolled over Meta Graph
`v21.0`. Two decisions are load-bearing:

- **Credentials come from env vars, never the database.** Provider secrets are kept out of the schema
  on purpose.
- **WhatsApp's own caps are enforced locally** (10 list rows, 24-char row title, 20-char button
  label) so a long availability list degrades to a truncated-but-delivered message instead of a 400
  from Meta.

Inbound is `src/http-server.ts`: `GET` answers Meta's subscription challenge with
`WHATSAPP_WEBHOOK_VERIFY_TOKEN`; `POST` verifies the HMAC-SHA256 signature with `WHATSAPP_APP_SECRET`
using `timingSafeEqual`, records the message, and enqueues a `reply` job for any run waiting on that
contact. Delivery-failure payloads keep Meta's `errors[]` because the `status` column alone records
*that* a send failed and never *why*.

---

## 6. Shared packages

### `@workspace/db`

`schema.ts` is a single 930-line file holding all 37 tables (see sheet **07 Database Schema**),
grouped as: auth · clinical · biomarker config · biomarker data · biological age · AI · CRM ·
scheduling · ops · events · automation · media · messaging · marketing.

Two connection concerns are handled explicitly and are easy to get wrong:

- **`client.ts`** — pool size is `1` on Vercel and `10` elsewhere (`DB_POOL_MAX` overrides). Every
  warm serverless instance holds its own real pool, so a default of 10 across a few dozen instances
  exhausts Postgres.
- **`drizzle.config.ts`** — migrations use `DIRECT_URL`, not `DATABASE_URL`. Transaction-mode pooling
  hands out a different backend per transaction, which breaks DDL and session-scoped state.

`domain-events.ts` holds the 24-value event taxonomy shared by every emitter and consumer; it is
explicitly an open list.

### `@workspace/communication`

`sendCommunication()` takes a contact, channel, template and variables; picks the adapter
(`whatsapp` / `email` / `unimplemented`); resolves the template body through `template-body.ts`
(placeholder discovery + variable ordering); sends; and writes the `communication_message` row.
`sendTextMessage()` / `sendInteractiveListMessage()` cover free-form session messages, which are only
legal inside WhatsApp's 24-hour window.

### `@workspace/ui`

Exported as source, four groups of components:

| Group | Contents |
|---|---|
| primitives | ~45 shadcn/Radix/Base-UI components (button, dialog, table, sidebar, chart, calendar…) |
| `ai-elements/` | `conversation`, `message`, `prompt-input`, `suggestion` — the chat surface |
| `predict/` | `age-bar`, `bio-clock`, `biomarker-card` — PredictFit's own health widgets |
| `canvasui/` | `Liquid`, `blob`, `image-trail` — shader/canvas visuals for marketing |

---

## 7. Open Wearables integration

**What it is:** an open-source, self-hosted unifier for wearable data. One API instead of eight
provider integrations.

**Its own stack:** FastAPI (Python 3.13) · SQLAlchemy 2 + Alembic · Postgres 18 · Redis 8 ·
Celery (worker + beat + Flower) · Svix for outgoing webhooks · S3 for raw payload archival ·
React 19 + TanStack Router/Query/Start on Vite for the developer portal · a FastMCP server exposing
wearable data as AI tools.

**Providers:** cloud OAuth for Garmin, Oura, Whoop, Polar, Suunto, Strava, Fitbit, Ultrahuman;
SDK push for Apple HealthKit, Samsung Health, Google Health Connect.

**How PredictFit uses it — the full connect path:**

```
Patient clicks "Connect"  (apps/web wearables page)
        │
        ▼
GET /api/patient/wearables/oauth/providers?enabled_only=true&cloud_only=true
        │  (Next proxy)
        ▼
OW  GET /api/v1/oauth/providers        →  provider cards rendered
        │
Patient picks one
        ▼
GET /api/patient/wearables/oauth/{provider}/authorize?user_id=…
        │  (Next proxy)
        ▼
OW  GET /api/v1/oauth/{provider}/authorize   →  { authorization_url }
        │
window.location = authorization_url  →  provider consent screen
        │
        ▼
Provider redirects to OW  /api/v1/oauth/{provider}/callback   (direct, not via PredictFit)
        │
        ▼
OW stores an encrypted user_connection  →  Celery syncs data
        │
        ▼
Normalized data_point_series / summaries / health_score
        │
        ▼
PredictFit reads back through the same proxy (timeseries, summaries/{activity,sleep,recovery,body})
```

**Boundary rules:**

| Rule | Reason |
|---|---|
| Separate databases | Open Wearables is upstream software with its own Alembic migrations; sharing tables would make every version bump a merge conflict. |
| HTTP only, server-side | The proxy keeps the backend URL and credentials out of the browser and removes CORS from the picture. |
| Separate Redis | PredictFit's BullMQ defaults to `:6380` precisely so it does not collide with Open Wearables' Redis on `:6379` when both run locally. |
| Separate UI | The Open Wearables portal (:3000) is for operators; patients only ever see PredictFit's own wearables page. |

**Port collision note:** both `apps/web` and the Open Wearables frontend default to `:3000`. Locally,
set `FRONTEND_PORT` in the Open Wearables compose environment (or skip the `frontend` service) before
running both.

---

## 8. Cross-cutting decisions

| Decision | Rationale |
|---|---|
| Route handlers as the only backend | One deployable, one auth context, shared types with the UI. No separate API service to keep in sync. |
| Zod at every boundary | Request bodies, forms, and MDX frontmatter validate against one schema definition, then flow as inferred types. |
| Cloudinary for all binaries | PDFs and images never touch Postgres or the app server's disk; CDN delivery is free with it. |
| Pinned `recharts@3.8.0` | The shared `chart.tsx` wrapper depends on chart internals; a minor bump has broken it before. |
| Two animation libraries (Motion + GSAP) | Motion for component-scoped transitions; GSAP for the landing page's scroll timeline, which Motion's per-component model handles awkwardly. |
| Two primitive libraries (Radix + Base UI) | shadcn components are mid-migration; both coexist rather than blocking on a full rewrite. |
| `tsx` for all non-Next processes | Worker, webhook, seeds and ops scripts run straight from TypeScript with no build step. |

---

## 9. Running it

```bash
pnpm install

# database (from packages/db — needs DIRECT_URL)
pnpm --filter @workspace/db db:push
pnpm --filter @workspace/db create:superadmin
pnpm --filter @workspace/db create:ai-config
pnpm --filter @workspace/db create:cal-event-type

# apps
pnpm dev                                   # turbo: web :3000 + automation :3001

# automation background processes (separate terminals)
pnpm --filter automation worker
pnpm --filter automation webhook           # :3100

# Open Wearables (sibling repo)
cd ../open-wearables
cp backend/config/.env.example backend/config/.env
cp frontend/.env.example frontend/.env
docker compose up -d                       # api :8000, portal :3000, flower :5555, svix :8071
```

Regenerate the workbook after any stack change:

```bash
pnpm arch:xlsx
```

---

## 10. Keeping this current

| When you… | Update |
|---|---|
| add/remove a dependency | `dependencies` or `owDependencies` in `scripts/architecture-data.mjs` |
| add a table | `dbTables` |
| add a route handler | `apiRoutes` |
| add a flow node | `automationNodes` |
| add an env var | `envVars` (and `turbo.json` if it affects the build) |
| add an integration | `integrations` + `dataFlows` |
| change role permissions | `roles` + this file's §4.2 |
| complete a deliverable | `workSummary` + [WORK-SUMMARY.md](./WORK-SUMMARY.md) |

Then run `pnpm arch:xlsx`. The `.xlsx` is a build output — a manual edit to it is lost on the next
run.
