# 3. Internationalisation and emails

Languages: **Romanian (ro)** and **English (en)** for both UI and emails.

## 3.1 UI i18n

- `react-i18next`, files `web/src/i18n/ro.json` and `en.json`.
- Language switcher in the header, choice stored in `localStorage`, **default is English**; Romanian is opt-in via the switcher.
- Dates/times: `Intl.DateTimeFormat` with the active locale, always in the `Europe/Bucharest` timezone. Money: `Intl.NumberFormat` with the party currency.
- **Currency follows language:** Romanian party → **RON**, English party → **USD**. There is no currency picker. Rough rate used for placeholders/hints only: **$1 ≈ 5 RON** (no live conversion). Example placeholder: "100 RON" in Romanian, "$20" in English.
- **Plurals:** Romanian has 3 plural categories (`one`, `few`, `other`), e.g. "1 participant", "2 participanți", "20 de participanți". i18next uses `Intl.PluralRules`, but every plural key needs all forms in `ro.json`.
- Diacritics: ă â î ș ț (use the comma-below forms ș/ț, not cedilla ş/ţ). Files are UTF-8.
- No hard-coded strings in components. A lint check (or test) fails if `ro.json` and `en.json` have different key sets.
- **Proofreading:** all copy lives in the two JSON files and the email templates so it can be reviewed in one place.

## 3.2 Email language

- The organizer picks the **party language** at creation (stored in `parties.locale`). All emails for that party use it.
- Possible later addition: per-participant language override.
- Templates live in `supabase/functions/_shared/emails/{ro,en}/`. Each template is a function `(data, locale) → { subject, html, text }`. HTML and plain-text versions are both sent.
- Reveal/admin links are built from a `PUBLIC_APP_URL` secret.
- Date/time in emails are formatted in the party's locale, with a fixed timezone of `Europe/Bucharest` (not configurable). The party time entered by the organizer is interpreted as Romanian time.
- The party's currency (RON for `ro`, USD for `en`) is derived from `parties.locale`.

## 3.3 Email catalogue

| Key | To | Trigger | Key content |
|---|---|---|---|
| `admin_link` | Organizer | Party created / link re-send | Admin link, "keep this link private" |
| `invite` | Everyone (incl. organizer) | First draw | Party name, date/time, location, budget, participant names, reveal link, theme note |
| `redo` | Everyone | Redo draw | **Prominent**: "The draw has been remade, disregard your previous match." Points to the original invite link, which still works and shows the new result (no new link unless the person uses Resend) |
| `reminder_countdown` | Everyone | Manual / scheduled | "N days left until {party}" + date/place |
| `reminder_budget` | Everyone | Manual / scheduled | "Stay within the agreed budget: {budget}" |
| `reminder_match` | Everyone | Manual / scheduled | "You're getting a gift for {name}, theme {theme}" |
| `reminder_last_call` | Everyone | Manual / scheduled | "Party is tomorrow, wrap it up" |
| `reminder_custom` | Everyone | Manual | Organizer's free text (with party footer) |
| `email_fixed` | Participant | Email corrected after draw | New reveal link |

Subject line examples (EN / RO, draft for your proofreading):

- invite: "You're invited to {party}! Your Secret Santa match inside" / "Ești invitat(ă) la {party}! Află pe cine ai tras"
- redo: "⚠️ The draw was remade. Please check your new match" / "⚠️ Extragerea a fost refăcută. Verifică noua ta potrivire"
- countdown: "{n} days until {party}" / "Mai sunt {n} zile până la {party}"
- budget: "Reminder: keep within {budget}" / "Reminder: încadrează-te în bugetul de {budget}"
- match: "Don't forget who you're buying for 🎁" / "Nu uita pentru cine cumperi cadoul 🎁"

Gendered Romanian wording uses **parentheses**: "invitat(ă)", "pregătit(ă)", "gata(ă)" style. Where a neutral rephrase is just as natural, prefer it. All such forms are listed in `ro.json` / the templates for proofreading.

## 3.4 Reminder examples (body copy ideas)

1. **Countdown:** "Only {n} days until {party} on {date} at {location}."
2. **Budget:** "Friendly reminder: the agreed budget is {budget}. It's the thought that counts."
3. **Your match:** "You're getting a gift for **{name}**. Your theme: **{theme}**. Don't forget!"
4. **Last call:** "{party} is tomorrow. Time to wrap your gift."
5. **Custom:** organizer message, e.g. "I'll bring the hot chocolate, you bring the gifts."
6. **Theme nudge:** "Stuck on ideas? Your theme is **{theme}**. Anything cozy counts."

Scheduled presets the organizer can toggle: 7 days before, 2 days before, day before. Each is idempotent via `reminders_log`.

**No reminders after the event date:** both the scheduler and the manual send are blocked once `event_at` has passed (the manual button is disabled with an explanation).

Reminders containing a match/theme are sent individually. The organizer's view only shows "sent to N participants".

## 3.5 Default theme list

Stored with RO and EN labels. Pool must be ≥ number of participants, so ship ~30 defaults.

| EN | RO |
|---|---|
| cozy | confortabil / de casă |
| sports | sport |
| kitchen | bucătărie |
| spa | spa |
| books | cărți |
| tech gadget | gadget |
| plants | plante |
| board games | jocuri de societate |
| coffee & tea | cafea și ceai |
| stationery | papetărie |
| handmade / DIY | lucru manual |
| outdoors | aer liber |
| sweets & snacks | dulciuri și snacks-uri |
| music | muzică |
| funny / gag | amuzant |
| home décor | decor |
| travel | călătorii |
| self-care | grijă de sine |
| movie night | seară de film |
| something red | ceva roșu |
| candles & scents | lumânări și parfumuri |
| art & creativity | artă și creativitate |
| pets | animale de companie |
| wellness | wellness |
| photography | fotografie |
| beauty | frumusețe |
| fitness | fitness |
| gourmet food | delicatese |
| wine & drinks | vin și băuturi |
| winter | iarnă |

(Romanian labels are drafts for your review.)

Custom themes: the organizer types a label. If it's entered in one language, it's shown as-is in both (stored in both label fields).
