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
| `reminder_countdown` | Everyone | Manual | Days left until {party}, date/place, a warm nudge |
| `reminder_theme` | Everyone | Manual | Your gift theme + days left, encouragement to have fun with it |
| `reminder_match` | Everyone | Manual | Who you're gifting, their theme, days left, "start thinking about the present" |
| `reminder_custom` | Everyone | Manual | Organizer's free text, with the party details footer |
| `email_fixed` | Participant | Email corrected after draw | New reveal link |

Subject line examples (EN / RO, draft for your proofreading):

- invite: "You're invited to {party}! Your Secret Santa match inside" / "Ești invitat(ă) la {party}! Află pe cine ai tras"
- redo: "⚠️ The draw was remade. Please check your new match" / "⚠️ Extragerea a fost refăcută. Verifică noua ta potrivire"
- countdown: "Countdown to {party} 🎄" / "Numărătoarea inversă pentru {party} 🎄"
- theme: "Your gift theme is {theme} ✨" / "Tema cadoului tău este {theme} ✨"
- match: "Your Secret Santa is waiting for a gift 🎁" / "Cineva special așteaptă cadoul tău 🎁"

Gendered Romanian wording uses **parentheses**: "invitat(ă)", "pregătit(ă)", "gata(ă)" style. Where a neutral rephrase is just as natural, prefer it. All such forms are listed in `ro.json` / the templates for proofreading.

## 3.4 Reminder templates

Manual only: three presets plus a custom message. More presets can be added later, so templates live in a simple registry (one entry per kind) rather than hard-coded branches. All are sent per participant, in the party language. **Tone:** warm, optimistic, encouraging. Never urgent, never guilt-tripping, no "last chance" or "act now" wording, no all-caps, no alarm emojis (nothing like a scam email). Days left is computed at send time from `event_at`.

1. **Countdown:** "Days left until {party}: {n}. There's still plenty of time to find something lovely. We're looking forward to seeing you on {date} at {location}."
2. **Theme:** "Your gift theme is **{theme}**. There's no wrong answer here, so have fun with it and follow your imagination. Days left: {n}."
3. **Your match:** "You're picking a gift for **{name}**. Theme: **{theme}**. A thoughtful little something goes a long way. Days left: {n}."

The day count is always shown as a plain number in a fixed phrase ("Days left: {n}" / "Zile rămase: {n}") so there are no singular/plural or today/tomorrow variants to get wrong.

4. **Custom:** the organizer's own text, e.g. "I'll bring the hot chocolate, you bring the gifts." It is escaped, wrapped in the same party footer (date, place, days left), and sent to everyone. Keep the same tone guidance in the composer's helper text.

**No reminders after the event date:** the manual send is blocked once `event_at` has passed (the button is disabled with an explanation).

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
