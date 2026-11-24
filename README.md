# Secret Santa

A small, private Secret Santa app for friends. An organizer creates a party, adds participants, and the app runs a secret random draw, emails everyone their match and a gift **theme**, and can send reminders. The organizer is also a participant and cannot see anyone's match.

> Status: **planning**. No code yet. Start with the plan documents below.

## Plan documents

| # | Document | What's in it |
|---|---|---|
| 1 | [Architecture](docs/plan/01-architecture.md) | Stack, GitHub hosting limits, monorepo layout, identity, security, deploys |
| 2 | [Domain & draw](docs/plan/02-domain-and-draw.md) | Data model, draw algorithm, same-gender mode, themes, redo draw |
| 3 | [i18n & emails](docs/plan/03-i18n-and-emails.md) | Romanian/English strategy, email catalogue, reminder examples, theme list |
| 4 | [Iterations](docs/plan/04-iterations.md) | Iterations 0–6 with use-case flows, UI to review, acceptance criteria |
| 5 | [Decisions & open questions](docs/plan/05-decisions-and-open-questions.md) | Decision log and what still needs your input |
| 6 | [Backend setup & API](docs/plan/06-backend-setup-and-api.md) | One-time setup checklist, how the frontend calls the backend, API surface, local dev |
| 7 | [Setup checklist](docs/plan/07-setup-checklist.md) | Step-by-step tick list for Supabase, Brevo, GitHub, and linking everything |

## Summary of key decisions

- **Frontend:** React + TypeScript + Vite + Tailwind, hash routing, deployed to GitHub Pages.
- **Backend:** Supabase (Postgres, Edge Functions, `pg_cron`), code lives in this same repo under `supabase/`.
- **Email:** Brevo free tier (no domain required).
- **No accounts:** secret links (admin token for the organizer, reveal token per participant).
- **Languages:** English (default) and Romanian for UI and all emails. Timezone fixed to Europe/Bucharest; currency by language (USD / RON).
- **Private forever:** creating parties is gated by a shared access code; max 15 participants per party.
