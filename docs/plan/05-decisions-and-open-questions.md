# 5. Decisions and open questions

## 5.1 Decisions made

| # | Decision | Reason |
|---|---|---|
| D1 | GitHub Pages hosts the frontend only | Static hosting, free, same repo |
| D2 | Supabase for DB, functions, cron | TypeScript end to end, free tier, local dev |
| D3 | Backend code lives in the same repo (`supabase/`), deployed via Actions | One place for everything, independent deploy workflows |
| D4 | Brevo for email, single-sender verification | No domain available |
| D5 | No user accounts; secret links (admin token + reveal tokens), stored hashed | Simplest secure model for a small private app |
| D6 | Organizer is also a participant and can't see matches | Core requirement |
| D7 | Participants see each other's names | They already know each other |
| D8 | Redo draw allowed; dedicated email emphasising the remake; same links keep working | Confirmed |
| D9 | "Tag" renamed to **theme**; a hint for the gift the giver buys | Confirmed |
| D10 | App stays private forever: no CAPTCHA/public abuse work | Confirmed |
| D11 | UI and emails in Romanian and English; party language chosen by organizer | Requirement |
| D12 | Sattolo single-cycle draw (no self-match, no 2-cycles for n≥3) | Simple, fair enough |
| D13 | Participants locked after draw; changes go through redo (except email typo fix) | Keeps matches consistent |
| D14 | Retention: delete parties 30 days after event | Privacy |
| D15 | Repo is **public** (`secret-santa`), so GitHub Pages is free | Confirmed |
| D16 | Default UI language is **English** | Confirmed |
| D17 | Romanian gendered wording uses parentheses, e.g. "invitat(ă)" | Confirmed |
| D18 | Fixed timezone `Europe/Bucharest` | Confirmed |
| D19 | Currency by language: ro → RON, en → USD; hint rate $1 ≈ 5 RON; no picker, no live conversion | Confirmed |
| D20 | Max **15** participants per party (and 5 parties/day) | Confirmed |
| D21 | Same-gender mode allows groups of exactly 2 (forced swap) | Confirmed |
| D22 | No reminders after the event date | Confirmed |
| D23 | Organizer sees only an "opened" flag per participant, never matches/themes | Lets them nudge people who haven't looked; leaks nothing |
| D24 | Access code (formerly "passphrase") kept as a cheap guard, easy to remove | See 1.5 |
| D25 | Admin link is never stored in the browser; after creating a party the app redirects to the manage page (the link is in the URL) and shows a copy-link banner | Confirmed |
| D26 | Events in the past are rejected (browser and server) | Confirmed |
| D27 | Iteration 1 sends the real admin-link email through Brevo | Confirmed |
| D28 | Validation and time helpers are dependency-free TypeScript in `supabase/functions/_shared`, imported by both the web app and the functions (replaces the planned Zod schemas) | One source of truth without a Deno/npm dependency mismatch |
| D29 | The access code field lives on the create form (not on the home page) | Survives page refresh, simpler |
| D30 | Create/update run as atomic SQL functions (`create_party_tx`, `update_party_tx`); editing replaces the participant list | Draft-stage only, no tokens to preserve |

## 5.2 Open questions

1. **Access code:** keep it (recommended: protects your Brevo quota) or drop it and rely on the caps only?
2. **Opened status (D23):** shown by default. Say so if you'd rather hide it.
3. **Daily party cap** of 5: fine, or different?

## 5.3 Risks

| Risk | Mitigation |
|---|---|
| Emails land in spam (no domain, Gmail sender) | Test early in Iteration 2, advise on cheap domain if needed |
| Supabase free project pauses after inactivity | Note in README; keep-alive cron or manual unpause before an event |
| Organizer loses admin link | Re-send flow via organizer email (Iteration 6) |
| Romanian copy quality | All copy in two JSON files + templates for one-place proofreading |
| DB owner can read matches | Accepted for a friends-only app, documented |
| Public repo exposes code | No secrets in repo; all secrets in Supabase/GitHub secrets (doc 6) |
