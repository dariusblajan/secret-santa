# 4. Iterations

Each iteration ends with a **review gate**: we walk through the use-case flows and the UI (wireframes first, then the running screens) before starting the next one.

Legend: **Flow** = use case to review. **UI** = screens to review. **Done when** = acceptance criteria.

---

## Iteration 0: Foundations

**Scope**
- Monorepo skeleton (`web/`, `supabase/`, `docs/`).
- Vite + React + TS + Tailwind, HashRouter, app shell, design tokens.
- i18n skeleton (ro/en), language switcher, key-parity test.
- Supabase local setup, empty migration, one health-check function.
- GitHub Actions: `deploy-web.yml`, `deploy-backend.yml`.

**Flow:** none yet, only deploy flow (push → live).

**UI:** app shell, header with language switcher, empty home page.

**Done when**
- Pushing to `main` publishes the site to Pages under `/<repo>/`.
- Backend workflow deploys the health-check function.
- Switching language updates the shell text.

---

## Iteration 1: Create party and participants

**Flow**
1. Home → enter access code → "Create party".
2. Fill party form: name, date, time (Romanian time), location name, optional budget (currency shown from party language: RON/USD), party language (default English).
3. Add participants: name, email, optional gender. The organizer's own entry is first and marked "you".
4. Review summary → save (still `draft`, nothing emailed).
5. Organizer receives the `admin_link` email and lands on the manage page.
6. Reopen later via the emailed link (and remembered link in the browser).

**UI**
- Home (create CTA, access-code gate)
- Create party form
- Participants editor (add/edit/remove, duplicate-email errors, min-3 hint)
- Manage page (summary, participant list, status "not started")

**Done when**
- Validation: required fields, valid emails, unique emails, ≥3 participants before start is allowed (not enforced at save).
- Data persists in Supabase; tokens stored hashed; wrong access code rejected; max 15 participants enforced.
- All screens in ro and en.

---

## Iteration 2: Draw and invite emails

**Flow**
1. Manage page → matching option: mixed (default) or same-gender (girl-girl / boy-boy).
2. Pre-flight validation (min 3, gender set when same-gender, group sizes).
3. "Start party" → confirmation dialog → server draws, stores, sends invites to everyone including the organizer.
4. Manage page now shows per-person status (invited / opened), never matches.

**UI**
- Matching options panel with inline validation errors
- Start confirmation dialog
- Post-start manage page (status list, participants locked)
- Invite email (HTML + text, ro + en)

**Done when**
- Draw passes the unit tests (no self-match, valid permutation, same-gender rules).
- Invites delivered via Brevo (test with real inbox, check spam placement).
- Re-clicking "Start" doesn't double-send (idempotent).

---

## Iteration 3: Reveal page and redo draw

**Flow**
1. Participant opens email link → reveal page → "tap to reveal" → sees giftee name, party details, budget, participant names.
2. Page can be revisited later.
3. Organizer chooses **Redo draw** → warning dialog → new draw → `redo` email to everyone.
4. Participant reopens same link and sees the new match with a "draw was remade" banner.

**UI**
- Reveal page (mobile-first), reveal interaction
- Banner for remade draw
- Redo dialog on manage page
- Redo email (ro + en)

**Done when**
- Reveal API returns only the token owner's match.
- Organizer token can't fetch any match (negative test).
- After redo, old matches are gone and `revealed_at` resets.

---

## Iteration 4: Themes

**Flow**
1. Manage page → Themes: default list shown, toggle on/off, add custom.
2. Counter shows enabled themes vs participants. Draw is blocked if too few.
3. On draw, each participant is dealt a unique random theme, shown on the reveal page and in the invite/redo emails.

**UI**
- Theme editor (chips, add input, counter, too-few state)
- Theme display on reveal page and emails

**Done when**
- Themes unique per participant in every draw (tested).
- Custom themes persist and appear in both languages' views.

> Note: the draw in iteration 2 can ship with themes disabled or a fixed pool. This iteration makes the pool editable.

---

## Iteration 5: Reminders

**Flow**
1. Manage page → Reminders: pick a preset (countdown, budget, your match, last call, theme nudge) or write a custom message.
2. Send now → confirmation → each participant gets their own email.
3. Toggle scheduled presets (7 days, 2 days, day before). `pg_cron` sends them automatically.
4. Reminder history list (kind, time, count).

**UI**
- Reminders panel and presets
- Custom message composer with preview
- Schedule toggles and history

**Done when**
- Scheduled sends fire once (idempotent) and respect the latest `draw_version`.
- Manual and scheduled use the same templates.
- Organizer UI never shows content containing matches.
- No reminder (scheduled or manual) can be sent after the event date.

---

## Iteration 6: Hardening and polish

**Scope**
- Rate limiting, participant/party caps, input sanitising in emails (HTML escaping).
- Retention job (delete 30 days after event).
- Brevo error handling and per-recipient send status; retry for failed sends.
- "Resend my link" flows (admin + participant).
- Accessibility pass (keyboard, contrast, screen-reader labels), empty/error states, 404 route.
- Tests: Vitest for draw/templates/validation, Playwright for the main flows (create → draw → reveal → redo).
- README setup guide (Supabase project, Brevo sender, secrets, Pages enablement).

**Done when**
- A full dry run with real emails across ro and en works end to end.
- README lets a fresh clone deploy from scratch.
