# 2. Domain model and draw logic

## 2.1 Data model (draft)

### `parties`
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| name | text | required |
| event_at | timestamptz | date + time, entered and displayed as `Europe/Bucharest` |
| location_name | text | name only, no address/map |
| budget_amount | numeric, null | optional. Currency is derived from `locale` (ro → RON, en → USD), not stored |
| locale | text | `ro` or `en`, language for emails; default `en` |
| same_gender_mode | boolean | girl-girl / boy-boy matching |
| admin_token_hash | text | SHA-256 |
| status | enum | `draft` → `drawn` |
| draw_version | int | 0 before draw, +1 on each (re)draw |
| drawn_at | timestamptz, null | |
| created_at | timestamptz | |

### `participants`
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| party_id | uuid | FK |
| name | text | |
| email | text | unique per party |
| gender | enum null | `girl`, `boy`, null. Required only if `same_gender_mode` |
| is_organizer | boolean | exactly one per party |
| reveal_token_hash | text | SHA-256 |
| giftee_id | uuid, null | who they buy for (participant id). **Never exposed to organizer** |
| theme | text, null | theme of the gift they give |
| invited_at | timestamptz, null | |
| revealed_at | timestamptz, null | when they opened their reveal page for the current draw. Only this "opened" flag is shown to the organizer, never the match |

### `themes`
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| party_id | uuid | FK |
| label_ro / label_en | text | custom themes can be single-language (see doc 3) |
| is_default | boolean | seeded from the generic list |
| enabled | boolean | |

### `reminders_log`
| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| party_id | uuid | |
| kind | text | `countdown`, `budget`, `your_match`, `last_call`, `custom` |
| scheduled_for | timestamptz, null | null = manual |
| sent_at | timestamptz | |
| draw_version | int | |

RLS: all tables deny direct access from anon. Edge Functions use the service role and enforce token checks.

## 2.2 Draw algorithm

Goal: every participant gives to exactly one person and receives from exactly one, and nobody draws themselves.

**Mixed mode (default):** use **Sattolo's algorithm** on the shuffled participant list to get a single cycle (A→B→C→…→A).
- Guarantees no self-match.
- Guarantees no mutual pairs (A↔B) when there are 3+ people.
- Trade-off: it only produces cyclic permutations, not every possible derangement. For a party game this is fine and arguably nicer.
- Minimum participants: 3 (with 2 people it would be a mutual swap, which is rejected).

**Same-gender mode (girl-girl, boy-boy):**
- Partition participants by gender, run the cycle algorithm inside each group.
- Validation before the draw (shown in the UI as a clear error):
  - Every participant has a gender set.
  - Each group has at least **2** people. A group of exactly 2 is a forced mutual swap (A gives to B, B gives to A). This is **allowed**, with no warning needed.
  - Example error: "3 girls, 1 boy: the boy can't be matched. Add another boy or switch to mixed mode."

**Randomness:** use `crypto.getRandomValues` (Fisher–Yates with rejection sampling), not `Math.random`.

**Pure function signature (sketch):**
```ts
drawAssignments(
  participants: { id: string; gender?: 'girl' | 'boy' }[],
  opts: { sameGender: boolean }
): Map<giverId, gifteeId>   // throws DrawError with a typed reason
```

Test cases: n = 3..30, same-gender with uneven groups, group of 1 (error), group of 2, all-unspecified gender with same-gender on (error), 10 000 random runs asserting a valid permutation and no fixed points.

## 2.3 Themes

- A **theme** is a hint for the gift the **giver** buys (e.g. "cozy", "kitchen"). Each participant gets one.
- Themes are dealt randomly and **uniquely**: the enabled pool must contain at least as many themes as participants. If it doesn't, the UI shows a counter and blocks the draw until themes are added or the pool is enlarged.
- If the pool is larger than the party, a random subset is used.
- The generic default list is seeded per party (see doc 3 for the list) and is editable: disable defaults, add custom themes.
- Themes are independent from the giver/giftee mapping (a separate shuffle).

## 2.4 Redo draw

- Allowed any time after the first draw (and until the event date).
- Organizer confirms: "This replaces all matches and themes, and emails everyone."
- Server steps (one transaction): bump `draw_version`, recompute `giftee_id` and `theme` for all participants, clear `revealed_at`, then send the **redo** email to everyone.
- Same reveal links keep working. The reveal page shows a **"This draw was remade"** banner for the new version.
- Redo email leads with the emphasis (see doc 3) and tells people to disregard the previous match.
- Reminders after a redo use the latest `draw_version`. Any not-yet-sent scheduled reminders are unaffected.
- Organizer only sees status (`invited`, `opened`), never matches or themes.

## 2.5 Participant editing rules

- Before the first draw: add/edit/remove participants freely.
- After the draw: participants are locked. To change anyone, the organizer must do a **redo draw**, so everyone's match stays consistent.
- Email changes after the draw: allowed as an explicit "fix email and resend my link" action that doesn't change the draw (typo recovery).
