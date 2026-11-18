# PredictFit

A modern AI-powered healthcare platform built with **Next.js** that enables secure patient management, doctor workflows, health assessments, biomarker tracking, AI-powered health assistance, appointment booking, file management, and role-based dashboards.

Built as a scalable monorepo using **Turborepo, Better Auth, Drizzle ORM, PostgreSQL, shadcn/ui, OpenAI, Cloudinary, Resend, Cal.com, and Open Wearables**.

The monorepo ships **three applications**, split by who uses them rather than by what they are
built from — one database and one set of shared packages underneath all three:

| App | Port | Who works here | What they do |
| --- | ---- | -------------- | ------------ |
| `apps/web` | 3000 | patients, anonymous visitors | Marketing site, docs, and the patient's own dashboard |
| `apps/clinic` | 3002 | `doctor`, `nutritionist`, `admin`, `superadmin` | Charts, visit notes, appointments, care plans, user administration, biomarker taxonomy, AI config |
| `apps/automation` | 3001 | `health_coach`, `receptionist`, `admin`, `superadmin` | Leads, WhatsApp, tasks, appointments, walk-ins — plus the flow engine, worker and inbound webhook |

A role belongs to exactly one panel, and signing in to the wrong one redirects to the right one.
The two administrative roles are the deliberate exception: their work genuinely spans both staff
panels. The role list itself lives once in `@workspace/db/roles` — better-auth validates every role
against a map each app declares, so three hand-maintained copies would fail only on whichever app
happened to be doing the assigning.

---

## Features

* 🔐 Authentication with Better Auth
* 🔑 Google OAuth authentication
* 👥 Role-based access control
* 🧑‍💼 Admin dashboard
* 👨‍⚕️ Doctor dashboard
* 🧑‍⚕️ Patient dashboard
* 📊 Health assessment & dashboard
* 🩺 Patient management
* 👨‍⚕️ Doctor management
* 📁 Secure file/image uploads with Cloudinary
* 📧 Email notifications with Resend
* 🤖 AI-powered health assistance with OpenAI
* ⌚ Wearable data integration with Open Wearables
* 📅 Appointment booking with Cal.com
* 📋 Health and biomarker reports
* 🎨 Modern UI with shadcn/ui
* 🌙 Dark & Light mode
* ⚡ Fast data fetching with TanStack Query
* 🗄️ PostgreSQL database with Drizzle ORM
* 📱 Responsive design
* 🏗️ Monorepo powered by Turborepo
* 💬 WhatsApp messaging with the Meta Cloud API
* 🔀 Visual automation builder (drag-and-drop flow canvas)
* ⚙️ Background flow engine with BullMQ + Redis
* 📇 Lead & contact CRM with audiences and segments
* 📡 Domain-event pipeline driving lifecycle automation

---

## Tech Stack

### Frontend

* Next.js
* React
* TypeScript
* Tailwind CSS
* shadcn/ui
* Base UI
* Radix UI
* React Hook Form
* Zod
* Recharts

### Backend

* Better Auth
* Drizzle ORM
* PostgreSQL
* Resend
* Cloudinary

### AI

* Vercel AI SDK
* OpenAI API
* Google Gemini API

### Healthcare & Integrations

* Open Wearables
* Cal.com

### Automation & Messaging

* BullMQ
* Redis
* React Flow (@xyflow/react)
* WhatsApp Cloud API (Meta Graph)

### Tooling

* Turborepo
* pnpm
* ESLint
* Prettier

---

## Architecture

PredictFit is organized as a role-based healthcare platform.

> **Detailed architecture:** see [ARCHITECTURE.md](./ARCHITECTURE.md) for the full breakdown of every
> app, package, dependency, integration, database table, API route and data flow — and
> [PredictFit-Architecture.xlsx](./PredictFit-Architecture.xlsx) for the same content as filterable
> spreadsheet tables (regenerate with `pnpm arch:xlsx`).

```text
                              PredictFit
                                  │
          ┌───────────────────────┴───────────────────────┐
          │                                               │
     apps/web  :3000                            apps/automation  :3001
  (patient + care team)                        (internal CRM + engine)
          │                                               │
  ┌───────┼────────┐                        ┌─────────────┼─────────────┐
  │       │        │                        │             │             │
Website  Auth   Dashboards               Console       Worker        Webhook
  │       │        │                     (Next.js)    (BullMQ)       (:3100)
  │  Better Auth   ├── Patient                │             │             ▲
  │       │        ├── Doctor                 │             │             │
  │  Google OAuth  ├── Health Coach           │             │       WhatsApp in
  │                ├── Nutritionist           │             │
  │                ├── Admin                  └──────┬──────┘
  │                └── Superadmin                     │
  │                                          lifecycle_event (domain events)
  └──────────────────────┬─────────────────────────────┘
                         │
                  Shared Packages
      @workspace/ui · @workspace/db · @workspace/communication
                         │
  ┌──────────┬───────────┼───────────┬──────────┬──────────┐
  │          │           │           │          │          │
PostgreSQL  Redis    Cloudinary   Resend    OpenAI /   Cal.com
(Drizzle)  (BullMQ)                         Gemini
                         │
                   WhatsApp Cloud API
                         │
                   Open Wearables  :8000
          (Garmin · Oura · Whoop · Polar · Suunto ·
           Strava · Fitbit · Ultrahuman · Apple · Samsung)
```

---

## Project Structure

```text
.
├── apps
│   ├── web                     # Next.js app — patient & care-team product (:3000)
│   │   └── src
│   │       ├── app             # routes: (home) (docs) (dashboard) api
│   │       ├── components      # auth, dashboard, home, docs, layout
│   │       ├── content         # MDX: docs, blogs, biomarkers
│   │       └── lib             # auth, ai, biological-age, pdf, cal-com, cloudinary
│   │
│   └── automation              # Next.js app — internal CRM + flow engine (:3001)
│       └── src
│           ├── app             # console pages + API routes
│           ├── components      # flow-canvas (React Flow)
│           ├── nodes           # one file per automation node type
│           ├── lib             # WhatsApp templates, CSV import, scheduling
│           ├── engine.ts       # startRun / advanceRun / resumeWithReply
│           ├── worker.ts       # BullMQ worker — runs the flows
│           ├── queue.ts        # "automation-flow" queue definition
│           └── http-server.ts  # WhatsApp webhook receiver (:3100)
│
├── packages
│   ├── ui                      # Shared UI components (shadcn/ui + Radix + Base UI)
│   ├── db                      # Drizzle schema, client, domain events
│   ├── communication           # Channel adapters: WhatsApp + email
│   ├── typescript-config
│   └── eslint-config
│
├── scripts                     # Architecture workbook generator
├── ARCHITECTURE.md
├── PredictFit-Architecture.xlsx
├── turbo.json
├── pnpm-workspace.yaml
└── README.md
```

---

## Getting Started

### Clone the repository

```bash
git clone <repository-url>
cd predictfit
```

### Install dependencies

```bash
pnpm install
```

---

## Environment Variables

Each application has its own `.env`. Copy the checked-in templates:

```bash
cp apps/web/.env.example apps/web/.env
cp apps/clinic/.env.example apps/clinic/.env
cp apps/automation/.env.example apps/automation/.env
cp packages/db/.env.example packages/db/.env
```

### `apps/web`

```env
# Application
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# Better Auth
BETTER_AUTH_SECRET=
BETTER_AUTH_URL="http://localhost:3000"

# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Database
DATABASE_URL=

# Resend
RESEND_API_KEY=

# Cloudinary
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
CLOUDINARY_URL=

# Open Wearables
OPEN_WEARABLES_API_URL="http://localhost:8000"
NEXT_PUBLIC_OPEN_WEARABLES_API_URL="http://localhost:8000"

# OpenAI
OPENAI_API_KEY=

# Cal.com
CAL_API_KEY=
CAL_EVENT_TYPE_ID=
CAL_CLINIC_ADDRESS=
CAL_CLINIC_TIMEZONE=
```

### `apps/automation`

```env
# Better Auth (must match apps/web to share a session)
BETTER_AUTH_SECRET=
BETTER_AUTH_URL="http://localhost:3001"

# Database
DATABASE_URL=
DIRECT_URL=

# Redis — BullMQ queue for the flow engine
REDIS_URL="redis://localhost:6380"

# Webhook server port
PORT=3100

# WhatsApp Cloud API (Meta)
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_WABA_ID=
WHATSAPP_APP_ID=
WHATSAPP_APP_SECRET=
WHATSAPP_WEBHOOK_VERIFY_TOKEN=

# Resend
RESEND_API_KEY=

# Cloudinary
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

### Environment Variable Reference

| Variable                             | Purpose                              |
| ------------------------------------ | ------------------------------------ |
| `NEXT_PUBLIC_APP_URL`                | Public application URL               |
| `BETTER_AUTH_SECRET`                 | Better Auth session/security secret  |
| `BETTER_AUTH_URL`                    | Better Auth base URL                 |
| `GOOGLE_CLIENT_ID`                   | Google OAuth client ID               |
| `GOOGLE_CLIENT_SECRET`               | Google OAuth client secret           |
| `DATABASE_URL`                       | PostgreSQL database connection       |
| `RESEND_API_KEY`                     | Email delivery through Resend        |
| `CLOUDINARY_CLOUD_NAME`              | Cloudinary cloud name                |
| `CLOUDINARY_API_KEY`                 | Cloudinary API key                   |
| `CLOUDINARY_API_SECRET`              | Cloudinary API secret                |
| `CLOUDINARY_URL`                     | Cloudinary connection URL            |
| `OPEN_WEARABLES_API_URL`             | Open Wearables backend URL           |
| `NEXT_PUBLIC_OPEN_WEARABLES_API_URL` | Client-accessible Open Wearables URL |
| `OPENAI_API_KEY`                     | OpenAI API authentication            |
| `CAL_API_KEY`                        | Cal.com API authentication           |
| `CAL_EVENT_TYPE_ID`                  | Cal.com appointment event type       |
| `CAL_CLINIC_ADDRESS`                 | Clinic address used for appointments |
| `CAL_CLINIC_TIMEZONE`                | Clinic appointment timezone          |
| `GEMINI_API_KEY`                     | Google Gemini API authentication     |
| `DIRECT_URL`                         | Non-pooled Postgres URL (migrations)  |

Additional variables used by `apps/automation`:

| Variable                          | Purpose                                          |
| --------------------------------- | ------------------------------------------------ |
| `REDIS_URL`                       | BullMQ queue connection (defaults to `:6380`)     |
| `PORT`                            | WhatsApp webhook server port (defaults to 3100)  |
| `WHATSAPP_PHONE_NUMBER_ID`        | Meta phone number ID every message is sent from  |
| `WHATSAPP_ACCESS_TOKEN`           | Graph API bearer token                           |
| `WHATSAPP_WABA_ID`                | WhatsApp Business Account ID (template sync)     |
| `WHATSAPP_APP_ID`                 | Meta app ID                                      |
| `WHATSAPP_APP_SECRET`             | Verifies the inbound webhook HMAC signature      |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN`   | Answers Meta's webhook verification challenge    |

> **Security:** Never commit `.env` files, API keys, OAuth secrets, database credentials, or other sensitive environment variables to Git.

---

## Database

PredictFit uses **PostgreSQL** with **Drizzle ORM**. The schema lives in `packages/db`, so every
database command is run against that package.

> Migrations use `DIRECT_URL` (the non-pooled endpoint), not `DATABASE_URL` — a transaction-mode
> pooler hands out a different backend per transaction, which breaks DDL.

### Generate migrations

```bash
pnpm --filter @workspace/db generate
```

### Push schema

```bash
pnpm --filter @workspace/db db:push
```

### Run migrations

```bash
pnpm --filter @workspace/db db:migrate
```

### Open Drizzle Studio

```bash
pnpm --filter @workspace/db db:studio
```

### First-run bootstrap

```bash
pnpm --filter @workspace/db create:superadmin        # create the first superadmin account
pnpm --filter @workspace/db create:ai-config         # seed the AI assistant configuration
pnpm --filter @workspace/db create:cal-event-type    # create the Cal.com event type
```

---

## Development

### Start development server

```bash
pnpm dev            # turbo: web on :3000 and automation on :3001
```

To run a single app:

```bash
pnpm --filter web dev            # :3000
pnpm --filter automation dev     # :3001
```

### Start the automation background processes

The flow engine and the WhatsApp webhook are long-running Node processes, so they are
started separately from the Next.js servers (each in its own terminal):

```bash
pnpm --filter automation worker    # BullMQ worker — executes automation flows
pnpm --filter automation webhook   # WhatsApp webhook receiver on :3100
```

Both require a reachable Redis. `REDIS_URL` defaults to `redis://localhost:6380` so it does
not collide with the Open Wearables Redis on `:6379`.

### Build

```bash
pnpm build
```

### Start production

```bash
pnpm --filter web start          # :3000
pnpm --filter automation start   # :3001
```

### Lint

```bash
pnpm lint
```

---

## Authentication

PredictFit uses **Better Auth** for authentication and authorization.

### Authentication Features

* Email & Password
* Google OAuth
* Session management
* Protected routes
* Role-based authorization
* Email verification
* Password management

### User Roles

#### Admin

Admin users can manage:

* Patients
* Doctors
* User access
* Appointments
* Reports
* Platform data

#### Doctor

Doctors can:

* View assigned patients
* Review patient information
* Review health assessments
* Review biomarker information
* Create patient reports
* Edit reports
* Send reports
* Manage patient-related workflows

#### Patient

Patients can:

* Complete health assessments
* View their health dashboard
* View reports
* Upload health documents
* Book appointments
* Chat with the AI assistant
* Communicate with their assigned health coach
* Manage their profile

---

## Patient Dashboard

The patient dashboard provides a centralized view of the patient's health journey.

### Main Modules

* Dashboard Overview
* Health Assessment
* Health Data
* Biomarker Information
* Reports
* Appointments
* AI Health Assistant
* Health Coach Chat
* Family Member Management
* File Uploads
* Notifications
* Profile & Settings

### Patient Flow

```text
Signup / Login
      ↓
Complete Health Assessment
      ↓
Health Dashboard
      ↓
View Health Data
      ↓
Generate / View Report
      ↓
AI Health Assistance
      ↓
Book Appointment
      ↓
Doctor Consultation
      ↓
Follow-up & Monitoring
```

---

## Doctor Dashboard

The doctor dashboard provides tools for reviewing and managing assigned patients.

### Main Modules

* Doctor Overview
* Patient List
* Patient Profile
* Health Assessment
* Biomarker Data
* Reports
* Report Builder
* Appointment Management
* Patient Communication
* Notifications
* Profile & Settings

### Doctor Flow

```text
Doctor Login
     ↓
Doctor Dashboard
     ↓
Patient List
     ↓
Select Patient
     ↓
Review Patient Data
     ↓
Review Assessment / Biomarkers
     ↓
Create Report
     ↓
Edit Report
     ↓
Send / Publish Report
```

---

## Admin Dashboard

The admin dashboard provides platform-level management.

### Main Modules

* Admin Overview
* User Management
* Patient Management
* Doctor Management
* Role & Access Management
* Appointment Management
* Report Management
* Platform Analytics
* Notifications
* System Settings

### Admin Flow

```text
Admin Login
     ↓
Admin Dashboard
     ↓
Users / Doctors / Patients
     ↓
Manage Access
     ↓
Monitor Appointments
     ↓
Monitor Reports
     ↓
Platform Management
```

---

## AI Integration

PredictFit uses the **OpenAI API** to provide AI-powered health assistance.

### AI Capabilities

* Health-related conversational assistance
* Patient question answering
* Context-aware health discussions
* AI-assisted information discovery

AI responses should not replace professional medical diagnosis or treatment.

---

## Open Wearables Integration

PredictFit integrates with **Open Wearables** for wearable and health-related data.

```text
Wearable Device
      ↓
Open Wearables
      ↓
PredictFit Backend
      ↓
Patient Health Data
      ↓
Patient Dashboard
```

The integration URL is configured using:

```env
OPEN_WEARABLES_API_URL=
NEXT_PUBLIC_OPEN_WEARABLES_API_URL=
```

---

## Appointment Management

PredictFit uses **Cal.com** for appointment scheduling.

### Appointment Features

* Appointment booking
* Event type configuration
* Clinic address
* Clinic timezone
* Appointment management

Environment variables:

```env
CAL_API_KEY=
CAL_EVENT_TYPE_ID=
CAL_CLINIC_ADDRESS=
CAL_CLINIC_TIMEZONE=
```

---

## File Management

PredictFit uses **Cloudinary** for secure media/file management.

Cloudinary configuration:

```env
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
CLOUDINARY_URL=
```

Typical use cases include:

* Patient document uploads
* Health report assets
* Profile images
* Medical/health-related files

---

## Email Notifications

PredictFit uses **Resend** for transactional email delivery.

```env
RESEND_API_KEY=
```

Possible email workflows include:

* Email verification
* Password reset
* Appointment notifications
* Report notifications
* Patient communication

---

## Automation App

`apps/automation` is the internal operations application. It is a separate app from `apps/web`
because two of its three entrypoints are **long-running processes**, which a serverless Next.js
deployment cannot host.

| Entrypoint | Command | What it is |
| ---------- | ------- | ---------- |
| Console | `pnpm --filter automation dev` | Next.js UI on `:3001` — CRM and flow builder |
| Worker | `pnpm --filter automation worker` | BullMQ consumer that actually executes flows |
| Webhook | `pnpm --filter automation webhook` | WhatsApp webhook receiver on `:3100` |

### Console Modules

The console is laid out along the pipeline it runs, not along the subsystems it is built from.
That pipeline is:

```
CAPTURE  ->  NURTURE  ->  REPLY  ->  BOOK  ->  PATIENT
lead          day 1/3/5    they tap    dates +   converted on
arrives       WhatsApp     or write    slots     a real booking
                              |
                              +-> automation can't handle it -> TASK for a human
```

The sidebar is grouped by **when you use a screen**, which is what keeps it readable as pages are
added. Section headings are labels, not links — an intermediate hub page costs a click and hides
the map.

| Group | Screen | Route | What it is for |
| ----- | ------ | ----- | -------------- |
| — | Home | `/home` | The funnel with live counts, and everything currently stuck waiting on a human |
| Work | Inbox | `/conversations` | WhatsApp threads; reply inside the 24h window |
| Work | People | `/contacts` | Leads and patients in one list, stage as a filter |
| Work | Tasks | `/tasks` | Handoffs automation raised for a human — claim one to work it |
| Work | Schedule | `/schedule` | The day's appointments across every doctor |
| Automation | Flows | `/flows` | The drag-and-drop canvas |
| Automation | Activity | `/runs` | Every run, the node it is parked on, the messages it sent |
| Setup | Templates | `/templates` | Message templates and Meta submission |
| Setup | Media | `/stock` | Cloudinary image/document library |
| Setup | Audiences | `/audience` | Saved segments for broadcasts |
| Setup | Availability | `/availability` | Per-doctor bookable windows |

**Setup is deliberately last.** A template editor and an inbox look equally urgent when they sit
in one undifferentiated list; separating them is most of what makes the sidebar legible.

#### Who sees what

| | Home + Work | Automation + Setup |
| --- | --- | --- |
| `admin`, `superadmin` | yes | yes |
| `health_coach`, `receptionist` | yes | no |

Health coaches are the lead desk **and** the patient desk — the same person is chased before they
book and answered after they have a problem — so Work deliberately spans the LEAD/PATIENT line.
They have no business editing a published flow or submitting a template to Meta, so Automation and
Setup are admin-only, enforced in three places: the sidebar hides the sections, each route folder
wraps itself in `<AdminOnly>`, and every matching API route calls `requireAutomationAdmin`. A
hidden link is not an access control.

Health coaches therefore do **not** have a dashboard in `apps/web` — `/health-coach` redirects to
this console. One role with two dashboards is worse than either alone.

**Home** (`/home`) is the map. It shows the five funnel stages with live counts — each linking to
the screen where you act on that stage — one paragraph explaining how a lead becomes a patient, and
a "needs attention" panel: replies we haven't answered (with the 24h window counting down), overdue
tasks, sends that never arrived, and failed runs. Every number is derived at query time; there is
no pipeline table.

**Contact 360** (`/contacts/[id]`) is where the team works one person. Four tabs: **Overview**
(book a visit, raise a task, log adherence), **Medical** (chart, biological age, biomarkers, visit
notes, reports), **Chat** (the WhatsApp thread with a live 24h window indicator, plus what they
asked the patient-facing AI assistant), and **Journey** (which flows ran for them and which node
each is parked on).

### Stages: five stored, eight shown

These are two different questions and deliberately two different lists.

**`contact.stage` — five lifecycle values, stored.** Each one is a fact about the person that
only moves on a real event:

| Stage | Set when |
| ----- | -------- |
| `LEAD` | contact created (form, CSV import, walk-in, inbound WhatsApp) |
| `BOOKED` | an appointment is created |
| `PATIENT` | an appointment is marked **completed** |
| `INACTIVE` | was a patient, has gone quiet |
| `LOST` | disqualified or explicitly not interested |

`BOOKED` exists because booking and attending are not the same event. While they were one value,
a no-show stayed marked as converted forever — and since every nurture flow checks
`stage == "LEAD"`, the warmest lead in the system fell silently out of all automation. A no-show or
cancellation now moves them back to `LEAD` (unless another appointment still stands) and nurture
resumes.

Alongside it, `contact.engagement` (`ACTIVE` / `LONG_TERM` / `DO_NOT_CONTACT`) records how someone
should be worked, independently of where they are. Two axes is what stops the stage list growing:
a person can be a long-term *lead*.

#### How a stage actually changes

Most of it moves on its own. The two that need a person are the two you only learn by talking to
someone, and both are recorded from the contact's Overview tab.

| Transition | Who moves it |
| ---------- | ------------ |
| → `LEAD` | contact created — form, CSV import, walk-in, inbound WhatsApp |
| `LEAD` → `BOOKED` | automatic, on creating an appointment |
| `BOOKED` → `PATIENT` | automatic, on marking a visit **completed** |
| `BOOKED` → `LEAD` | automatic, on no-show or cancellation (unless another visit still stands) |
| `PATIENT` → `INACTIVE` | the **Lapse Watch** flow — `pnpm seed:lapse-watch` |
| → `LOST` | a person, from the Overview tab |
| back to `LEAD` | a person, from the Overview tab |
| `engagement` | `LONG_TERM` by the nurture flow; `ACTIVE` / `DO_NOT_CONTACT` by a person |

`BOOKED` and `PATIENT` **cannot be set by hand** — the API rejects them. Both are earned by an
appointment row, and the console's Booked and Attended columns are derived from those same rows, so
a hand-set `BOOKED` would put someone in a column with nothing booked.

Going quiet is the one transition with no event behind it: it is the *absence* of a booking, and
nothing fires on absence. Lapse Watch handles it with a Wait for Event node that parks after a
completed visit and only acts on its timeout branch.

**`DO_NOT_CONTACT` now switches consent off too.** `checkConsent()` — the only thing that actually
stops a send — reads `contactCommunicationPreference` and has never looked at `engagement`, so the
flag used to be decorative while messages kept going out. Setting it writes the consent row:
marketing, appointment reminders and medical reminders off, `transactional` left on, since those
answer something the person asked for.

**The console funnel — eight operational stages in four phases, computed.**

```
ACQUISITION        ENGAGEMENT              APPOINTMENT                      PATIENT
New Lead     ->    Engaged           ->    Appointment pending      ->      Patient
Nurturing          Human follow-up         Booked
                                           Attended
```

None of these are stored. Each is derived from rows we already hold — active runs, inbound
messages, open tasks, appointment status — by a single ordered `CASE` in
`apps/automation/src/lib/operational-stage-sql.ts`, shared by the Home funnel and the People
filter so a count and the list behind it can never disagree. Branches are evaluated
most-advanced-first, so every contact lands in exactly one bucket and the columns sum to the
number of people on record.

Storing them would create a second source of truth that drifts: `stage = ATTENDED` next to
`appointment.status = cancelled` is a contradiction the database would happily hold, and someone
would then have to decide which to believe. Deriving also means the next operational question
("who is mid-booking?") is answered by adding a branch, not another value to `contact.stage` —
which is how stage lists reach twenty entries that nobody maintains.

`INACTIVE`, `LOST`, no-shows, cancellations and do-not-contact sit **outside** the funnel as side
filters. They are exits and flags, not steps.
### How Automation Works

Automation is **event-driven**. Anything meaningful that happens in `apps/web` writes a row to the
`lifecycle_event` table through `emitDomainEvent()`. The worker picks those rows up and runs any
flow subscribed to that event type.

```text
apps/web action              worker (every 5s)            BullMQ
      │                            │                         │
emitDomainEvent(TYPE, payload)     │                         │
      ▼                            ▼                         ▼
 lifecycle_event  ─────▶  find subscribed flows  ─────▶  automation_flow_run
                                                              │
                                                   execute node by node
                                                              │
                                                   automation_node_execution
```

Key properties:

* **Idempotent events** — passing the same `idempotencyKey` twice is a safe no-op, not a duplicate.
* **Immutable flow versions** — editing a flow publishes a new version; in-flight runs keep
  executing the graph they started on.
* **Real delayed jobs** — a Delay node becomes a BullMQ delayed job, so timing survives a restart.
* **Resumable runs** — a run can park on `Wait for Reply` or `Wait for Event` and resume days later.

### Flow Node Types

Each node is one file in `apps/automation/src/nodes`:

| Category | Nodes |
| -------- | ----- |
| Entry | `trigger`, `load-contact` |
| Logic | `condition`, `variable`, `loop`, `score` |
| Timing | `delay`, `wait-for-reply`, `wait-for-event` |
| Messaging | `send-communication`, `send-text`, `send-available-dates`, `send-available-time-slots` |
| Actions | `book-appointment`, `create-task`, `database-update`, `emit-event` |
| External | `api-call`, `webhook` |
| Planned | `ai` (registered placeholder — not yet wired to a model) |

### WhatsApp Integration

Outbound messages go through `@workspace/communication`, which posts to the Meta Graph API
(`v21.0`). Credentials are read from environment variables only — provider secrets are
deliberately kept out of the database schema.

Inbound messages hit the webhook server, which verifies Meta's HMAC-SHA256 signature before
recording anything, then resumes any flow run waiting on that contact.

```text
Contact replies on WhatsApp
        ▼
Meta  ──▶  webhook :3100  ──▶  HMAC verify  ──▶  communication_message
                                                        │
                                            find waiting run for contact
                                                        ▼
                                             BullMQ reply job → flow resumes
```

### Utility Scripts

```bash
pnpm --filter automation seed                    # base seed data
pnpm --filter automation seed:lead-nurture       # sample lead-nurture flow
pnpm --filter automation seed:appointment-flow   # sample appointment-booking flow
pnpm --filter automation sync:templates          # pull approved templates from Meta
pnpm --filter automation submit:template         # submit a template to Meta for approval
pnpm --filter automation check:whatsapp          # verify WhatsApp credentials
pnpm --filter automation check:csv               # validate a contact CSV import
pnpm --filter automation send:test               # send a single test message
```

---

## UI Components

The project uses **shadcn/ui** with shared components.

To add a new component:

```bash
pnpm dlx shadcn@latest add button -c apps/web
```

Components are generated inside:

```text
packages/ui/src/components
```

Import components using:

```tsx
import { Button } from "@workspace/ui/components/button";
```

---

## Shared Packages

| Package                        | Purpose                         |
| ------------------------------ | ------------------------------- |
| `@workspace/ui`                | Shared UI components                       |
| `@workspace/db`                | Database schema, client, and domain events |
| `@workspace/communication`     | WhatsApp and email sending adapters        |
| `@workspace/eslint-config`     | Shared ESLint configuration                |
| `@workspace/typescript-config` | Shared TypeScript configuration            |

---

## Core Integrations

| Service        | Purpose                        |
| -------------- | ------------------------------ |
| Better Auth    | Authentication & authorization |
| Google OAuth   | Social authentication          |
| PostgreSQL     | Application database           |
| Drizzle ORM    | Database ORM                   |
| Cloudinary     | File & media management        |
| Resend         | Email delivery                 |
| OpenAI         | AI health assistant            |
| Open Wearables | Wearable/health data           |
| Cal.com        | Appointment scheduling         |
| Google Gemini  | Alternate AI model provider    |
| WhatsApp Cloud API | Patient & lead messaging   |
| Redis (BullMQ) | Automation job queue           |

---

## Roadmap

* [x] Authentication
* [x] Role-based dashboards
* [x] Patient management
* [x] Doctor management
* [x] Database integration
* [x] File upload infrastructure
* [x] Email infrastructure
* [x] AI integration
* [x] Appointment integration
* [x] WhatsApp messaging integration
* [x] Visual automation builder
* [x] Background flow engine
* [x] Lead & contact CRM
* [ ] Advanced biomarker reports
* [ ] Advanced health analytics
* [ ] Expanded wearable integrations
* [ ] Advanced notifications
* [ ] Platform analytics
* [ ] AI node wired to a model in the flow engine
* [ ] LISTEN/NOTIFY instead of event polling in the worker

---

## Contributing

1. Fork the repository.

2. Create a feature branch:

```bash
git checkout -b feature/my-feature
```

3. Commit your changes:

```bash
git commit -m "Add feature"
```

4. Push the branch:

```bash
git push origin feature/my-feature
```

5. Open a Pull Request.

---

## License

MIT License.

---

Built with ❤️ using **Next.js, Turborepo, Better Auth, Drizzle ORM, PostgreSQL, shadcn/ui, OpenAI, Cloudinary, Resend, Cal.com, and Open Wearables.**
