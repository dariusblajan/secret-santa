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

### `exclusions`
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| party_id | uuid | FK |
| giver_id | uuid | FK participants. This person **can't buy for** `giftee_id` |
| giftee_id | uuid | FK participants |

Directional: a row blocks only giver→giftee. Unique on `(party_id, giver_id, giftee_id)`, check `giver_id <> giftee_id`, both participants must belong to the party, rows cascade-delete with either participant. Optional: most parties have none.

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

**Exclusions (optional, directional):**
- Each exclusion forbids one edge: giver→giftee. They combine with the mode rules, so the set of allowed edges is: *edges the mode allows* minus *excluded edges*.
- With exclusions present, plain Sattolo is no longer enough, because a shuffled cycle can use a forbidden edge. The draw becomes: find a **random Hamiltonian cycle** in the allowed graph (a single cycle through everyone in each group, or the whole party in mixed mode).
  - Implementation: shuffle the participants and the neighbour order with the crypto RNG, then a backtracking search builds the cycle and backs out of dead ends. With n ≤ 15 this is instant.
  - With **no exclusions** the algorithm keeps using plain Sattolo, so behaviour is identical to before.
  - A fast path first rejects the obvious cases (a participant with no allowed giftee, or no allowed giver).
- **Feasibility check** uses the same search (existence only) and backs the pre-flight warning. It is a pure function, so the UI and the server run the same logic.
- Same-gender mode: exclusions only matter inside a gender group. A group of 2 with an exclusion between them is infeasible (the forced swap would be blocked), reported like any other infeasible case.
- Rules are not required to be symmetric: "A can't buy for B" says nothing about B→A.
- Errors are typed so the UI can name the cause, e.g. `no_allowed_giftee` (participant, who is excluded from everyone else), `no_valid_cycle`.

**Randomness:** use `crypto.getRandomValues` (Fisher–Yates with rejection sampling), not `Math.random`.

**Pure function signature (sketch):**
```ts
drawAssignments(
  participants: { id: string; gender?: 'girl' | 'boy' }[],
  opts: { sameGender: boolean; exclusions?: { giverId: string; gifteeId: string }[] }
): Map<giverId, gifteeId>   // throws DrawError with a typed reason

checkDrawFeasible(participants, opts): { ok: true } | { ok: false; reason: DrawErrorReason; participantId?: string }
```

Test cases: n = 3..30, same-gender with uneven groups, group of 1 (error), group of 2, all-unspecified gender with same-gender on (error), 10 000 random runs asserting a valid permutation and no fixed points. With exclusions: no excluded edge ever drawn, someone excluded from everyone (error), a set with no single cycle (error), a group of 2 blocked by an exclusion (error), exclusions combined with same-gender, and no-exclusion runs matching the previous behaviour.

## 2.3 Themes

- A **theme** is a hint for the gift the **giver** buys (e.g. "cozy", "kitchen"). Each participant gets one.
- Themes are dealt randomly and **uniquely**: the enabled pool must contain at least as many themes as participants. If it doesn't, the UI shows a counter and blocks the draw until themes are added or the pool is enlarged.
- If the pool is larger than the party, a random subset is used.
- The generic default list is seeded per party (see doc 3 for the list) and is editable: disable defaults, add custom themes.
- Themes are independent from the giver/giftee mapping (a separate shuffle).

## 2.4 Redo draw

- Allowed any time after the first draw (and until the event date).
- Organizer confirms: "This replaces all matches and themes, and emails everyone."
- The organizer may edit **exclusions** before a redo; the new draw honours the exclusions as they are at that moment. If they make the draw infeasible, Redo is disabled with the amber warning. Previous matches are not special: an old A→B pair may be drawn again unless excluded.
- Server steps (one transaction): bump `draw_version`, recompute `giftee_id` and `theme` for all participants, clear `revealed_at`, then send the **redo** email to everyone.
- Same reveal links keep working. The reveal page shows a **"This draw was remade"** banner for the new version.
- Redo email leads with the emphasis (see doc 3) and tells people to disregard the previous match.
- Reminders after a redo use the latest `draw_version`. Any not-yet-sent scheduled reminders are unaffected.
- Organizer only sees status (`invited`, `opened`), never matches or themes.

## 2.5 Participant editing rules

- Before the first draw: add/edit/remove participants freely. Participants can also be added in bulk with a file import (see 2.6). Removing a participant removes the exclusions that mention them.
- Exclusions are editable in both stages (before the first draw and before a redo).
- After the draw: participants are locked. To change anyone, the organizer must do a **redo draw**, so everyone's match stays consistent.
- Email changes after the draw: allowed as an explicit "fix email and resend my link" action that doesn't change the draw (typo recovery).

## 2.6 Participants file import

- Input: `.csv` with a header row and columns `name`, `email`, `gender`. `gender` is optional: `B` → `boy`, `G` → `girl`, case-insensitive, empty → null.
- Parsed entirely in the browser by a pure `parseParticipantsFile` function in `web/src/lib/`. It returns normalised rows plus per-row problems (missing name, invalid email, duplicate email in the file or against the editor, bad gender value). The backend has no import endpoint.
- Rows are appended to the editor state after a preview, organizer first, capped at 15 total; problem rows are added with inline error markers. Nothing is stored until the normal save, which validates again on the server.
- Cell contents are treated as text only (no formula evaluation).
