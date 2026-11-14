# PredictFit — Work Summary

Deliverables built in this project, by area. Scope is stated as what actually exists in the
codebase, not as a plan.

**Scale:** 3 applications · 5 shared packages · 37 database tables · 72 API route handlers ·
20 automation node types · 26 domain event types · ~45 shared UI components · 8 external integrations.

---

| # | Area | Deliverable | Scope covered | Status |
|---|------|-------------|---------------|--------|
| 1 | Foundation | Monorepo setup | Turborepo task graph + pnpm workspaces, 3 apps and 5 packages, shared ESLint 9 and TypeScript configs, env-aware build cache | Delivered |
| 2 | Foundation | Design system (`@workspace/ui`) | ~45 shadcn/Radix/Base-UI primitives, 4 AI chat elements, 3 PredictFit health widgets (age bar, bio clock, biomarker card), 3 shader/canvas visuals, Tailwind v4 theme, dark/light mode | Delivered |
| 3 | Foundation | Database layer (`@workspace/db`) | 37-table Drizzle schema, deployment-aware connection pool, migration setup on a non-pooled URL, 3 bootstrap scripts (superadmin, AI config, Cal.com event type) | Delivered |
| 4 | Foundation | Authentication & RBAC | Better Auth: email/password, Google OAuth with account linking, email OTP, sessions, password reset; 8 roles declared once in `@workspace/db/roles` and derived by all three apps, panel-per-role routing that redirects across origins, route guards and typo-alias normalization | Delivered |
| 5 | Public site | Marketing website | Landing page with 3D (Three.js / R3F), GPU shader backgrounds, GSAP scroll timeline, hero, features, protocol, testimonials, FAQ, waitlist and lead capture forms | Delivered |
| 6 | Public site | Content system | fumadocs with 3 separate MDX collections — docs, blogs, biomarker encyclopedia — each with Zod-validated frontmatter, page tree, search, JSON-LD SEO | Delivered |
| 7 | Product | Patient dashboard | Overview, health assessment, biomarker view, biological age, biological clock, reports, appointments, AI assistant, wearables, profile, settings | Delivered |
| 8 | Product | Care-team dashboards | Doctor, health coach and nutritionist areas: assigned patients, patient profiles, appointments with visit notes, team directory, per-member views | Delivered |
| 9 | Product | Admin dashboard | User directory, patient/doctor/coach/nutritionist management, intake queue, per-user appointment drill-down, manual communications | Delivered |
| 10 | Product | Superadmin dashboard | Full user administration with status/role changes, biomarker taxonomy editor (categories, domains, biomarkers + 2 mapping editors), runtime AI configuration | Delivered |
| 11 | Clinical | Biomarker engine | Configurable 3-level taxonomy (index → domain → biomarker) with many-to-many mappings editable from the UI, plus per-patient reading storage — the model is reconfigurable without a deploy | Delivered |
| 12 | Clinical | Biological age calculation | Pure Z-score model: per-marker \|Z\|, per-domain Mean\|Z\|, weights W_d and alpha α_d derived per run, composite score, delta age, per-domain breakdown, result history | Delivered — one clinical rule (Up adds / Down subtracts) pending confirmation |
| 13 | Clinical | Lab report ingestion | Client-side PDF text extraction, biomarker alias and unit matching, unit normalization, in-browser preview, confirm-then-commit into readings, Cloudinary storage of the file | Delivered |
| 14 | AI | AI health assistant | Streaming chat, switchable OpenAI / Gemini provider chosen at runtime from a config row, patient-context builder, system-prompt builder, conversation and message persistence, daily message limits | Delivered |
| 15 | Scheduling | Appointment system | Cal.com v2 integration (slots, booking, reschedule, cancel), staff-side scheduling, doctor availability windows, visit notes, per-role appointment views | Delivered |
| 16 | Integrations | File & media management | Signed Cloudinary uploads for report PDFs, profile images and message media, with CDN delivery | Delivered |
| 17 | Integrations | Transactional email | Resend integration for verification, password reset, and notification email, plus an email channel adapter | Delivered |
| 18 | Integrations | Open Wearables integration | Self-hosted Open Wearables deployment, server-side catch-all proxy route covering the whole v1 API, provider listing and OAuth connect UI for 8 cloud providers | Delivered — needs patient↔wearable user mapping and POST proxy support |
| 19 | Backend | API surface | 72 route handlers namespaced by caller (public / patient / staff / admin / superadmin), each applying its own session and role guard | Delivered |
| 20 | Automation | Automation console (`apps/automation`) | Second Next.js app, 12 pages in a pipeline-ordered sidebar (Home; Work: inbox/people/tasks/schedule, open to health coaches and receptionists; Automation and Setup admin-only), a funnel + needs-attention home screen, a pull-based task queue with claiming, and a 4-tab contact 360 view (profile, medical history, chat history, automation journey) | Delivered |
| 21 | Automation | Visual flow builder | Drag-and-drop React Flow canvas, immutable published flow versions, and a per-contact test run | Delivered |
| 22 | Automation | Flow execution engine | BullMQ worker, job queue, run engine (start / advance / resume-with-reply), delayed-resume scheduler, per-node execution logging, and 20 node types across entry, logic, timing, messaging, actions and external calls | Delivered — the AI node is a registered placeholder |
| 23 | Automation | Domain event pipeline | 24-value event taxonomy, idempotent event emitter, event→flow subscription matching, and exactly-once trigger claiming | Delivered |
| 24 | Messaging | WhatsApp integration | Outbound template, session-text and interactive-list sending over Meta Graph with provider limits enforced locally; inbound webhook server with HMAC signature verification, delivery-status and reply ingestion, and flow resumption | Delivered |
| 25 | Messaging | Communication layer (`@workspace/communication`) | Channel-agnostic send API, WhatsApp and email adapters, template body and variable resolution, and full message logging to the database | Delivered |
| 26 | CRM | Contact & lead data model | Unified contact record keyed on normalized phone, 5 stored lifecycle stages (LEAD/BOOKED/PATIENT/INACTIVE/LOST) on one axis and engagement on another, an 8-stage / 4-phase operational funnel derived on top of them, audiences and segments, staff tasks, adherence logs, communication preferences | Delivered |
| 27 | Ops | CLI tooling | 9 scripts for seeding flows and test data, WhatsApp credential checks, CSV import validation, template submission and sync, and test sends | Delivered |
| 28 | Docs | Project documentation | Rewritten README, a 10-section ARCHITECTURE.md, and a 12-sheet architecture workbook with a regeneration script so it stays current | Delivered |

---

## Delivery phases

| Phase | Covers | Rows |
|-------|--------|------|
| 1 — Platform foundation | Monorepo, design system, database, auth | 1–4 |
| 2 — Public product | Marketing site, content system | 5–6 |
| 3 — Role dashboards | Patient, care team, admin, superadmin | 7–10 |
| 4 — Clinical core | Biomarker engine, biological age, report ingestion | 11–13 |
| 5 — Intelligence & services | AI assistant, scheduling, media, email, wearables, API | 14–19 |
| 6 — Automation & messaging | Console, flow builder, engine, events, WhatsApp, CRM, tooling | 20–27 |
| 7 — Documentation | README, architecture doc, workbook | 28 |

---

## Open items

| Item | Where | Note |
|------|-------|------|
| Patient ↔ Open Wearables user mapping | `dashboard/wearables` | The wearable user id currently comes from `localStorage` with a hard-coded fallback; it needs to be stored server-side per patient. |
| Wearables proxy write support | `api/patient/wearables/[...path]` | Only `GET` is implemented today. |
| AI node in the flow engine | `automation/src/nodes/ai.ts` | Registered as a placeholder so graphs can reference it; no model wired up yet. |
| Event delivery latency | `automation/src/worker.ts` | Events are polled every 5s; `LISTEN/NOTIFY` or a watermark cursor is the documented next step. |
| Biological age direction rule | `lib/biological-age/calculate.ts` | Every \|Z\| is currently added; the "Up adds, Down subtracts" rule is pending clinical confirmation. |
