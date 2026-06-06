# Integración de Equipos

Full-stack web application for running **Team Integration assessments** for organizations.
Participants complete structured questionnaires; administrators manage the assessment
process through an admin console. The system collects responses, aggregates results,
and (eventually) produces structured reports.

**Language convention:** The UI (admins and participants) is in **Spanish**. All technical
discussion, code, comments, and this document are in **English**.

## Assessment instruments

- **C1 — Team Integration Feedback.** Participants evaluate the team environment and
  dynamics. Reporting (planned): one aggregated report per process, covering all team members.
- **C2 — Peer Feedback.** Participants give structured feedback about each other. Reporting
  (planned): one report per focal participant, summarizing the N-1 peers' feedback. The C2
  report will also include a C1-derived section telling the participant with whom they should
  have private conversations.

## Tech stack

**Frontend:** Vite + React + React Router. Questionnaires render dynamically through
[src/components/QuestionnaireRenderer.jsx](src/components/QuestionnaireRenderer.jsx).

**Backend:** Node.js + Express + JWT auth. All routes live in
[server/index.js](server/index.js). Two role namespaces:
- Admin → `/api/admin/*`
- Participant → `/api/app/*`

**Persistence:** PostgreSQL via [server/lib/pg.js](server/lib/pg.js). Questionnaire
responses are stored as `jsonb` (`response_c1.draft`, `response_c2.draft`). Rationale:
questionnaires are flexible, reporting extracts from JSONB dynamically, and process size is
small (~15 participants).

> Note: This project was migrated from a `db.json` file store to PostgreSQL. PostgreSQL is
> the single source of truth — prefer PG-only code over any JSON fallback.

## Project layout

```
src/
  components/
    QuestionnaireRenderer.jsx   dynamic questionnaire rendering
    AdminProtectedRoute.jsx     guards /admin/* routes
    ProtectedRoute.jsx          guards participant routes
    ParticipantBrandBar.jsx, Logo.jsx, Markdown.jsx
    admin/TemplateEditor.jsx
  pages/
    Login.jsx, AppHome.jsx, Questionnaires.jsx, C1.jsx, C2.jsx, ForgotPassword.jsx
    admin/
      AdminLogin.jsx, ProcessesList.jsx, ProcessEditor.jsx,
      ProcessDashboard.jsx, ProcessRouter.jsx, MasterTemplates.jsx
  services/   admin.js, auth.js   (frontend API clients)
  assets/, styles/
server/
  index.js          Express app + all routes
  lib/              pg.js (PG pool), auth.js (JWT), questionnaires.js
  sql/schema.sql    full schema; applied by db:init
  scripts/          init-db.js, create-admin.js, reset-admin-password.js,
                    migrate-fk-cascade.js
  uploads/          uploaded files (e.g. logos)
```

## Routing

**Public**
- `/` — participant login
- `/forgot` — hidden until email sending is implemented

**Participant** (guarded by `ProtectedRoute`)
- `/app/:processSlug/questionnaires`
- `/app/:processSlug/c1`
- `/app/:processSlug/c2/:peerId`

**Admin** (guarded by `AdminProtectedRoute`)
- `/admin/login`
- `/admin/processes`, `/admin/processes/new`, `/admin/processes/:processSlug`
- `/admin/master-templates`
- `/admin/processes/:processSlug/participants/:participantId/c1` and
  `.../c2/:peerId` — read-only admin view of a participant's responses
  ([ParticipantResponsesView.jsx](src/pages/admin/ParticipantResponsesView.jsx)),
  reached by clicking a questionnaire card in the dashboard's expanded progress panel.
  Backed by admin-only GET endpoints that mirror the participant routes but take the
  participant id from the URL.

**Admin process routing** — [ProcessRouter.jsx](src/pages/admin/ProcessRouter.jsx) dispatches
on process status:
- `EN_PREPARACION` → `ProcessEditor`
- `EN_CURSO` / `CERRADO` → `ProcessDashboard`

## Data model

PostgreSQL tables (see [server/sql/schema.sql](server/sql/schema.sql)):
`admins`, `processes`, `base_templates`, `process_templates`, `participants`,
`response_c1`, `response_c2`, `events`.

**Process model:** companyName, processName, processSlug, participants, questionnaire
templates, responses, status, expected dates, logoUrl.

**Template model:** base (master) questionnaire templates are copied per-process into
`process_templates`. A parallel report-template architecture is planned (base report
templates → process-level report templates).

## Commands

Run from the repo root.

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server (frontend) |
| `npm run api` | Backend dev server (`server/`, node --watch) |
| `npm run dev:full` | Both frontend + backend concurrently |
| `npm run build` | Production frontend build |
| `npm run lint` | ESLint |
| `npm run db:init` (in `server/`) | Apply `server/sql/schema.sql` (idempotent) |
| `npm run db:migrate-fk-cascade` (in `server/`) | One-off FK cascade migration |

Admin user management: `server/scripts/create-admin.js`, `reset-admin-password.js`.

## Environments

**Local (primary development).** Local PostgreSQL on the Mac. Always test locally before
deploying.
- Backend env: [server/.env](server/.env)
- Connection: `DATABASE_URL=postgresql://gretana@localhost:5432/integracion`
- Role: `gretana`, no password.

**Production.** Ubuntu server on AWS.
- SSH (from repo root): `ssh -i ../../Personal/WordPress/webadminkey webadmin@ssh.germanretana.com`
- Backend service: `integracion-backend`
- Frontend served by NGINX
- DB: `integracion`, app role `integracion_app`
- Prod env: `/home/webadmin/integracion-app/shared/.env`
- Prod app layout: only `current/` + `shared/` under `/home/webadmin/integracion-app/`
  are live; anything else there is orphan legacy.

## CI/CD

Deploy is automatic via GitHub Actions on `git push origin main`
([.github/workflows/deploy.yml](.github/workflows/deploy.yml)):
build frontend → deploy frontend to NGINX dir → deploy backend source → `npm ci` →
run `db:init` (idempotent) → restart backend service.

GitHub Actions does **not** provision PostgreSQL; DB management is manual.

## Reporting system (planned — priority #1)

Reports are generated from questionnaire responses and exported as **editable Microsoft
Word documents**, with company branding, logos, charts, and aggregated text sections.

- **C1 reports:** one per process.
- **C2 reports:** one per participant.

Aggregation rules:
- Numeric values → averaged, shown with 1 decimal.
- Categorical values → frequency charts.
- Text responses → aggregated bullet points.
- Pairing rows → frequency analysis (visible to admins), and included in each participant's
  C2 report as: *"El equipo ha sugerido que usted tenga conversaciones privadas con los
  siguientes compañeros"*, reporting how often each conversation was suggested. This data
  comes from the C1 questionnaires.

Future: AI-assisted summarization.

## Email integration (planned — priority #2)

Google SMTP. Initial features: welcome emails and password-reset emails. For now password
resets are admin-only (no secure reset links yet); `/forgot` stays hidden until sending works.

## Technical debt

1. Validate emails when an admin enters participants' emails (mirror the login screen's
   email validation).
2. The last C2 question has a `<peer>` placeholder meant to be filled with the target
   participant's name — it is currently not rendering.

## How we work together

Incremental, small steps with frequent testing. Each change follows: **read files →
analyze → minimal implementation → explain what to test (mainly by navigating the UI) →
commit**. Do not assume code — read the relevant files first. Explain changes thoroughly;
the goal is for the user to learn. Test locally before deploying. Ask before committing.

## Keeping this file accurate

This document is maintained as the project evolves. When a structural fact here changes
(routes, tables, scripts, env, deploy steps, priorities) or a planned feature ships, update
the relevant section in the same change so CLAUDE.md stays the source of truth.
