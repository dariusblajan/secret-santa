# 1. Architecture

## 1.1 What GitHub hosting can and can't do

GitHub Pages serves **static files only**. It cannot:

| Need | Why Pages alone fails |
|---|---|
| Send emails | Needs a server-side API key |
| Keep the draw secret from the organizer | Browser code and `localStorage` are inspectable |
| Persist across devices | Participants open links on their own phones |
| Run scheduled reminders | Needs a scheduler |

**Conclusion:** GitHub Pages hosts the UI; a free-tier backend (Supabase) does the rest. Both live in the same repo, but are deployed to different places.

Pages quirks to handle:
- No server-side SPA rewrites, so use **hash routing** (`/#/manage/<token>`).
- Site is served under `/<repo-name>/`, so Vite `base` must be set accordingly.
- The repo is **public**, so Pages is free. Never commit secrets (see doc 6 for where each secret lives).

## 1.2 Stack

| Layer | Choice | Notes |
|---|---|---|
| UI | React + TypeScript + Vite | |
| Styling | Tailwind CSS | |
| Routing | React Router (`HashRouter`) | |
| Data fetching | TanStack Query | |
| Forms | React Hook Form + Zod | Same Zod schemas can validate on the server |
| i18n | react-i18next | en + ro, see doc 3 |
| Backend | Supabase | Postgres + Edge Functions (Deno/TS) + `pg_cron` |
| Email | Brevo (free tier, 300/day) | Single-sender verification, no domain needed |
| Tests | Vitest (unit), Playwright (e2e) | |
| CI/CD | GitHub Actions | Two independent workflows |

Alternative considered: Cloudflare Workers + D1 + Cron Triggers. Equivalent free tier but a more backend-flavoured skill set. Supabase chosen for familiarity (TypeScript everywhere, SQL schema, local dev via Docker).

Email caveat: without a domain, sending from a Gmail address can land in spam more often. A ~€10/year domain would fix this; swapping later only changes sender config.

## 1.3 Monorepo layout

```
secret-santa/
├─ README.md
├─ docs/plan/                 # these documents
├─ web/                       # React app → GitHub Pages
│  ├─ src/
│  │  ├─ i18n/                # en.json, ro.json
│  │  ├─ pages/
│  │  ├─ components/
│  │  └─ lib/                 # API client, hooks
│  └─ vite.config.ts
├─ supabase/                  # backend → Supabase
│  ├─ config.toml
│  ├─ migrations/             # schema, RLS, pg_cron jobs
│  └─ functions/
│     ├─ create-party/
│     ├─ manage-party/        # get/update party + participants (admin token)
│     ├─ start-draw/          # draw + redo + invite/redo emails
│     ├─ reveal/              # participant token → own match only
│     ├─ send-reminder/       # manual + scheduled
│     ├─ cleanup/             # retention job
│     └─ _shared/             # draw.ts, emails/ (en, ro), brevo.ts, tokens.ts
└─ .github/workflows/
   ├─ deploy-web.yml          # paths: web/**
   └─ deploy-backend.yml      # paths: supabase/**
```

`_shared/draw.ts` is pure TypeScript (no Deno-only APIs) so Vitest can test it and, if useful, `web/` can import it for pre-flight validation.

## 1.4 Identity and access (no accounts)

| Actor | Credential | Can do |
|---|---|---|
| Anyone creating a party | Shared **access code** (env secret on the function), see 1.5 | Create a party |
| Organizer | **Admin token** in link `/#/manage/<token>` (emailed + remembered in browser) | Edit participants/themes, start/redo draw, send reminders |
| Participant | **Reveal token** in link `/#/reveal/<token>` (emailed) | See party details, participant names, **own** match and theme |

Rules:
- Tokens are long random values (≥128 bits). Only **SHA-256 hashes** are stored in the DB.
- The organizer is also a participant and gets their own reveal token. The admin token cannot read assignments.
- Lost admin link: the organizer's email can request a re-send of the admin link (simple, rate-limited).

## 1.5 Security model

- **RLS on, no direct table access** from the anon key. The browser talks only to Edge Functions (or tightly scoped RPCs).
- Assignments (`assigned_to`, `theme`) are only returned by `reveal`, filtered to the token's owner.
- The Supabase project owner could technically read the DB. That is accepted. The app UI and APIs never expose matches to the organizer.
- Abuse guards (private app, so deliberately light):
  - **Access code** required to create a party. Purpose: the site URL and the Supabase endpoint are public, so without a gate anyone who finds them could create parties and make the app send emails to arbitrary addresses, burning your Brevo quota (300/day) and your sender reputation. The code is one shared secret you give to people you trust. It's a single env var and a single input field, so it's easy to drop if you'd rather not have it (the caps below would then be the only guard).
  - Max **15** participants per party and max 5 parties created per day.
  - Basic per-IP rate limit on `reveal` and `create-party`.
- Secrets: Brevo API key and service role key live in **Supabase function secrets**. Supabase access token lives in **GitHub Actions secrets**. The anon key and project URL in the frontend are public by design.
- **Retention:** a scheduled job deletes parties 30 days after the event date.

## 1.6 Deployments

- `deploy-web.yml`: on push to `main` touching `web/**` → install, test, build, publish to Pages.
- `deploy-backend.yml`: on push to `main` touching `supabase/**` → `supabase db push` + `supabase functions deploy`.
- Local dev: `supabase start` (Docker) for DB + functions, `vite dev` for UI, `.env.local` for URLs.
- Environments: start with one production project plus local. Add a staging project only if needed.

## 1.7 Reminder scheduling

- Automated: `pg_cron` runs a job (e.g. hourly) that finds parties with due reminder presets and invokes `send-reminder`. A `reminders_log` table makes sends idempotent.
- Manual: the organizer triggers a reminder from the manage page.
- Both paths send **one email per participant**, so personalised content (match, theme) never passes through the organizer.
