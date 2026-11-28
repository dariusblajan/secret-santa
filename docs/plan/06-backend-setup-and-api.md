# 6. Backend setup and frontend ↔ API connection

## 6.1 One-time setup you'll need to do

None of this is in the repo; it's accounts and settings. We'll write the exact steps into the README in Iteration 0/6.

**Accounts and tools**
1. **Supabase account**, then create a project (free tier). Note the *project ref*, the *project URL*, the *anon key*, and the *database password*.
2. **Brevo account** (free), then verify a **single sender** (your email). Create an **API key**.
3. **Local tools:** Node.js, Docker Desktop (for local Supabase), and the Supabase CLI (`npm i -D supabase` or Homebrew).

**GitHub repo settings**
4. Settings → Pages → Source: **GitHub Actions**.
5. Settings → Secrets and variables → Actions:
   - *Secrets:* `SUPABASE_ACCESS_TOKEN` (personal token from Supabase dashboard), `SUPABASE_DB_PASSWORD`.
   - *Variables:* `SUPABASE_PROJECT_REF`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. These last two are public by design, so variables rather than secrets is fine.

**Supabase function secrets** (set once with `supabase secrets set …`, never committed)
- `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`
- `ACCESS_CODE` (the shared code for creating parties)
- `PUBLIC_APP_URL` (`https://dariusblajan.github.io/secret-santa/`)

**Supabase project settings**
- Enable extensions `pg_cron` and `pg_net` (done in a migration), used only by the retention `cleanup` job.
- Store the service key for cron in **Supabase Vault** so the scheduled job can call `cleanup`.

After that, day to day: push to `main` → the workflows deploy everything. There's nothing to run or host yourself.

## 6.2 How the frontend talks to the API

There's no custom server. The browser calls **Supabase Edge Functions** over HTTPS:

```
https://<project-ref>.supabase.co/functions/v1/<function-name>
```

- Use `@supabase/supabase-js` and `supabase.functions.invoke('reveal', { body: { token } })`, or plain `fetch` with the header `Authorization: Bearer <anon key>`. The anon key is only a "this is our project" key. Real access control is the admin/reveal token plus the access code, checked inside each function.
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are injected at **build time** by Vite (`import.meta.env`) in the Pages workflow. Locally they come from `web/.env.local` (git-ignored; a `.env.example` is committed).
- **CORS:** each function returns CORS headers allowing the Pages origin (`https://<username>.github.io`) and `http://localhost:5173`. Shared helper in `_shared/cors.ts`.
- **Data access:** tables have RLS enabled with no anon policies, so the browser can't read them directly. Everything goes through functions, which use the service role key internally.
- **Typed client:** a small `web/src/lib/api.ts` wraps each function with typed request/response and Zod validation. Shared Zod schemas can live in `_shared` and be imported by both sides.

## 6.3 API surface (draft)

| Function | Auth | Request | Response |
|---|---|---|---|
| `create-party` | access code | party fields, participants | party id, sends `admin_link` email |
| `manage-party` (`get`/`update`) | admin token | party/participant/theme/exclusion edits (imported participants arrive as an ordinary participant list) | party + participants + exclusions + statuses (no matches) |
| `start-draw` | admin token | `{ sameGender, redo? }` | status; sends `invite` or `redo` emails. Draws using the party's stored exclusions; errors with a typed reason (`no_allowed_giftee`, `no_valid_cycle`, ...) if infeasible |
| `reveal` | reveal token | `{}` | own giftee, theme, party info, names, `drawVersion`, `remade` flag |
| `send-reminder` | admin token | `{ kind: 'countdown' \| 'theme' \| 'match' \| 'custom', customMessage? }` | sent count; updates `reminders_last_sent` |
| `resend-link` | email + party id | | re-sends admin or reveal link (rate-limited) |
| `cleanup` | service key (cron) | | deletes expired parties |

Notes:
- **Exclusions** are saved through `manage-party` (add/remove a `{ giverId, gifteeId }` pair). The server rejects self-pairs, duplicates, participants from another party, and edits when the party is not in `draft` or `drawn` status or the event date has passed. The infeasibility pre-flight uses the shared `_shared/draw.ts` check in the browser, and `start-draw` re-checks on the server.
- **Participants import** has no endpoint: the file is parsed in the browser and the rows go through the same `manage-party` / `create-party` participant list as manual entry, with the same server-side validation.

All functions validate input with Zod, return typed errors (`{ code, message }`) that the UI maps to translated messages, and log without printing tokens or emails.

## 6.4 Local development

```
supabase start                  # local Postgres + functions (Docker)
supabase functions serve        # hot reload for Edge Functions
cd web && npm run dev           # Vite at localhost:5173
```

- `web/.env.local` points at the local Supabase URL/anon key printed by `supabase start`.
- For emails locally: Supabase's local Inbucket mail catcher doesn't apply to Brevo calls, so use a `EMAIL_MODE=log` secret locally that prints emails to the console instead of sending.

## 6.5 Free-tier notes

- Supabase free projects **pause after ~1 week of inactivity**. Unpause from the dashboard before an event, or add a tiny keep-alive (the `cleanup` cron may already count as activity, to be verified).
- Brevo free: 300 emails/day, far above 15 people × a few emails per party.
