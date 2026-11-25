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

## Iteration 2: Draw, themes, invite emails and a minimal reveal page

**Flow**
1. Manage page → **Matching**: mixed (default) or same-gender (girl-girl / boy-boy).
2. Manage page → **Gift themes**: the organizer toggles which themes from the predefined list (about 30, en/ro labels) go into the pool. Everything is selected by default, with Select all / Select none and a counter ("12 selected, need at least 4").
3. Pre-flight checks. If anything blocks the start, a single **amber warning** (not a red error) appears just above the Start button, listing the reasons, and the button is disabled. Reasons: fewer than 3 participants; same-gender mode with missing genders or a group of 1 (e.g. "3 girls, 1 boy: the boy can't be matched. Add another boy or switch to mixed."); fewer selected themes than participants. A group of exactly 2 is allowed.
4. **Start party** → confirmation dialog → the server draws matches, deals themes, creates a private reveal link per person and emails everyone (organizer included).
5. Manage page flips to "Draw done" with per-person invite status (sent / failed + **Resend**) and opened status. Participants are locked. The organizer never sees a match or a theme.
6. Each participant opens their link and sees the party details, the participant names, **who they buy for and their gift theme**.

**Theme dealing**
- The pool is the organizer's selection. The server shuffles it (cryptographic Fisher–Yates), takes exactly as many themes as there are participants (the organizer counts), and deals one to each participant. Themes are unique within a party.
- Independent from the giver→giftee shuffle. The theme is the style of the gift the *giver* buys.
- Stored as theme ids; labels are rendered in the party language (emails) or UI language (reveal page).

**UI**
- Matching panel, theme selector (chips) with counter
- Amber pre-flight warning above the Start button
- Start confirmation dialog
- Post-start manage page: invite status, Resend, opened flag
- Minimal reveal page: party details, names, giftee, theme
- Invite email (ro + en): details, who's coming, reveal link, privacy note. The match is **not** written in the email, only behind the link.

**Behaviour**
- Start is atomic and idempotent: a SQL function moves draft → drawn once and stores only reveal-token hashes.
- If an invite fails, that person's `invited_at` stays empty. **Resend** creates a new link for that person and invalidates the old one.
- The `manage-party` endpoint never returns match or theme fields. A new `reveal` function returns only the token owner's data.

**Done when**
- Draw tests pass: no self-match, valid single cycle for n = 3..15, same-gender groups, group of 1 is an error, group of 2 allowed, 10 000 random runs.
- Theme tests pass: unique per party, exactly n dealt, error when the pool is too small.
- Negative tests: wrong token reveals nothing; the manage response contains no match fields.
- Real invites delivered via Brevo (check spam placement); double-click on Start doesn't double-send.

---

## Iteration 3: Reveal polish and redo draw

**Flow**
1. Reveal page gains the tap-to-reveal interaction and mobile-first polish. After the first tap the match is remembered on that device for the current draw version, so revisiting the link shows it directly (a redo hides it again). The "opened" flag the organizer sees is still set when the page loads.
2. Organizer chooses **Redo draw** (any time before the event date) → the Matching and Themes panels stay editable and apply to the redo → warning dialog → new matches and themes → `redo` email to everyone.
3. The redo email tells people to disregard the old match and to open the link from their original invite (links are not rotated, since only hashes are stored). Failed sends show **Resend**, which rotates that person's link and emails the new one.
4. Participant reopens the same link, sees the new result with a "draw was remade" banner.

**UI**
- Tap-to-reveal animation, banner for remade draw
- Redo dialog on the manage page
- Redo email (ro + en)

**Done when**
- After redo, old matches are gone and `revealed_at` resets.
- Organizer token still can't fetch any match.

---

## Iteration 4: Custom themes and theme polish

**Scope**
- The predefined list and selection ship in Iteration 2. This iteration adds **custom themes**: the organizer types a label (max 40 characters, up to 20 per party), stored per party in `parties.custom_themes` as `{id, label}`. One label, shown as-is in both languages. A new custom theme joins the pool already selected.
- A search box filters the chip list. Reordering was dropped as unnecessary.
- Removing a custom theme is blocked (`theme_in_use`) while it is dealt to someone, until the next redo.
- Theme nudge reminder copy moves to Iteration 7 (reminders), where it is used.

**Done when**
- Custom themes persist, take part in the unique dealing, and appear in both languages' views (reveal page returns the custom label).
- Duplicate labels (against built-ins in either language and other custom themes) are rejected.

---

## Iteration 5: Matching exclusions

**Scope**
- Optional, directional exclusions: "**A can't buy for B**". They only block A→B; B→A stays allowed unless it is added as its own rule. No exclusions is the default and behaves exactly as before.
- Exclusions apply **on top of** the matching mode (mixed / same-gender): both constrain the draw.

**Flow**
1. Manage page → **Exclusions** panel (optional, collapsed when empty). Add a rule by picking a giver and a person they can't buy for; remove a rule with one tap. Rules are listed as "A can't buy for B".
2. The panel is editable at any time before the party starts. It stays editable after the start so the organizer can adjust it before a **Redo draw**; participants themselves stay locked.
3. Pre-flight checks gain a new **amber warning** reason (same pattern as iteration 2, above the Start / Redo button, which is disabled): the exclusions leave no valid single cycle for the current participants and matching mode. The message names the most restrictive cause when it can (e.g. "Ana can't buy for anyone: she is excluded from everyone else").
4. **Start party** and **Redo draw** (iteration 3) only produce matches that respect every exclusion.
5. Removing a participant also removes the rules that mention them.

**UI**
- Exclusions panel (giver and giftee pickers, rule list with remove)
- Amber warning for infeasible exclusions
- Inline note that exclusions never reveal matches (they are organizer input, not results)
- All copy in ro and en

**Behaviour**
- Stored in `party_exclusions` as `(party_id, giver_id, giftee_id)` pairs; editing the party in draft keeps rules by participant email (a removed or re-emailed participant loses theirs); a participant can't exclude themselves, and duplicates are rejected.
- The draw stays a single cycle. Feasibility means a Hamiltonian cycle exists in the allowed graph (mode rules minus exclusions). With at most 15 participants a bitmask DP over Hamiltonian cycles is exact and instant; the same table backs the pre-flight warning and a uniformly random cycle pick.
- The draw picks a random valid cycle (not the first one found), so exclusions don't bias the result.
- Exclusions are validated server-side: only while the party is `draft` or `drawn`, and only for participants of that party.
- The `manage-party` endpoint may return exclusions (organizer input) but still never returns match or theme fields.

**Done when**
- Draw tests pass with exclusions: no excluded pair ever appears for n = 3..15, 10 000 random runs, combined with same-gender mode.
- Infeasible sets are detected (e.g. someone excluded from everyone else; a set that leaves no single cycle) and block Start and Redo with the amber warning; a feasible set never produces a false block.
- Redo respects exclusions edited after the start; a participant removal drops their rules.
- Draws with no exclusions behave exactly as in iterations 2 and 3.

---

## Iteration 6: Import participants from a file

**Scope**
- Import participants from a simple `.csv`, `.xlsx` or `.xls` file into the participants editor.
- Parsed **in the browser**: the file never leaves the device. The existing save flow and server validation are reused, so there is **no new backend function**.
- Available in the editor while the party is a draft (create form and manage page), the same window in which participants are editable.

**File format**
- One header row, columns `name`, `email`, `gender` (header names case-insensitive, trimmed; extra columns ignored). Only the first sheet of a workbook is read.
- `gender` is optional: `B` = boy, `G` = girl, case-insensitive, empty allowed. Any other value is flagged.
- CSV: UTF-8 (with or without BOM) and both `,` and `;` delimiters (Romanian Excel exports `;`). Fully empty rows are ignored.
- A downloadable template file (name, email, gender) sits next to the import button.

**Flow**
1. In the participants editor → **Import from file** → pick a file (or drag and drop).
2. **Preview** dialog: how many rows were read, how many look valid, and a table with row numbers and per-row problems (invalid email, duplicate email within the file or against the editor, bad gender value, missing name).
3. **Add to list** appends the rows after the existing entries. The organizer's own entry stays first. Nothing is saved yet; the organizer reviews in the editor and uses the normal save.
4. Problem rows are added too, with the **inline error markers** the editor already has, so the organizer fixes them in place instead of editing the file and re-importing.
5. Rows that would exceed the 15-participant cap are not added; the dialog says how many were left out.

**UI**
- Import button, template link, drag-and-drop zone
- Preview dialog with the row-level problem table
- Inline error markers on imported rows (reuses the editor's duplicate-email and required-field errors)
- All copy in ro and en

**Behaviour**
- Dedicated parsing module in `web/src/lib/` with a pure function `parseParticipantsFile(rows)`, so Vitest can test it without a browser. The xlsx parsing library (e.g. SheetJS) is loaded lazily, only when the dialog opens, to keep the main bundle small.
- File size cap (a few hundred KB) and a row cap; parsing failures show a friendly error ("could not read this file").
- Email normalisation (trim, lowercase) matches the editor, and the same shared validators from `_shared` are used.
- Rows are imported as plain text only. Spreadsheet formulas are never evaluated, and cell values starting with `=`, `+`, `-` or `@` are kept as text.
- If same-gender matching is on and gender is missing, the usual pre-flight warning still applies at start; import does not enforce it.

**Done when**
- Parser tests pass: header variants, `B`/`G`/`b`/`g`/empty, unknown gender, `;` and `,` CSV, BOM, empty rows, duplicate emails (in file and against existing), more than 15 rows, wrong columns.
- A `.csv`, `.xlsx` and `.xls` sample each import to the same preview.
- Imported rows keep the organizer first and respect the cap; nothing persists until save.
- Server-side validation still rejects bad data if the browser is bypassed.

---

## Iteration 7: Reminders

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

## Iteration 8: Hardening and polish

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
