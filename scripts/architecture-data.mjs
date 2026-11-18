/**
 * Single source of truth for the architecture workbook (and the tables in
 * ARCHITECTURE.md). Edit this file when the stack changes, then run
 * `pnpm arch:xlsx` — that is the intended update path, rather than editing
 * the generated .xlsx by hand and losing the change on the next run.
 */

export const GENERATED_FROM = {
  monorepo: "f:/Predict/predictfit",
  sibling: "f:/Predict/open-wearables",
};

// ---------------------------------------------------------------------------
// 1. Overview
// ---------------------------------------------------------------------------

export const overview = {
  name: "01 Overview",
  title: "PredictFit — System Overview",
  note: "AI-powered preventive-health platform. Turborepo monorepo (apps/web + apps/automation) plus a self-hosted Open Wearables backend as a sibling service.",
  columns: [
    { header: "Layer", width: 26 },
    { header: "Component", width: 30 },
    { header: "Technology", width: 30 },
    { header: "Runs As / Port", width: 24 },
    { header: "Responsibility", width: 80 },
  ],
  rows: [
    ["Product surface", "apps/web", "Next.js 16 (App Router) + React 19", "Next server, :3000", "Marketing site, docs/blog/biomarker content, auth, and all five role dashboards (patient, doctor, health coach, nutritionist, admin/superadmin)."],
    ["Clinical surface", "apps/clinic", "Next.js 16", "Next server, :3002", "Doctor, nutritionist, admin and superadmin: charts, visit notes, appointments, care plans, user administration, biomarker taxonomy and AI configuration."],
    ["Ops surface", "apps/automation", "Next.js 16 + @xyflow/react", "Next server, :3001", "Internal CRM + visual automation builder: contacts, leads, audiences, conversations, templates, tasks, availability, flow canvas, run activity, and a contact 360 view for the care team."],
    ["Background runtime", "apps/automation worker", "BullMQ + ioredis + tsx", "long-running Node process", "Consumes domain events, starts/advances/resumes automation flow runs, schedules delayed resumes."],
    ["Webhook runtime", "apps/automation webhook", "node:http + node:crypto", "HTTP server, :3100", "Receives Meta WhatsApp Cloud API webhooks (inbound messages + delivery statuses), verifies HMAC, resumes waiting runs."],
    ["Shared UI", "packages/ui", "shadcn/ui + Base UI + Radix + Tailwind v4", "library (source-exported)", "Design system consumed by both apps: primitives, charts, AI chat elements, PredictFit-specific health widgets, shader/canvas visuals."],
    ["Shared data", "packages/db", "Drizzle ORM + node-postgres", "library", "The single Postgres schema (37 tables), pooled client, domain-event taxonomy + emitter, phone/stage helpers, admin seed scripts."],
    ["Shared messaging", "packages/communication", "Resend + WhatsApp Cloud API", "library", "Channel-agnostic send layer: picks an adapter per channel, resolves template bodies, logs every message to the DB."],
    ["Tooling", "packages/eslint-config, packages/typescript-config", "ESLint 9 flat config, tsconfig bases", "library", "Shared lint/type baselines so every workspace unit compiles and lints identically."],
    ["Wearables service", "open-wearables/backend", "FastAPI (Python 3.13) + SQLAlchemy + Celery", "Docker, :8000", "Unified wearable API: provider OAuth, sync, normalization into time-series/summaries, health scores, outgoing webhooks."],
    ["Wearables portal", "open-wearables/frontend", "React 19 + TanStack Router/Query/Start (Vite)", "Docker, :3000", "Developer portal for Open Wearables: users, data sources, API keys, webhooks (separate from PredictFit's own UI)."],
    ["Wearables AI bridge", "open-wearables/mcp", "FastMCP + httpx", "MCP server", "Exposes wearable users/activity/sleep/workouts/timeseries as MCP tools for AI assistants."],
    ["Datastores", "PostgreSQL", "Postgres 18", "managed / Docker :5432", "PredictFit app DB (Drizzle-managed) and, separately, the Open Wearables DB (Alembic-managed). Two databases, never shared tables."],
    ["Datastores", "Redis", "Redis 8", "Docker :6379 / :6380", "BullMQ queue + delayed jobs for PredictFit automation; Celery broker/result backend + sleep-score cache for Open Wearables."],
  ],
};

// ---------------------------------------------------------------------------
// 2. Workspace units
// ---------------------------------------------------------------------------

export const workspaces = {
  name: "02 Apps & Packages",
  title: "Workspace Units (pnpm workspace + Turborepo)",
  note: "pnpm-workspace.yaml globs apps/* and packages/*. Turborepo orchestrates build/lint/format/typecheck with ^ dependency ordering; dev is cache:false + persistent.",
  columns: [
    { header: "Workspace name", width: 30 },
    { header: "Path", width: 28 },
    { header: "Type", width: 14 },
    { header: "Key scripts", width: 46 },
    { header: "Depends on (internal)", width: 44 },
    { header: "Why it exists", width: 78 },
  ],
  rows: [
    ["web", "apps/web", "app", "dev (:3000), build, start, lint, format, typecheck, postinstall (fumadocs-mdx)", "@workspace/ui, @workspace/db, @workspace/communication", "The patient/clinician-facing product. Owns auth, content, dashboards, biomarker + biological-age features, AI chat, appointments, uploads, and the wearables proxy."],
    ["automation", "apps/automation", "app", "dev (:3001), worker, webhook, seed*, check:*, submit:template, sync:templates, send:test", "@workspace/ui, @workspace/db, @workspace/communication", "Internal growth/ops console AND the flow engine host. Split from web because the worker and webhook server are long-running processes that must not live in a serverless Next deployment."],
    ["@workspace/ui", "packages/ui", "library", "lint, format, typecheck", "—", "Shared component library. Exported as raw source (./components/*.tsx) and transpiled by Next via transpilePackages, so both apps get one Tailwind theme and one set of primitives."],
    ["@workspace/db", "packages/db", "library", "db:push, db:migrate, db:studio, generate, create:superadmin, create:ai-config, create:cal-event-type", "—", "One schema owned by one package. Both apps and the worker import the same Drizzle tables, so a column added once is visible everywhere without duplication or drift."],
    ["@workspace/communication", "packages/communication", "library", "typecheck", "@workspace/db", "Channel abstraction. Callers say 'send this template to this contact on this channel'; the package picks the adapter (WhatsApp/email), resolves variables, and records the message row."],
    ["@workspace/eslint-config", "packages/eslint-config", "config", "—", "—", "Three shareable flat configs (base, next-js, react-internal) so lint rules are declared once."],
    ["@workspace/typescript-config", "packages/typescript-config", "config", "—", "—", "Shared tsconfig bases (base / nextjs / react-library) so compiler options do not drift per package."],
  ],
};

// ---------------------------------------------------------------------------
// 3. Dependencies — the "what and why" sheet
// ---------------------------------------------------------------------------

const dep = (pkg, version, where, category, why, linkedTo) => [pkg, version, where, category, why, linkedTo];

export const dependencies = {
  name: "03 Dependencies (Why)",
  title: "Every Package — What It Is Used For, and What It Connects To",
  note: "Versions are the semver ranges declared in package.json. 'Connected to' names the concrete file(s) or subsystem that consume it.",
  columns: [
    { header: "Package", width: 34 },
    { header: "Version", width: 13 },
    { header: "Used in", width: 24 },
    { header: "Category", width: 22 },
    { header: "Why it is used", width: 92 },
    { header: "Connected to", width: 62 },
  ],
  rows: [
    // --- Framework / runtime ---
    dep("next", "16.2.6", "apps/web, apps/automation", "Framework", "App Router framework for both apps: server components for data-heavy dashboards, route handlers as the entire backend API, streaming for AI chat. Chosen so UI and API ship as one deployable.", "src/app/** (pages + route handlers), next.config.ts"),
    dep("react / react-dom", "19.2.4", "apps/web, apps/automation, packages/ui", "Framework", "React 19 is required by Next 16; server components and the `use` hook are used throughout the dashboards.", "every .tsx file"),
    dep("typescript", "^5", "all workspaces", "Language", "End-to-end type safety — the Drizzle schema's inferred types flow from packages/db into route handlers and components with no codegen step.", "tsconfig.json per package"),
    dep("turbo", "^2.9.18", "root", "Build orchestration", "Task graph + caching across 7 workspace units. turbo.json declares which env vars invalidate the build cache, which matters because a changed API key must force a rebuild.", "turbo.json, root package.json scripts"),
    dep("pnpm", "10.33.4", "root (packageManager)", "Package manager", "Workspace protocol (workspace:*) links internal packages by symlink instead of publishing, and the content-addressed store keeps three Next apps' node_modules affordable.", "pnpm-workspace.yaml, pnpm-lock.yaml"),

    // --- Auth ---
    dep("better-auth", "^1.6.11", "apps/web, apps/automation, packages/db", "Auth", "Self-hosted auth owning email/password, Google OAuth, sessions, email OTP, and the admin plugin's role model. Chosen over a hosted IdP so user rows live in the same Postgres as patient data (no cross-system join for RBAC).", "src/lib/auth/auth.ts, /api/auth/[...all], schema.user/session/account/verification"),
    dep("better-auth/adapters/drizzle", "(bundled)", "apps/web", "Auth", "Binds Better Auth directly to the project's own Drizzle tables rather than a private schema, so `user.role` is queryable by application code.", "src/lib/auth/auth.ts"),
    dep("better-auth/plugins (admin, emailOTP)", "(bundled)", "apps/web", "Auth", "admin() supplies role assignment/ban/impersonate; every role string the app uses must be declared in its access-control map or Better Auth rejects it. emailOTP backs passwordless flows.", "src/lib/auth/auth.ts, src/lib/auth/config.ts"),
    dep("better-auth/next-js (nextCookies)", "(bundled)", "apps/web", "Auth", "Makes session cookies work correctly with Next server actions and route handlers.", "src/lib/auth/auth.ts"),

    // --- Data ---
    dep("drizzle-orm", "^0.45.2", "packages/db (→ both apps)", "Database", "SQL-first, fully typed ORM. Schema is TypeScript, so table types are shared with the frontend at zero cost, and generated SQL stays predictable for a 37-table clinical schema.", "packages/db/src/schema.ts, client.ts"),
    dep("drizzle-kit", "^0.31.10", "packages/db (dev)", "Database tooling", "Generates migrations, pushes schema, and serves Drizzle Studio. Deliberately points at DIRECT_URL, not the pooled URL — transaction-mode pooling breaks DDL.", "drizzle.config.ts, drizzle/ output"),
    dep("pg (node-postgres)", "^8.21.0", "packages/db", "Database driver", "Real connection pool. Pool size is 1 on Vercel and 10 elsewhere, because every warm serverless instance otherwise holds its own pool and exhausts Postgres.", "packages/db/src/client.ts"),
    dep("PostgreSQL", "18", "infrastructure", "Datastore", "Relational store for users, clinical records, biomarkers, appointments, automation runs, and communication logs. Chosen for JSONB (event payloads, flow graphs) plus strict relational integrity for clinical data.", "DATABASE_URL / DIRECT_URL"),

    // --- Validation / forms ---
    dep("zod", "^4.4.3", "apps/web, apps/automation, packages/ui, packages/db", "Validation", "One schema language for API request bodies, form validation, and MDX frontmatter — validated once at the boundary, inferred as types everywhere after.", "src/lib/auth/schemas.ts, route handlers, source.config.ts"),
    dep("react-hook-form", "^7.76.1", "apps/web", "Forms", "Uncontrolled-first form state; keeps long clinical intake and report forms from re-rendering on every keystroke.", "auth forms, dashboard forms"),
    dep("@hookform/resolvers", "^5.4.0", "apps/web", "Forms", "Bridges the Zod schemas into react-hook-form so client and server validate against the identical definition.", "form components"),

    // --- UI ---
    dep("tailwindcss", "^4", "packages/ui (→ both apps)", "Styling", "Tailwind v4 with a CSS-first theme defined once in packages/ui/src/styles/globals.css; both apps import that file so tokens and dark mode stay identical.", "packages/ui/src/styles/globals.css"),
    dep("@tailwindcss/postcss", "^4", "packages/ui, both apps", "Styling", "The v4 PostCSS pipeline; the shared postcss.config.mjs is re-exported from @workspace/ui.", "postcss.config.mjs"),
    dep("shadcn", "^4.14.0", "packages/ui", "UI generator", "CLI used to scaffold components into packages/ui/src/components — the components are owned source, not a runtime dependency.", "`pnpm dlx shadcn@latest add <x> -c apps/web`"),
    dep("radix-ui + @radix-ui/react-use-controllable-state", "^1.6.7", "packages/ui", "UI primitives", "Accessible unstyled primitives (dialog, popover, select, dropdown…) underpinning most shadcn components — keyboard and ARIA behavior that is expensive to hand-roll.", "packages/ui/src/components/*.tsx"),
    dep("@base-ui/react", "^1.6.0", "packages/ui", "UI primitives", "Second primitive set used where the newer Base UI API is a better fit than Radix; both coexist because shadcn components are migrating.", "packages/ui/src/components/*.tsx"),
    dep("class-variance-authority", "^0.7.1", "packages/ui", "Styling utility", "Declares component variants (size/tone/state) as typed maps instead of ad-hoc string concatenation.", "button.tsx, badge.tsx, alert.tsx …"),
    dep("clsx + tailwind-merge", "^2.1.1 / ^3.6.0", "packages/ui", "Styling utility", "The `cn()` helper — conditional classes plus conflict resolution so a caller-supplied class actually wins over a component default.", "packages/ui/src/lib/utils.ts"),
    dep("tw-animate-css", "^1.4.0", "packages/ui", "Styling", "Animation utilities for Tailwind v4, replacing tailwindcss-animate.", "globals.css"),
    dep("lucide-react", "^1.25.0", "both apps, packages/ui", "Icons", "Single icon set across every surface; tree-shaken per icon.", "everywhere"),
    dep("next-themes", "^0.4.6", "packages/ui, apps/web", "Theming", "Class-based dark/light switching without a flash on first paint.", "layout providers"),
    dep("sonner", "^2.0.7", "packages/ui", "Feedback", "Toast notifications for save/error states across dashboards.", "packages/ui/src/components/sonner.tsx"),
    dep("cmdk", "^1.1.1", "packages/ui", "UI", "Command palette / combobox filtering behavior.", "command.tsx, combobox.tsx"),
    dep("react-day-picker", "^10.0.1", "packages/ui", "UI", "Calendar widget behind appointment date selection.", "calendar.tsx"),
    dep("input-otp", "^1.4.2", "packages/ui", "UI", "OTP input matched to the Better Auth emailOTP flow.", "input-otp.tsx"),
    dep("recharts", "3.8.0", "packages/ui, apps/web", "Charts", "Biomarker trends, domain-age breakdowns, and dashboard analytics. Pinned (not ranged) because chart internals are relied on by the shared chart.tsx wrapper.", "packages/ui/src/components/chart.tsx"),
    dep("nanoid", "^6.0.1", "packages/ui", "Utility", "Short client-side ids for list keys and ephemeral UI records.", "packages/ui components"),
    dep("use-stick-to-bottom", "^1.1.6", "packages/ui", "UI behavior", "Keeps the AI chat transcript pinned to the newest token while streaming, without fighting user scroll.", "ai-elements/conversation.tsx"),
    dep("date-fns", "^4.4.0", "apps/web, packages/ui", "Dates", "Formatting/arithmetic for appointment slots, availability windows, and report timestamps.", "appointment + availability code"),

    // --- Motion / 3D ---
    dep("motion / framer-motion", "^13.0.0 / ^12.43.0", "apps/web, packages/ui", "Animation", "Declarative animation for marketing sections and dashboard transitions.", "components/home/*, packages/ui"),
    dep("gsap + @gsap/react", "^3.15.0 / ^2.1.2", "apps/web", "Animation", "Timeline-based scroll choreography on the landing page, where Motion's per-component model is awkward.", "components/home/*"),
    dep("three + @react-three/fiber + drei + postprocessing", "^0.185.1 / ^9.7.0 / ^10.7.8 / ^3.0.5", "apps/web", "3D", "The 3D anatomy/biology visuals on the marketing site (muscle, biology, age-clock sections).", "components/home/muscle.tsx, biology.tsx"),
    dep("@paper-design/shaders-react", "^0.0.78", "apps/web, packages/ui", "Visual FX", "GPU shader backgrounds used in hero and canvas UI without hand-writing GLSL.", "packages/ui/src/components/canvasui/*"),
    dep("@types/three", "^0.185.4", "apps/web (dev)", "Types", "Type definitions for three.js.", "—"),

    // --- AI ---
    dep("ai (Vercel AI SDK)", "^7.0.58", "apps/web, packages/ui", "AI", "Provider-agnostic `streamText` + UIMessage protocol. Lets the patient assistant switch model providers from a DB config row without touching the route handler.", "/api/patient/ai/chat/route.ts"),
    dep("@ai-sdk/openai", "^4.0.42", "apps/web", "AI provider", "OpenAI models for the patient health assistant.", "src/lib/ai/openai-client.ts"),
    dep("@ai-sdk/google", "^4.0.44", "apps/web", "AI provider", "Gemini as the alternate/fallback provider, selectable per the ai_assistant_config row.", "src/lib/ai/openai-client.ts"),
    dep("@ai-sdk/react", "^4.0.69", "apps/web", "AI client", "useChat-style hooks that consume the streamed response and render partial messages.", "dashboard/ai page"),
    dep("streamdown + @streamdown/{code,math,mermaid,cjk}", "^2.5.0", "packages/ui", "AI rendering", "Renders streaming markdown safely mid-stream (unterminated code fences, partial tables) — plain react-markdown flickers on token-by-token input.", "packages/ui/src/components/ai-elements/message.tsx"),

    // --- Integrations ---
    dep("cloudinary", "^2.10.0", "apps/web, apps/automation", "Media", "Signed uploads and CDN delivery for lab-report PDFs, profile images, and WhatsApp media — keeps large binaries out of Postgres and off the app server.", "src/lib/cloudinary.ts, /api/patient/upload, /api/media"),
    dep("resend", "^6.12.4", "apps/web, packages/communication", "Email", "Transactional email: verification, password reset, report and appointment notifications, and the email channel adapter.", "src/lib/resend.ts, packages/communication/src/adapters/email.ts"),
    dep("Cal.com API v2", "REST (no SDK)", "apps/web", "Scheduling", "Slot availability and booking. Called over plain fetch with a per-endpoint-family version header, because the official SDK lags the v2 API.", "src/lib/cal-com.ts, /api/patient/appointments/*"),
    dep("WhatsApp Cloud API (Meta Graph v21.0)", "REST (no SDK)", "packages/communication, apps/automation", "Messaging", "Template sends, session text, and interactive lists. Hand-rolled over fetch so the 10-row / 24-char list caps are enforced locally instead of failing as a Meta 400.", "packages/communication/src/adapters/whatsapp.ts, src/http-server.ts"),
    dep("Open Wearables API", "self-hosted, v1", "apps/web", "Wearables", "Unified wearable data + provider OAuth. Reached only through a server-side proxy route so the backend URL and any auth header never reach the browser.", "/api/patient/wearables/[...path]/route.ts"),
    dep("Google OAuth", "via better-auth", "apps/web", "Auth provider", "Social sign-in with account linking enabled, so a Google login merges into an existing email account.", "src/lib/auth/auth.ts"),

    // --- Documents ---
    dep("pdfjs-dist", "^6.1.200", "apps/web", "PDF", "Client-side text extraction from uploaded lab reports; the PDF never has to reach a server to be parsed.", "src/lib/pdf/pdf.ts"),
    dep("react-pdf", "^10.4.1", "apps/web", "PDF", "In-browser preview of an uploaded report before the patient confirms the parsed biomarker values.", "report upload UI"),
    dep("schema-dts", "^1.1.5", "apps/web", "SEO", "Typed JSON-LD structured data for the marketing and content pages.", "src/config/site.ts, layout metadata"),

    // --- Content ---
    dep("fumadocs-core / fumadocs-mdx / fumadocs-ui", "^15.8.2 / ^12.0.1 / ^15.7.12", "apps/web", "Content", "Three separate MDX collections — docs, blogs, and biomarker encyclopedia — each with its own Zod-validated frontmatter, plus search and navigation. Content ships with the app instead of needing a CMS.", "source.config.ts, src/content/**, (docs) routes"),
    dep("@types/mdx", "^2.0.13", "apps/web (dev)", "Types", "MDX module typing.", "—"),
    dep("@next/third-parties", "^15.5.18", "apps/web", "Analytics", "Standard loader for third-party scripts (analytics) without blocking hydration.", "root layout"),

    // --- Automation runtime ---
    dep("bullmq", "^5.68.0", "apps/automation", "Job queue", "Redis-backed queue with delayed jobs — the mechanism behind Delay nodes and 'wait up to 7 days for an event' resumes. Chosen over cron polling for accurate, restart-surviving timing.", "src/queue.ts, src/worker.ts, src/schedule-resume.ts"),
    dep("ioredis", "^5.9.0", "apps/automation", "Redis client", "The connection BullMQ requires (maxRetriesPerRequest must be null).", "src/redis.ts"),
    dep("@xyflow/react", "^12.10.6", "apps/automation", "Flow editor", "Node/edge canvas for the visual automation builder; the saved graph JSON is exactly what the worker executes.", "src/components/flow-canvas/*, automation_flow_version.graph"),
    dep("tsx", "^4.20.6", "apps/automation, packages/db (dev)", "Runtime", "Runs the worker, webhook server, and every seed/ops script straight from TypeScript with no build step.", "worker, http-server, seed*, scripts/*"),
    dep("dotenv", "^17.4.2", "apps/automation, packages/db", "Config", "Loads .env for the non-Next processes (worker, webhook, CLI scripts), which do not get Next's automatic env loading.", "src/redis.ts, packages/db/src/client.ts"),
    dep("Redis", "8", "infrastructure", "Datastore", "Queue backend for BullMQ. Note the automation app defaults to :6380 to avoid colliding with the Open Wearables Redis on :6379.", "REDIS_URL"),

    // --- Tooling ---
    dep("eslint 9 + typescript-eslint", "^9 / ^8.60.0", "packages/eslint-config", "Linting", "Flat-config lint baseline shared by every workspace.", "packages/eslint-config/*.js"),
    dep("eslint-plugin-react / react-hooks / only-warn / turbo", "various", "packages/eslint-config", "Linting", "React correctness rules, hook rules, warn-only severity in CI-friendly runs, and Turborepo's undeclared-env-var rule (which is what keeps turbo.json's env list honest).", "packages/eslint-config/*.js"),
    dep("prettier + prettier-plugin-tailwindcss", "^3.8.3 / ^0.8.0", "root", "Formatting", "Formatting plus deterministic Tailwind class ordering, so class-list diffs stay reviewable.", ".prettierrc"),
    dep("@turbo/gen", "^2.9.15", "packages/ui (dev)", "Codegen", "Turborepo generators for scaffolding new shared components.", "packages/ui"),
  ],
};

export const owDependencies = {
  name: "04 Open Wearables Deps",
  title: "Open Wearables — Dependencies and Why",
  note: "Sibling repo at f:/Predict/open-wearables (v0.6.3, MIT, by Momentum). PredictFit consumes it as a self-hosted service, not as a library.",
  columns: [
    { header: "Package / Tech", width: 32 },
    { header: "Version", width: 14 },
    { header: "Part", width: 20 },
    { header: "Category", width: 22 },
    { header: "Why it is used", width: 96 },
  ],
  rows: [
    ["fastapi + fastapi-cli", ">=0.139.2", "backend", "Framework", "Async REST API with OpenAPI/Swagger generated from type hints — the /api/v1 surface PredictFit proxies to."],
    ["sqlalchemy", ">=2.0.51", "backend", "ORM", "Models the wearable domain (users, connections, data-point series, sleep/workout details, health scores) in its own database."],
    ["alembic", ">=1.18.5", "backend", "Migrations", "Versioned schema migrations for the Open Wearables database, entirely separate from PredictFit's Drizzle migrations."],
    ["psycopg (+ psycopg-binary)", ">=3.3.4", "backend", "DB driver", "Postgres 3.x driver used by SQLAlchemy."],
    ["celery + flower", ">=5.6.3 / >=2.0.1", "backend", "Task queue", "All heavy work runs off-request: periodic provider sync, XML/SDK/S3 upload processing, webhook emission, score backfills. Flower gives a worker dashboard on :5555."],
    ["redis", ">=8.0.1", "backend", "Broker / cache", "Celery broker and result backend, plus a TTL cache for in-progress sleep aggregation."],
    ["pydantic-settings", ">=2.14.2", "backend", "Config", "Every provider credential, sync interval, and feature flag is a typed setting validated at startup rather than a raw os.environ read."],
    ["httpx[http2]", ">=0.28.1", "backend", "HTTP client", "Async calls out to Garmin, Oura, Whoop, Polar, Suunto, Strava, Fitbit, Ultrahuman APIs."],
    ["cryptography + python-jose + bcrypt", ">=49 / >=3.5 / >=5.0", "backend", "Security", "Fernet encryption of stored provider tokens, JWT issuance for portal/SDK auth, and password hashing — no external auth service is required."],
    ["svix", ">=1.99.1", "backend", "Webhooks", "Outgoing webhook delivery with retries, signing, and per-endpoint history; runs as its own container against its own svix database."],
    ["boto3", ">=1.43.55", "backend", "Storage", "S3 for raw provider payload archival and large SDK/XML upload ingestion."],
    ["numpy", ">=2.5.1", "backend", "Math", "Vectorized computation for health scores (sleep, recovery, resilience) and time-series aggregation."],
    ["fitdecode", ">=0.11.0", "backend", "Parsing", "Decodes Garmin/Suunto .FIT binary workout files into normalized samples."],
    ["isodate", ">=0.7.2", "backend", "Parsing", "ISO-8601 duration parsing from provider payloads."],
    ["resend", ">=2.34.0", "backend", "Email", "Invitation and notification email — the same vendor PredictFit uses, by coincidence not by coupling."],
    ["sentry-sdk[fastapi]", ">=2.66.1", "backend", "Observability", "Error tracking for API and Celery workers."],
    ["google-auth", ">=2.56.2", "backend", "Auth", "Google Health Connect / service-account flows for the Android SDK path."],
    ["faker", ">=40.35.0", "backend", "Seeding", "Generates the sample users and activity data behind `make seed`."],
    ["ruff + ty + pre-commit", "code-quality group", "backend, mcp", "Tooling", "Lint/format (120-col, py313 target) and type checking, enforced on commit."],
    ["pytest + pytest-asyncio + testcontainers", "dev group", "backend", "Testing", "Async test suite that spins real Postgres/Redis containers instead of mocking the datastore."],
    ["react + @tanstack/react-router", "^19.2.8 / ^1.170", "frontend", "Framework", "Type-safe file-based routing for the developer portal (a Vite SPA/SSR app, not Next.js)."],
    ["@tanstack/react-query + react-start + react-table", "^5.101 / ^1.168 / ^8.21", "frontend", "Data / UI", "Server-state caching, SSR wiring, and the data grids for users and data sources."],
    ["vite + vitest + oxlint", "^8.1.5 / ^4.1.10 / ^1.75", "frontend", "Tooling", "Build, test, and a Rust-based linter — a separate toolchain from PredictFit's Next/ESLint setup."],
    ["tailwindcss + radix-ui + recharts + sonner", "^4.3.3 / various", "frontend", "UI", "Same style of stack as PredictFit's UI package, but a completely independent copy — the two design systems are not shared."],
    ["fastmcp + httpx + pydantic", ">=2.0.0", "mcp", "AI tooling", "Wraps the Open Wearables REST API as MCP tools (users, activity, sleep, workouts, timeseries) so an AI assistant can query wearable data directly."],
    ["Docker Compose", "—", "infrastructure", "Runtime", "Brings up db, app, celery-worker, celery-beat, flower, redis, svix-server, frontend as one stack — this is how PredictFit runs it locally on :8000."],
  ],
};

// ---------------------------------------------------------------------------
// 5. Integrations
// ---------------------------------------------------------------------------

export const integrations = {
  name: "05 Integrations",
  title: "External Services — Connection Points",
  note: "Every outbound dependency, where it is configured, and what breaks if it is unavailable.",
  columns: [
    { header: "Service", width: 24 },
    { header: "Used by", width: 24 },
    { header: "Protocol", width: 22 },
    { header: "Entry point in code", width: 56 },
    { header: "What it does", width: 74 },
    { header: "Failure mode", width: 60 },
  ],
  rows: [
    ["PostgreSQL (PredictFit)", "web, automation, worker", "TCP / node-postgres pool", "packages/db/src/client.ts", "All application state. DATABASE_URL is the pooled endpoint; DIRECT_URL is the non-pooled one used only for DDL.", "Hard down — nothing works."],
    ["Redis", "automation worker + webhook", "TCP / ioredis", "apps/automation/src/redis.ts", "BullMQ queue and delayed job storage for flow runs.", "Flows stop advancing; web app keeps working."],
    ["Google OAuth", "web", "OAuth 2.0", "src/lib/auth/auth.ts (socialProviders)", "Social sign-in with account linking.", "Google sign-in fails; email/password still works."],
    ["Resend", "web, packages/communication", "HTTPS REST", "src/lib/resend.ts, adapters/email.ts", "Verification, password reset, and notification email.", "Emails silently queue as failed rows; app usable."],
    ["Cloudinary", "web, automation", "HTTPS REST (signed)", "src/lib/cloudinary.ts, apps/automation/src/lib/cloudinary.ts", "Report PDFs, profile images, WhatsApp media assets.", "Uploads fail; existing CDN URLs keep serving."],
    ["OpenAI", "web", "HTTPS (AI SDK)", "src/lib/ai/openai-client.ts → getOpenAI()", "Primary model for the patient health assistant.", "Chat route throws unless the config row selects Gemini."],
    ["Google Gemini", "web", "HTTPS (AI SDK)", "src/lib/ai/openai-client.ts → getGemini()", "Alternate model provider, chosen per ai_assistant_config.", "Falls back to OpenAI if configured."],
    ["Cal.com v2", "web", "HTTPS REST", "src/lib/cal-com.ts", "Event type, slot lookup, booking create/cancel for clinic appointments.", "Booking + slots endpoints 5xx; existing appointments still render."],
    ["WhatsApp Cloud API", "communication, automation", "HTTPS Graph v21.0 + inbound webhook", "adapters/whatsapp.ts (out), src/http-server.ts (in)", "Template and session messaging, interactive lists, delivery statuses, inbound replies.", "Sends recorded as failed; inbound replies lost while down."],
    ["Open Wearables API", "web", "HTTPS REST /api/v1", "apps/web/src/app/api/patient/wearables/[...path]/route.ts", "Provider list, OAuth authorize URL, and (via the same catch-all) any v1 GET the dashboard needs.", "Wearables page shows 'no providers'; rest of app unaffected."],
    ["Wearable providers (Garmin, Oura, Whoop, Polar, Suunto, Strava, Fitbit, Ultrahuman)", "open-wearables backend", "OAuth 2.0 + provider REST/webhooks", "backend/app/services/providers/*", "Per-provider OAuth, sync, and webhook handling — PredictFit never talks to these directly.", "That provider's data stops syncing; others unaffected."],
    ["Apple HealthKit / Samsung Health / Google Health Connect", "open-wearables backend", "Mobile SDK push → /sdk_sync", "backend/app/api/routes/v1/sdk_sync.py", "Push-based sync from on-device health stores via the iOS/Android/Flutter/RN SDKs.", "Device data stops arriving."],
    ["Svix", "open-wearables backend", "HTTP + Redis queue", "backend/app/services/outgoing_webhooks/svix.py", "Signed, retried outgoing webhooks to subscriber backends.", "Webhook fan-out stalls; data still ingests."],
    ["AWS S3", "open-wearables backend", "boto3", "backend/app/services/raw_payload_storage.py", "Raw provider payload archival and large upload ingestion.", "Falls back to configured local/none storage."],
    ["Sentry", "open-wearables backend", "HTTPS", "backend/app/integrations/sentry.py", "Error reporting for API and Celery workers.", "Errors go unreported only."],
  ],
};

// ---------------------------------------------------------------------------
// 6. Environment variables
// ---------------------------------------------------------------------------

export const envVars = {
  name: "06 Env Variables",
  title: "Environment Variables",
  note: "turbo.json declares which of these invalidate the build cache. Anything NEXT_PUBLIC_* is shipped to the browser — never put a secret behind that prefix.",
  columns: [
    { header: "Variable", width: 40 },
    { header: "Scope", width: 26 },
    { header: "Required", width: 12 },
    { header: "Secret", width: 10 },
    { header: "Purpose", width: 84 },
  ],
  rows: [
    ["NEXT_PUBLIC_APP_URL", "apps/web", "Yes", "No", "Public base URL used in emails, OAuth redirects, and canonical metadata."],
    ["BETTER_AUTH_SECRET", "apps/web, apps/automation", "Yes", "Yes", "Signs and encrypts sessions. Both apps must share the same value to share a session."],
    ["BETTER_AUTH_URL", "apps/web, apps/automation", "Yes", "No", "Base URL Better Auth builds callback and verification links from."],
    ["GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET", "apps/web", "Optional", "Yes", "Google OAuth credentials; omit to disable social sign-in."],
    ["GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET", "apps/web (.env only)", "Optional", "Yes", "Present in the local env but not wired into auth.ts — reserved for a future provider."],
    ["DATABASE_URL", "all", "Yes", "Yes", "Pooled Postgres endpoint used by the runtime connection pool."],
    ["DIRECT_URL", "packages/db, apps/web", "Yes for DDL", "Yes", "Non-pooled Postgres endpoint. drizzle-kit uses this because transaction-mode pooling breaks migrations."],
    ["DB_POOL_MAX", "packages/db (optional)", "No", "No", "Overrides pool size. Defaults to 1 on Vercel, 10 elsewhere."],
    ["REDIS_URL", "apps/automation", "Yes (worker)", "Yes", "BullMQ connection. Defaults to redis://localhost:6380 to avoid the Open Wearables Redis on 6379."],
    ["PORT", "apps/automation webhook", "No", "No", "Webhook HTTP server port; defaults to 3100."],
    ["OPENAI_API_KEY", "apps/web", "Yes (AI)", "Yes", "Authenticates the OpenAI provider for the health assistant."],
    ["GEMINI_API_KEY", "apps/web", "Optional", "Yes", "Authenticates the Gemini provider when selected."],
    ["RESEND_API_KEY", "apps/web, apps/automation", "Yes", "Yes", "Transactional email delivery."],
    ["CLOUDINARY_CLOUD_NAME / API_KEY / API_SECRET / URL", "apps/web, apps/automation", "Yes (uploads)", "Yes", "Signed upload + delivery credentials for reports, images, and media."],
    ["CAL_API_KEY", "apps/web", "Yes (booking)", "Yes", "Cal.com v2 API authentication."],
    ["CAL_EVENT_TYPE_ID", "apps/web", "Yes (booking)", "No", "The clinic event type slots and bookings are created against. Created by `pnpm --filter @workspace/db create:cal-event-type`."],
    ["CAL_CLINIC_ADDRESS / CAL_CLINIC_TIMEZONE", "apps/web", "Yes (booking)", "No", "Physical location and timezone stamped onto bookings."],
    ["OPEN_WEARABLES_API_URL", "apps/web (server)", "Yes (wearables)", "No", "Server-side base URL for the Open Wearables backend; the proxy route falls back to http://127.0.0.1:8000."],
    ["NEXT_PUBLIC_OPEN_WEARABLES_API_URL", "apps/web (client)", "Optional", "No", "Browser-visible Open Wearables URL. Prefer the proxy route over calling this directly."],
    ["WHATSAPP_PHONE_NUMBER_ID", "packages/communication, automation", "Yes (WhatsApp)", "No", "Meta phone number id every send is posted to."],
    ["WHATSAPP_ACCESS_TOKEN", "packages/communication, automation", "Yes (WhatsApp)", "Yes", "Graph API bearer token. Deliberately env-only — provider secrets are kept out of the database schema."],
    ["WHATSAPP_WABA_ID", "apps/automation", "Yes (templates)", "No", "WhatsApp Business Account id used for template submit/sync."],
    ["WHATSAPP_APP_ID / WHATSAPP_APP_SECRET", "apps/automation", "Yes (webhook)", "Yes", "App secret verifies the inbound webhook HMAC signature."],
    ["WHATSAPP_WEBHOOK_VERIFY_TOKEN", "apps/automation", "Yes (webhook)", "Yes", "Answers Meta's webhook subscription verification challenge."],
    ["OW: DB_* / REDIS_* / SECRET_KEY / FERNET_DECRYPTOR", "open-wearables backend", "Yes", "Yes", "Datastore connections, JWT signing, and the Fernet key encrypting stored provider tokens."],
    ["OW: <PROVIDER>_CLIENT_ID / _CLIENT_SECRET / _REDIRECT_URI / _DEFAULT_SCOPE", "open-wearables backend", "Per provider", "Yes", "One set each for Garmin, Oura, Whoop, Polar, Suunto, Strava, Fitbit, Ultrahuman, Google, Sensorbio."],
    ["OW: SVIX_SERVER_URL / SVIX_AUTH_TOKEN / SVIX_JWT_SECRET", "open-wearables backend", "Yes (webhooks)", "Yes", "Outgoing webhook service connection."],
    ["OW: ADMIN_EMAIL / ADMIN_PASSWORD", "open-wearables backend", "Yes", "Yes", "Portal admin account auto-created on first startup."],
  ],
};

// ---------------------------------------------------------------------------
// 7. Database
// ---------------------------------------------------------------------------

const t = (table, group, purpose, links) => [table, group, purpose, links];

export const dbTables = {
  name: "07 Database Schema",
  title: "PredictFit Database — packages/db/src/schema.ts",
  note: "37 tables in one Postgres database, all defined in a single Drizzle schema file so both apps and the worker share identical types.",
  columns: [
    { header: "Table", width: 34 },
    { header: "Domain", width: 24 },
    { header: "Purpose", width: 88 },
    { header: "Key relations", width: 54 },
  ],
  rows: [
    t("user", "Auth", "Better Auth principal plus the app's role column (user/patient, doctor, health_coach, nutritionist, admin, superadmin).", "→ session, account, patient_record"),
    t("session", "Auth", "Active sessions with impersonation support from the admin plugin.", "user"),
    t("account", "Auth", "Credential and OAuth provider links; account linking is enabled.", "user"),
    t("verification", "Auth", "Email verification and password-reset tokens, and email OTP codes.", "—"),
    t("patient_record", "Clinical", "The clinical profile behind a patient user: demographics, intake answers, assigned care team.", "user, patient_address, report"),
    t("patient_address", "Clinical", "Postal address kept separate from the record so a patient can have more than one.", "patient_record"),
    t("report", "Clinical", "Uploaded or clinician-authored reports, including the Cloudinary asset reference.", "patient_record, biomarker_reading"),
    t("biomarker_index", "Biomarker config", "Top-level index/category a set of domains rolls up into (superadmin-configured).", "→ index_domain_map"),
    t("biomarker_domain", "Biomarker config", "An organ/system domain (e.g. metabolic, cardiac) that biomarkers group under.", "index_domain_map, domain_biomarker_map"),
    t("biomarker", "Biomarker config", "A single measurable marker with its unit and reference range.", "domain_biomarker_map, biomarker_reading"),
    t("index_domain_map", "Biomarker config", "Many-to-many index ↔ domain mapping, editable from the superadmin console.", "biomarker_index, biomarker_domain"),
    t("domain_biomarker_map", "Biomarker config", "Many-to-many domain ↔ biomarker mapping — this is what makes the age model reconfigurable without a deploy.", "biomarker_domain, biomarker"),
    t("biomarker_reading", "Biomarker data", "One measured value for one patient at one time, whether typed in or parsed from a PDF.", "patient_record, biomarker, report"),
    t("biological_age_result", "Biological age", "A completed calculation run: composite score, delta age, resulting biological age.", "patient_record, domain_age_result"),
    t("domain_age_result", "Biological age", "Per-domain breakdown of a run: mean |Z|, biomarker count, weight W_d, alpha α_d, contribution.", "biological_age_result, biomarker_domain"),
    t("ai_conversation", "AI", "One chat thread between a patient and the assistant.", "user, ai_message"),
    t("ai_message", "AI", "Individual user/assistant turns, persisted so a thread survives reload and feeds context on the next request.", "ai_conversation"),
    t("ai_assistant_config", "AI", "Superadmin-controlled model provider, model name, system-prompt overrides, and daily message limits.", "—"),
    t("contact", "CRM", "The unified person record for automation: leads and patients alike, keyed by normalized phone, with lifecycle stage and engagement.", "→ almost every automation table"),
    t("appointment", "Scheduling", "A booking, including the Cal.com booking reference and assigned staff member.", "user/contact, appointment_note, doctor_availability"),
    t("doctor_availability", "Scheduling", "Staff availability windows used to compute offerable slots.", "user (staff)"),
    t("appointment_note", "Scheduling", "Clinician notes attached to a visit.", "appointment"),
    t("task", "Ops", "Work item assigned to a staff member, creatable by a flow's Create Task node.", "contact, user"),
    t("adherence_log", "Ops", "Records whether a patient followed a protocol/medication step.", "contact"),
    t("lifecycle_event", "Events", "The domain-event log. Every meaningful action inserts a row here; the worker polls it to trigger flows. Unique idempotency key makes repeat emits safe no-ops.", "contact, automation_trigger_execution"),
    t("automation_flow", "Automation", "A named automation with its active-version pointer and trigger subscription.", "automation_flow_version, automation_flow_run"),
    t("automation_flow_version", "Automation", "An immutable snapshot of the XYFlow node/edge graph. Editing publishes a new version rather than mutating a running one.", "automation_flow"),
    t("automation_flow_run", "Automation", "One execution instance: current node, context object, status, wait state.", "automation_flow, contact, automation_node_execution"),
    t("automation_node_execution", "Automation", "Per-node execution record — inputs, output, error — which is what makes a run debuggable after the fact.", "automation_flow_run"),
    t("automation_trigger_execution", "Automation", "Claims a (lifecycle_event, flow) pair exactly once, so a polled event cannot start the same flow twice.", "lifecycle_event, automation_flow"),
    t("media_asset", "Media", "Cloudinary asset metadata referenced by templates and messages.", "communication_template, communication_message"),
    t("communication_template", "Messaging", "Channel template definition, including the Meta-approved provider template name and variable ordering.", "media_asset, communication_message"),
    t("communication_conversation", "Messaging", "A messaging thread with one contact on one channel, plus the 24-hour WhatsApp session window state.", "contact, communication_message"),
    t("communication_message", "Messaging", "Every inbound and outbound message with provider message id, status, and failure reason.", "communication_conversation, communication_template"),
    t("contact_communication_preference", "Messaging", "Per-contact channel opt-in/opt-out and quiet hours.", "contact"),
    t("audience", "Marketing", "A saved segment definition for bulk sends.", "audience_member"),
    t("audience_member", "Marketing", "Contact ↔ audience membership.", "audience, contact"),
  ],
};

// ---------------------------------------------------------------------------
// 8. API surface
// ---------------------------------------------------------------------------

const api = (method, path, app, auth, purpose) => [method, path, app, auth, purpose];

export const apiRoutes = {
  name: "08 API Surface",
  title: "HTTP Endpoints",
  note: "Next route handlers are the entire PredictFit backend — there is no separate API server. Paths are grouped by the role that may call them.",
  columns: [
    { header: "Method", width: 12 },
    { header: "Path", width: 62 },
    { header: "App", width: 16 },
    { header: "Access", width: 22 },
    { header: "Purpose", width: 84 },
  ],
  rows: [
    api("ALL", "/api/auth/[...all]", "web", "public", "Better Auth catch-all: sign-in/up, OAuth callback, session, OTP, admin actions."),
    api("POST", "/api/public/leads", "web", "public", "Landing-page lead capture; emits LEAD_CAPTURED, which is what starts the lead-nurture flow."),
    api("POST", "/api/public/waitlist", "web", "public", "Waitlist signup from the marketing site."),
    api("POST/GET", "/api/patient/ai/chat", "web", "patient", "Streams the health assistant response; enforces the daily message limit and persists both turns."),
    api("GET", "/api/patient/ai/conversations", "web", "patient", "Lists and loads the patient's chat threads."),
    api("GET/POST", "/api/patient/appointments", "web", "patient", "Lists the patient's bookings and creates a new one via Cal.com."),
    api("GET", "/api/patient/appointments/slots", "web", "patient", "Available slots for the configured Cal.com event type."),
    api("GET/PATCH/DELETE", "/api/patient/appointments/[id]", "web", "patient", "Reads, reschedules, or cancels a single booking."),
    api("POST", "/api/patient/biological-age/calculate", "web", "patient", "Runs the biological-age model over the patient's readings and persists the result plus per-domain breakdown."),
    api("GET", "/api/patient/biological-age/results", "web", "patient", "Returns past calculation runs for the biological-age dashboard."),
    api("GET/POST", "/api/patient/biomarker-readings", "web", "patient", "Reads and records biomarker values."),
    api("POST", "/api/patient/biomarker-readings/from-parsed-report", "web", "patient", "Commits the values extracted from an uploaded PDF after the patient confirms them."),
    api("GET/PATCH", "/api/patient/profile", "web", "patient", "Patient profile read/update."),
    api("GET/PATCH", "/api/patient/profile/settings", "web", "patient", "Notification and account settings."),
    api("GET/POST", "/api/patient/reports", "web", "patient", "Lists reports and registers a newly uploaded one."),
    api("GET/DELETE", "/api/patient/reports/[id]", "web", "patient", "Single report read/delete."),
    api("POST", "/api/patient/upload", "web", "patient", "Signed Cloudinary upload for report PDFs and images."),
    api("GET", "/api/patient/wearables/[...path]", "web", "patient", "Server-side proxy to Open Wearables /api/v1/* — forwards query params and any Authorization header, returns no-store."),
    api("GET/POST", "/api/staff/appointments", "web", "staff", "Care-team appointment list and creation."),
    api("GET/PATCH", "/api/staff/appointments/[id]", "web", "staff", "Single appointment management."),
    api("GET/POST", "/api/staff/appointments/[id]/notes", "web", "staff", "Clinical notes on a visit."),
    api("GET", "/api/staff/appointments/patients", "web", "staff", "Patients bookable by the signed-in staff member."),
    api("GET", "/api/staff/doctors/[id]/appointments", "web", "staff", "A specific doctor's schedule."),
    api("GET", "/api/staff", "web", "staff", "Care-team directory."),
    api("GET/POST", "/api/admin/users", "web", "admin", "User directory and account creation."),
    api("GET/POST", "/api/admin/intake", "web", "admin", "Intake queue management."),
    api("POST", "/api/admin/communication/send", "web", "admin", "Manual outbound message; emits MANUAL_MESSAGE_SENT."),
    api("GET", "/api/admin/communication/templates", "web", "admin", "Templates available for a manual send."),
    api("GET/POST/PATCH", "/api/superadmin/users, /users/[id], /users/[id]/status", "web", "superadmin", "Full user administration including role changes and enable/disable."),
    api("CRUD", "/api/superadmin/biomarker-config/{domains,categories,biomarkers}[/id]", "web", "superadmin", "Manages the biomarker taxonomy that the biological-age model reads."),
    api("POST/DELETE", "/api/superadmin/biomarker-config/mappings/{category-domain,domain-biomarker}", "web", "superadmin", "Edits the many-to-many mappings between index, domain, and biomarker."),
    api("GET/PATCH", "/api/superadmin/ai-config", "web", "superadmin", "Chooses the AI provider/model, system prompt, and daily limits at runtime."),
    api("REST", "/api/{contacts,leads,audiences,conversations,templates,tasks,flows}", "automation", "staff", "CRM and flow-builder CRUD backing the automation console."),
    api("REST", "/api/{availability,appointments,staff,overview,media,ability-logs}", "automation", "staff", "Availability windows, booking helpers, dashboard metrics, and Cloudinary media."),
    api("GET/POST", "http://localhost:3100/ (webhook server)", "automation", "Meta HMAC", "WhatsApp Cloud API webhook: GET answers the verify challenge, POST ingests messages and statuses and resumes waiting runs."),
    api("GET", "OW /api/v1/oauth/providers", "open-wearables", "API key", "Provider list the PredictFit wearables page renders (filtered enabled_only + cloud_only)."),
    api("GET", "OW /api/v1/oauth/{provider}/authorize", "open-wearables", "API key", "Returns the provider authorization_url the browser is redirected to."),
    api("GET", "OW /api/v1/oauth/{provider}/callback", "open-wearables", "provider", "Completes the OAuth exchange and stores the encrypted connection."),
    api("GET", "OW /api/v1/users/{id}/timeseries", "open-wearables", "API key", "Raw normalized time-series for a wearable user."),
    api("GET", "OW /api/v1/users/{id}/summaries/{activity,sleep,recovery,body,data}", "open-wearables", "API key", "Daily aggregates — the shape a health dashboard actually consumes."),
    api("GET/POST", "OW /api/v1/{users,connections,data_sources,api_keys,health_scores,webhooks,sync_data}", "open-wearables", "API key", "User and connection management, credentials, computed scores, webhook subscriptions, manual sync triggers."),
    api("POST", "OW /api/v1/{sdk_sync,sdk_token,sdk_logs,import_xml}", "open-wearables", "SDK token", "Push ingestion from the mobile SDKs and Apple Health XML import."),
  ],
};

// ---------------------------------------------------------------------------
// 9. Automation engine
// ---------------------------------------------------------------------------

export const automationNodes = {
  name: "09 Automation Engine",
  title: "Flow Engine — Node Types and Processes",
  note: "A flow is an XYFlow graph saved as automation_flow_version.graph. The worker walks that graph node by node, writing an automation_node_execution row per step.",
  columns: [
    { header: "Item", width: 28 },
    { header: "Kind", width: 18 },
    { header: "File", width: 40 },
    { header: "What it does", width: 92 },
  ],
  rows: [
    ["worker", "process", "apps/automation/src/worker.ts", "BullMQ worker. Polls lifecycle_event every 5s for events matching active flows, enqueues start jobs, and reconciles stuck runs every 60s."],
    ["webhook server", "process", "apps/automation/src/http-server.ts", "Verifies Meta's HMAC signature, records inbound messages and delivery statuses, and enqueues a reply job for any run parked on Wait for Reply."],
    ["engine", "library", "apps/automation/src/engine.ts", "startRun / advanceRun / resumeWithReply plus the queries that find flows for an event and runs waiting on one."],
    ["queue", "library", "apps/automation/src/queue.ts", "The 'automation-flow' BullMQ queue and the three job shapes: start, resume, reply."],
    ["schedule-resume", "library", "apps/automation/src/schedule-resume.ts", "After every step, converts a run's wait state into a delayed BullMQ job so a Delay or timeout fires on time."],
    ["trigger", "node", "src/nodes/trigger.ts", "Entry point — declares which domain event type starts the flow."],
    ["load-contact", "node", "src/nodes/load-contact.ts", "Loads the contact row into run context so later nodes can read its fields."],
    ["condition", "node", "src/nodes/condition.ts", "Branches on a context expression."],
    ["variable", "node", "src/nodes/variable.ts", "Computes and stores a value into the run context."],
    ["delay", "node", "src/nodes/delay.ts", "Parks the run for a duration; resumption is a delayed BullMQ job, not a polling loop."],
    ["loop", "node", "src/nodes/loop.ts", "Iterates over a collection in context."],
    ["send-communication", "node", "src/nodes/send-communication.ts", "Sends a template through @workspace/communication on the contact's preferred channel."],
    ["send-text", "node", "src/nodes/send-text.ts", "Sends a free-form session message (valid only inside the WhatsApp 24-hour window)."],
    ["send-available-dates", "node", "src/nodes/send-available-dates.ts", "Renders bookable dates as a WhatsApp interactive list."],
    ["send-available-time-slots", "node", "src/nodes/send-available-time-slots.ts", "Renders time slots for a chosen date, capped at WhatsApp's 10-row limit."],
    ["book-appointment", "node", "src/nodes/book-appointment.ts", "Creates the appointment from the contact's list selection."],
    ["wait-for-reply", "node", "src/nodes/wait-for-reply.ts", "Suspends the run until the contact replies; the webhook server is what wakes it."],
    ["wait-for-event", "node", "src/nodes/wait-for-event.ts", "Suspends until a specific domain event arrives for this contact, with a timeout branch."],
    ["emit-event", "node", "src/nodes/emit-event.ts", "Writes a new lifecycle_event — how one flow chains into another."],
    ["create-task", "node", "src/nodes/create-task.ts", "Creates a staff task row."],
    ["database-update", "node", "src/nodes/database-update.ts", "Writes back to contact/patient fields (e.g. stage transitions)."],
    ["score", "node", "src/nodes/score.ts", "Adjusts a lead/engagement score on the contact."],
    ["api-call", "node", "src/nodes/api-call.ts", "Calls an arbitrary external HTTP endpoint from inside a flow."],
    ["webhook", "node", "src/nodes/webhook.ts", "Posts run context to a configured webhook URL."],
    ["ai", "node", "src/nodes/ai.ts", "Placeholder registry entry — no model is wired up yet, so graphs can reference it today without a schema change later."],
  ],
};

// ---------------------------------------------------------------------------
// 10. Data flows
// ---------------------------------------------------------------------------

export const dataFlows = {
  name: "10 Data Flows",
  title: "End-to-End Flows",
  note: "Read each row left to right; '→' is a synchronous call unless the step says otherwise.",
  columns: [
    { header: "Flow", width: 32 },
    { header: "Trigger", width: 26 },
    { header: "Path", width: 116 },
    { header: "Ends at", width: 40 },
  ],
  rows: [
    ["Sign-up / sign-in", "User submits form or Google OAuth", "Browser → /api/auth/[...all] → Better Auth → drizzleAdapter → user/session/account rows → role resolved via src/lib/auth/config.ts → redirected to the role's dashboard", "Role dashboard"],
    ["Lead capture → nurture", "Marketing form submit", "POST /api/public/leads → contact upsert (normalized phone) + emitDomainEvent(LEAD_CAPTURED) → lifecycle_event row → worker poll (5s) → automation_trigger_execution claim → flow run → WhatsApp template via @workspace/communication", "WhatsApp message + communication_message row"],
    ["Lab report → biomarkers", "Patient uploads a PDF", "pdfjs-dist extracts text in the browser → src/lib/pdf/parser.ts matches aliases and units → patient confirms → POST /api/patient/biomarker-readings/from-parsed-report → biomarker_reading rows + report row (Cloudinary asset)", "Biomarker dashboard"],
    ["Biological age", "Patient requests calculation", "POST /api/patient/biological-age/calculate → reads readings + domain_biomarker_map → src/lib/biological-age/calculate.ts computes |Z| per marker, Mean|Z| per domain, W_d and α_d relative to the domains present → biological_age_result + domain_age_result", "Biological-age / bio-clock UI"],
    ["AI health chat", "Patient sends a message", "POST /api/patient/ai/chat → session check → daily limit count → buildPatientContext() pulls the patient's clinical data → buildSystemPrompt() → ai SDK streamText with OpenAI or Gemini per ai_assistant_config → streamed to @ai-sdk/react → both turns saved as ai_message", "Streamed chat UI"],
    ["Appointment booking", "Patient picks a slot", "GET /api/patient/appointments/slots → Cal.com v2 (version header per endpoint family) → POST /api/patient/appointments → Cal.com booking → appointment row → APPOINTMENT_CREATED event", "Confirmation + any flow waiting on that event"],
    ["Wearable connect", "Patient clicks Connect", "Dashboard → GET /api/patient/wearables/oauth/providers → proxy → OW /api/v1/oauth/providers → provider cards → Connect → proxy → OW /api/v1/oauth/{provider}/authorize → browser redirected to the provider → provider callback hits OW directly → encrypted user_connection stored", "Connected data source in Open Wearables"],
    ["Wearable data sync", "Celery beat schedule or provider webhook", "OW celery-beat → periodic_sync_task → provider strategy (httpx) → normalized data_point_series + summaries + health_score rows → optional Svix webhook out → PredictFit reads back through the proxy", "Wearables view in the patient dashboard"],
    ["Inbound WhatsApp reply", "Contact replies on WhatsApp", "Meta → POST :3100 → HMAC verify (node:crypto timingSafeEqual) → communication_message inbound row → findWaitingRunForContact → BullMQ reply job → engine.resumeWithReply → next node executes", "Flow continues (e.g. slot chosen → booked)"],
    ["Manual staff message", "Admin sends from the console", "POST /api/admin/communication/send → @workspace/communication resolves the template body and adapter → WhatsApp Graph or Resend → communication_message row → MANUAL_MESSAGE_SENT event", "Conversation thread"],
    ["Docs / blog / biomarker content", "Build time", "src/content/{docs,blogs,biomarkers}/*.mdx → fumadocs-mdx compiles with the Zod frontmatter schema from source.config.ts → page tree → (docs) route group", "Static content pages"],
  ],
};

// ---------------------------------------------------------------------------
// 11. Roles
// ---------------------------------------------------------------------------

export const roles = {
  name: "11 Roles & Access",
  title: "Role Model",
  note: "Roles live on user.role and must also be declared in the Better Auth admin plugin's access map, or the value is rejected as non-existent. resolveRole() normalizes casing and known typo aliases before any check.",
  columns: [
    { header: "Role", width: 20 },
    { header: "Landing route", width: 22 },
    { header: "Staff?", width: 10 },
    { header: "Can do", width: 92 },
    { header: "Enforced by", width: 44 },
  ],
  rows: [
    ["superadmin", "/superadmin", "Yes", "Everything admin can, plus the biomarker taxonomy, AI assistant configuration, and user status/role changes.", "requireRole / requireAdmin, isAdminRole()"],
    ["admin", "/admin", "Yes", "User, patient, doctor, coach and nutritionist directories; intake queue; manual communications; appointments and reports.", "requireAdmin, canViewUserDirectory()"],
    ["doctor", "/doctor", "Yes", "Assigned patients, clinical data, appointments and visit notes, team views, report authoring.", "canManageAppointments(), canViewUserDirectory()"],
    ["health_coach", "/health-coach", "Yes", "Assigned patients, appointments and notes, patient communication, team views.", "canViewUserDirectory(), canManageAppointments()"],
    ["nutritionist", "/nutritionist", "Yes", "Appointments and notes plus team views; deliberately not the user directory.", "canManageAppointments()"],
    ["user / patient (default)", "/dashboard", "No", "Own health assessment, biomarker and biological-age views, reports, uploads, appointments, AI chat, wearable connections, profile.", "Session ownership checks in each patient route"],
    ["(unrecognized role)", "/dashboard", "No", "Falls through to the patient dashboard — the app's deliberate catch-all rather than an error page.", "getRoleBasedRedirect() default"],
  ],
};

// ---------------------------------------------------------------------------
// 12. Directory map
// ---------------------------------------------------------------------------

export const directories = {
  name: "12 Directory Map",
  title: "Where Things Live",
  columns: [
    { header: "Path", width: 52 },
    { header: "Contains", width: 100 },
  ],
  rows: [
    ["apps/web/src/app/(home)", "Marketing landing page composed from components/home/*."],
    ["apps/web/src/app/(docs)", "Docs, blog, and biomarker-encyclopedia route groups backed by fumadocs."],
    ["apps/web/src/app/(dashboard)", "All role dashboards: dashboard (patient), doctor, health-coach, nutritionist, admin, superadmin."],
    ["apps/web/src/app/api", "Every backend endpoint, namespaced by the role permitted to call it (public/patient/staff/admin/superadmin)."],
    ["apps/web/src/lib/auth", "Better Auth server + client setup, role config, guards (require-role, require-admin), Zod schemas, public paths, email sender."],
    ["apps/web/src/lib/ai", "Provider clients (OpenAI/Gemini), system-prompt builder, patient-context builder."],
    ["apps/web/src/lib/biological-age", "The pure calculation function, its runner, and the legacy biomarker id map."],
    ["apps/web/src/lib/pdf", "pdfjs text extraction, biomarker alias table, report parser, unit conversion, upload helper."],
    ["apps/web/src/lib", "Integration clients: cal-com.ts, cloudinary.ts, resend.ts, patients.ts, contact.ts, docs/source/page-tree."],
    ["apps/web/src/content", "MDX sources for docs, blogs, and biomarkers."],
    ["apps/web/src/components", "auth, common, dashboard (per role), docs, home, layout."],
    ["apps/automation/src/app/(dashboard)", "Console pages laid out along the pipeline: home (funnel + needs-attention), work (conversations, contacts, tasks), automation (flows, runs), setup (templates, stock, audience, availability), plus the contact 360 view."],
    ["apps/automation/src/nodes", "One file per flow node type plus the executor registry (index.ts) and shared types."],
    ["apps/automation/src/lib", "WhatsApp template sync/parse, CSV import, scheduling helpers, phone normalization, Cloudinary, auth."],
    ["apps/automation/src/*.ts", "worker, http-server, engine, queue, redis, schedule-resume, and the seed/check/send ops scripts."],
    ["packages/db/src", "schema.ts (37 tables), client.ts (pool), domain-events.ts, emit-domain-event.ts, normalize-phone.ts, contact-stage.ts."],
    ["packages/db/scripts", "create-superadmin, create-ai-config, create-cal-event-type — first-run bootstrap scripts."],
    ["packages/ui/src/components", "shadcn primitives, ai-elements (chat), canvasui (shader visuals), predict (age-bar, bio-clock, biomarker-card)."],
    ["packages/communication/src", "send-communication, send-session-message, template-body, and adapters (whatsapp, email, types, unimplemented)."],
    ["open-wearables/backend/app", "api/routes/v1 (33 route modules), models, repositories, schemas, services (per provider), algorithms, integrations/celery."],
    ["open-wearables/frontend/src", "TanStack Router developer portal: routes, components, hooks/api, lib/{api,auth,query,validation}."],
    ["open-wearables/mcp/app", "FastMCP server exposing users/activity/sleep/workouts/timeseries as AI tools."],
  ],
};

// ---------------------------------------------------------------------------
// 13. Work summary
// ---------------------------------------------------------------------------

const w = (n, area, deliverable, scope, status) => [n, area, deliverable, scope, status];

export const workSummary = {
  name: "13 Work Summary",
  title: "Deliverables — What Was Built",
  note: "3 applications · 5 shared packages · 37 database tables · 72 API route handlers · 20 automation node types · 26 domain event types · ~45 shared UI components · 8 external integrations.",
  columns: [
    { header: "#", width: 6 },
    { header: "Area", width: 18 },
    { header: "Deliverable", width: 34 },
    { header: "Scope covered", width: 110 },
    { header: "Status", width: 48 },
  ],
  rows: [
    w(1, "Foundation", "Monorepo setup", "Turborepo task graph + pnpm workspaces, 2 apps and 5 packages, shared ESLint 9 and TypeScript configs, env-aware build cache.", "Delivered"),
    w(2, "Foundation", "Design system (@workspace/ui)", "~45 shadcn/Radix/Base-UI primitives, 4 AI chat elements, 3 PredictFit health widgets (age bar, bio clock, biomarker card), 3 shader/canvas visuals, Tailwind v4 theme, dark/light mode.", "Delivered"),
    w(3, "Foundation", "Database layer (@workspace/db)", "37-table Drizzle schema, deployment-aware connection pool, migration setup on a non-pooled URL, 3 bootstrap scripts (superadmin, AI config, Cal.com event type).", "Delivered"),
    w(4, "Foundation", "Authentication & RBAC", "Better Auth: email/password, Google OAuth with account linking, email OTP, sessions, password reset; 6 roles with route guards, role-based redirects, and typo-alias normalization.", "Delivered"),
    w(5, "Public site", "Marketing website", "Landing page with 3D (Three.js / R3F), GPU shader backgrounds, GSAP scroll timeline, hero, features, protocol, testimonials, FAQ, waitlist and lead capture forms.", "Delivered"),
    w(6, "Public site", "Content system", "fumadocs with 3 separate MDX collections — docs, blogs, biomarker encyclopedia — each with Zod-validated frontmatter, page tree, search, JSON-LD SEO.", "Delivered"),
    w(7, "Product", "Patient dashboard", "Overview, health assessment, biomarker view, biological age, biological clock, reports, appointments, AI assistant, wearables, profile, settings.", "Delivered"),
    w(8, "Product", "Care-team dashboards", "Doctor, health coach and nutritionist areas: assigned patients, patient profiles, appointments with visit notes, team directory, per-member views.", "Delivered"),
    w(9, "Product", "Admin dashboard", "User directory, patient/doctor/coach/nutritionist management, intake queue, per-user appointment drill-down, manual communications.", "Delivered"),
    w(10, "Product", "Superadmin dashboard", "Full user administration with status/role changes, biomarker taxonomy editor (categories, domains, biomarkers + 2 mapping editors), runtime AI configuration.", "Delivered"),
    w(11, "Clinical", "Biomarker engine", "Configurable 3-level taxonomy (index → domain → biomarker) with many-to-many mappings editable from the UI, plus per-patient reading storage — reconfigurable without a deploy.", "Delivered"),
    w(12, "Clinical", "Biological age calculation", "Pure Z-score model: per-marker |Z|, per-domain Mean|Z|, weights W_d and alpha α_d derived per run, composite score, delta age, per-domain breakdown, result history.", "Delivered — one clinical rule (Up adds / Down subtracts) pending confirmation"),
    w(13, "Clinical", "Lab report ingestion", "Client-side PDF text extraction, biomarker alias and unit matching, unit normalization, in-browser preview, confirm-then-commit into readings, Cloudinary storage of the file.", "Delivered"),
    w(14, "AI", "AI health assistant", "Streaming chat, switchable OpenAI / Gemini provider chosen at runtime from a config row, patient-context builder, system-prompt builder, conversation and message persistence, daily message limits.", "Delivered"),
    w(15, "Scheduling", "Appointment system", "Cal.com v2 integration (slots, booking, reschedule, cancel), staff-side scheduling, doctor availability windows, visit notes, per-role appointment views.", "Delivered"),
    w(16, "Integrations", "File & media management", "Signed Cloudinary uploads for report PDFs, profile images and message media, with CDN delivery.", "Delivered"),
    w(17, "Integrations", "Transactional email", "Resend integration for verification, password reset, and notification email, plus an email channel adapter.", "Delivered"),
    w(18, "Integrations", "Open Wearables integration", "Self-hosted Open Wearables deployment, server-side catch-all proxy route covering the whole v1 API, provider listing and OAuth connect UI for 8 cloud providers.", "Delivered — needs patient↔wearable user mapping and POST proxy support"),
    w(19, "Backend", "API surface", "72 route handlers namespaced by caller (public / patient / staff / admin / superadmin), each applying its own session and role guard.", "Delivered"),
    w(20, "Automation", "Automation console (apps/automation)", "Second Next.js app, 12 pages in a pipeline-ordered sidebar (Home; Work: inbox/people/tasks/schedule, open to health coaches and receptionists; Automation: flows/activity and Setup: templates/media/audiences/availability, both admin-only), plus a 4-tab contact 360 view.", "Delivered"),
    w(21, "Automation", "Visual flow builder", "Drag-and-drop React Flow canvas, immutable published flow versions, and a per-contact test run.", "Delivered"),
    w(22, "Automation", "Flow execution engine", "BullMQ worker, job queue, run engine (start / advance / resume-with-reply), delayed-resume scheduler, per-node execution logging, and 20 node types across entry, logic, timing, messaging, actions and external calls.", "Delivered — the AI node is a registered placeholder"),
    w(23, "Automation", "Domain event pipeline", "24-value event taxonomy, idempotent event emitter, event→flow subscription matching, and exactly-once trigger claiming.", "Delivered"),
    w(24, "Messaging", "WhatsApp integration", "Outbound template, session-text and interactive-list sending over Meta Graph with provider limits enforced locally; inbound webhook server with HMAC signature verification, delivery-status and reply ingestion, and flow resumption.", "Delivered"),
    w(25, "Messaging", "Communication layer", "Channel-agnostic send API, WhatsApp and email adapters, template body and variable resolution, and full message logging to the database.", "Delivered"),
    w(26, "CRM", "Contact & lead data model", "Unified contact record keyed on normalized phone, 5 stored lifecycle stages on one axis and engagement on another, an 8-stage / 4-phase operational funnel derived on top, audiences and segments, staff tasks, adherence logs, communication preferences.", "Delivered"),
    w(27, "Ops", "CLI tooling", "9 scripts for seeding flows and test data, WhatsApp credential checks, CSV import validation, template submission and sync, and test sends.", "Delivered"),
    w(28, "Docs", "Project documentation", "Rewritten README, a 10-section ARCHITECTURE.md, and a 13-sheet architecture workbook with a regeneration script so it stays current.", "Delivered"),
  ],
};

export const sheets = [
  overview,
  workspaces,
  dependencies,
  owDependencies,
  integrations,
  envVars,
  dbTables,
  apiRoutes,
  automationNodes,
  dataFlows,
  roles,
  directories,
  workSummary,
];
