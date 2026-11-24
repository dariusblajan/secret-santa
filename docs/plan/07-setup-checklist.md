# 7. Setup checklist

Tick these off as you go. Never commit or paste keys, tokens or the DB password anywhere public. Keep them in a password manager.

## Phase 1: Local tools
- [x] Node, npm, git, Homebrew
- [x] Docker Desktop (running; `docker --version` works)
- [x] Supabase CLI (`brew install supabase/tap/supabase`, `supabase --version`)
- [ ] (Optional) GitHub CLI: `brew install gh`, then `gh auth login`

## Phase 2: Supabase project
- [ ] Create a new project (region near Romania, e.g. Frankfurt)
- [ ] Save the **database password** (cannot be viewed again, only reset)
- [ ] Note the **project ref** (from the dashboard URL or Project Settings → General)
- [ ] Note the **project URL** `https://<ref>.supabase.co` (Project Settings → API)
- [ ] Note the **anon/publishable key** (Project Settings → API Keys). Public, safe for the frontend
- [ ] Generate an **access token** (Account → Access Tokens), name it `github-actions`
- [ ] Leave Database/Auth settings alone: migrations will configure everything

## Phase 3: Brevo
- [ ] Account activated (no "pending validation" banner)
- [ ] Sender added and **verified** (Senders, Domains & Dedicated IPs → Senders)
- [ ] **API key** generated (SMTP & API → API Keys), name it `secret-santa`
- [ ] (Optional) test email via the Brevo API with curl, check inbox vs spam

## Phase 4: GitHub repo
- [ ] Create public repo `dariusblajan/secret-santa` (no README/license added on GitHub)
- [ ] Initial commit and push
- [ ] Settings → Pages → Source: **GitHub Actions**
- [ ] Settings → Secrets and variables → Actions:

| Type | Name | Value |
|---|---|---|
| Secret | `SUPABASE_ACCESS_TOKEN` | access token from phase 2 |
| Secret | `SUPABASE_DB_PASSWORD` | database password |
| Variable | `SUPABASE_PROJECT_REF` | project ref |
| Variable | `VITE_SUPABASE_URL` | project URL |
| Variable | `VITE_SUPABASE_ANON_KEY` | anon/publishable key |

## Phase 5: Link local to Supabase (after the Iteration 0 scaffold)
- [ ] `supabase login`
- [ ] `supabase link --project-ref <ref>` (asks for the DB password)
- [ ] Choose an `ACCESS_CODE` (a short phrase you can share with friends)
- [ ] Set function secrets (never committed):

```
supabase secrets set \
  BREVO_API_KEY=... \
  BREVO_SENDER_EMAIL=... \
  BREVO_SENDER_NAME="Secret Santa" \
  ACCESS_CODE=... \
  PUBLIC_APP_URL=https://dariusblajan.github.io/secret-santa/
```

## Phase 6: Verify
- [ ] Push to `main`: the web workflow publishes to `https://dariusblajan.github.io/secret-santa/`
- [ ] Backend workflow deploys the health-check function
- [ ] Calling the health-check from the deployed site succeeds (CORS OK)
- [ ] Local: `supabase start` runs, `npm run dev` in `web/` loads the app

## Notes
- The Pages URL `https://dariusblajan.github.io/secret-santa/` means Vite `base` must be `/secret-santa/`.
- Supabase free projects pause after ~1 week of inactivity. Unpause from the dashboard before an event.
