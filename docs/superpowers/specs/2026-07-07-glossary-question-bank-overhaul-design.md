# Glossary Question Bank Overhaul — Design

**Date:** 2026-07-07
**Status:** Approved, ready for implementation planning
**Branch:** `feat/glossary-question-bank-overhaul`

## Goal

Replace the current Excel-derived question bank with a clean, structured bank built
from the SLB glossary CSVs (`slb_glossary_by_topic/`), remap topic ownership to the
four delegates, and introduce **multi-owner** questions and topics with a weighted
buzzer scoring rule.

This is a full **content reset** (new questions) plus a **remap** (new
topic→delegate assignments), while **preserving past session records**.

## Source data

`slb_glossary_by_topic/` contains 21 per-discipline CSVs (plus an unused
`_all_terms_master.csv`). Each CSV has columns: `term, definition, disciplines, url`.

- The 21 topic CSVs together hold ~5,800 rows but only ~4,587 unique terms — ~1,200
  terms appear in multiple CSVs (shared disciplines) with identical definition text.
- The 21 topic CSVs are committed into the repo at `data/slb_glossary/` for
  reproducible import. `_all_terms_master.csv` is **not** imported.

The 21 topics: `digital, drilling, drilling_fluids, enhanced_oil_recovery,
formation_evaluation, general_terms, geochemistry, geology, geophysics, heavy_oil,
oil_and_gas_business, perforating, production, production_facilities,
production_logging, production_testing, reservoir_characterization, shale_gas,
well_completions, well_testing, well_workover_and_intervention`.

The current non-glossary topics (`Machine Learning (GPT)`, `Renewables (GPT)`,
`Renewables (IEA + EIA)`, `The Prize`) are **retired** (see Reset section).

## Ownership model

Two independent forms of multi-ownership feed a single derivation:

1. **Term multi-home (Approach B).** A term physically appears as one `questions` row
   per topic CSV it belongs to. That row-level duplication *is* the multi-home; drill
   stays topic-scoped and unchanged. A new normalized `term_key` column links the
   duplicates so the buzzer can regroup them.
2. **Topic co-ownership.** A single topic may have more than one active owner.
   `well_workover_and_intervention` is co-owned by **Maulidan and Anggitya**.

For a buzzer question, the **owner set** = the union of owners across every topic that
contains the term (intersected with the session participants). This unifies both
forms: a term in a co-owned topic yields ≥2 owners directly; a term shared across two
singly-owned topics yields ≥2 owners via the union.

### Assignment map (all 21 topics covered)

| Delegate | Role | Topics |
|---|---|---|
| **Maulidan** | admin | shale_gas, reservoir_characterization, digital, geochemistry, general_terms, well_completions, well_workover_and_intervention ⚭ |
| **Anggitya** | player | production_facilities, production_logging, heavy_oil, production, perforating, production_testing, well_workover_and_intervention ⚭ |
| **Steven** | player | well_testing, formation_evaluation, drilling_fluids, enhanced_oil_recovery |
| **Jak** | player | geology, geophysics, drilling, oil_and_gas_business |

⚭ = co-owned. Both Maulidan and Anggitya drill `well_workover_and_intervention` and
its terms score under the two-owner rule.

## Question content

- Each CSV row → one `questions` row:
  - `question` = `definition` (given the definition, name the term — the PetroBowl
    direction, matching the existing glossary-sheet convention)
  - `answer` = `term`
  - `metadata` = `{ disciplines, url }`
  - `term_key` = normalized term (lowercased, trimmed, collapsed whitespace)
  - `display_order` = row order within the CSV
- `topics.source` = `'SLB Glossary'`.

## Schema changes (one new migration)

1. `topics`: add `retired_at timestamptz` (null = active). Drop `unique(team_id, name)`;
   add a **partial unique index** on `(team_id, name) where retired_at is null` so an
   active topic can coexist with a retired one of the same name.
2. `topic_assignments`: drop the `topic_assignments_one_active` partial unique index
   (one active owner per topic). Add a partial unique on
   `(topic_id, player_id) where unassigned_at is null` (allows several owners per
   topic, blocks assigning the same player to a topic twice).
3. `questions`: add `term_key text` + index on `(topic_id, term_key)` and `term_key`.
4. `session_questions`: add `owners uuid[] not null default '{}'::uuid[]`.
   `assigned_to` is retained for back-compat/display and set to `owners[1]` on new
   rows; scoring reads `owners`.
5. Rewrite the `session_scores` view for owner arrays + weighted penalty + back-compat
   fallback (below).

## Buzzer session generation

Current flow (`buildSessionQuestionPool` in `src/lib/session-pool.ts` +
`src/app/api/session/start/route.ts`) builds a pool from participants' assigned topics
and assigns each question a single owner. Changes:

- `ownerByTopicId: Map<string,string>` → `ownersByTopicId: Map<string,string[]>`
  (a topic can have several active owners).
- After the eligible pool is built, **group candidate questions by `term_key`**. Each
  group becomes exactly one `session_question`:
  - representative `question_id` (any row in the group — they share definition/term)
  - `owners` = distinct union of owners across the group's topics, intersected with
    session participants
  - `assigned_to` = `owners[0]` (or null if empty), for display/back-compat
  - `balanceGroup` = a single primary owner (e.g. `owners[0]`) so the existing
    even-distribution logic still works
- This prevents a shared term from being presented twice and yields the owner set the
  scoring needs.

## Scoring rule (the weighted penalty)

For a session question with owner set **O** (k = |O|, all ⊆ participants), buzzer **b**,
correctness **c**, and `missed_by` order list, per player **p**:

- `ownQ(p) += 1` if `p ∈ O`; else `otherQ(p) += 1`
- `onTopic(p) += 1` if `p ∈ O ∧ b = p ∧ c`
- `outOfTopic(p) += 1` if `p ∉ O ∧ b = p ∧ c`
- **missed weight** `w(p)` accrued when `p ∈ O` and p did not win it (`¬(b=p ∧ c)`):
  - `b = p ∧ ¬c` → **1** (buzzed own topic, got it wrong)
  - `c ∧ b ∈ O ∧ b ≠ p` → **1** (a co-owner took it; normal penalty to other owners)
  - `c ∧ b ∉ O` → **1/k** (outsider stole; blame split across co-owners)
  - `¬c` (nobody correct) → **1/k** (shared blame) — *chosen default; alternative was 1*
- `wrongBuzzes(p) += 1` if `missed_by[0] = p ∧ p ∉ O` (first failed steal by a non-owner)
- `defense = ownQ = 0 ? 0 : (onTopic − 0.5·Σw)/ownQ · 100`
- `offense = otherQ = 0 ? 0 : (2·outOfTopic − wrongBuzzes)/otherQ · 100`
- `total = 0.7·defense + 0.3·offense`

**Reduces to today's formula when k = 1** (1/k = 1, and O = {assigned_to}), so
single-owner questions and past sessions score identically.

### Back-compat fallback

Old `session_questions` rows have `owners = '{}'`. Everywhere ownership is read
(the `session_scores` view and `calculateSessionScores`), use:

```
effectiveOwners = array_length(owners) > 0 ? owners : (assigned_to is null ? [] : [assigned_to])
```

So past sessions keep their exact scores; only new sessions use owner sets.

## Data reset — "wipe content, keep sessions"

- **Retire, don't delete** (old questions are referenced by past `session_questions`
  via `ON DELETE RESTRICT`, and several new topic names collide with old ones):
  - set `retired_at = now()` on all existing topics
  - set `unassigned_at = now()` on all existing active `topic_assignments`
- **Clear** all `card_progress` and `drill_responses` rows (fresh SRS on the new bank).
- **Keep** `sessions`, `session_questions`, `session_participants`, `session_topics`
  intact. Retired topics/questions are excluded from active drill/session-setup by the
  `retired_at is null` filter but still resolve for past-session drill-downs.
- **Seed:** create the 21 glossary topics (new rows), bulk-insert questions with
  `term_key`, and insert `topic_assignments` per the map (two rows for
  `well_workover_and_intervention`).

## Components to change

1. **New migration** `0005_glossary_overhaul.sql` — schema changes (topics.retired_at +
   partial unique, topic_assignments index swap, questions.term_key,
   session_questions.owners) and the rewritten `session_scores` view.
2. **`data/slb_glossary/*.csv`** — 21 committed topic CSVs.
3. **`src/lib/import/glossary-csv.ts`** (new) — parse a topic CSV into
   `{ name, questions[] }` with `term_key`; a `ParsedGlossaryBank` aggregate.
4. **Import/seed entry point** — a script or admin route that runs the retire →
   clear → seed sequence idempotently (service-role Supabase client).
5. **`src/lib/constants.ts`** — `SEED_PLAYERS` topic lists updated; `TOPIC_ASSIGNMENTS`
   becomes `Record<string, string[]>` (topic → owner names).
6. **`src/lib/session-pool.ts`** — `ownersByTopicId`, `term_key` grouping, `owners`
   derivation, `balanceGroup` primary-owner selection. Types updated.
7. **`src/app/api/session/start/route.ts`** — persist `owners[]` (+ `assigned_to =
   owners[0]`) on `session_questions`.
8. **`src/lib/scoring.ts`** — `ScoredSessionQuestion.owners: string[]`; owner-set
   weighted formula. Update `scoring.test.ts` (+ any coach/analytics parity tests).
9. **`src/lib/session-server.ts`** + **`src/types/session.ts`** — select and carry
   `owners`; expose `owners`/`ownerNames`; `loadSessionSetupData` topic owner becomes
   a list (`ownerIds`/`ownerNames`); filter active topics by `retired_at is null`.
10. **Drill queries** (`src/app/api/drill/queue/route.ts` and related) — ensure topic
    lists filter `retired_at is null`; co-owned topics appear for each owner.
11. **UI** — `session-console.tsx` / `session-runner.tsx` / player/topic tables show
    multiple owner names per question/topic.

## Testing

- Unit: `scoring.ts` weighted formula — cover k=1 (parity with current), k=2 co-owner
  win, k=2 outsider steal (1/k), k=2 unanswered (1/k), wrong-buzz non-owner.
- Unit: `session-pool.ts` — term_key grouping collapses duplicates; owner union across
  topics; participant intersection; single-owner passthrough.
- Unit: `glossary-csv.ts` — parsing, term_key normalization, metadata capture.
- Migration parity: the `session_scores` view and `calculateSessionScores` must agree
  on the same fixtures (extend existing parity tests).
- Seed idempotency: running the seed twice retires once and does not duplicate topics
  or assignments.

## Out of scope

- No fuzzy term matching — `term_key` grouping relies on exact normalized text, which
  is safe because duplicates originate from identical source rows.
- No change to the SRS algorithm, the drill rating flow, or buzzer UI mechanics beyond
  showing multiple owners.
- `_all_terms_master.csv` is not used.

## Open decisions (resolved)

- **Unanswered-question penalty:** `1/k` (shared blame), consistent with the "stolen"
  case. Alternative (full `1` each) rejected for double-penalizing shared terms.
- **Load balance:** `well_completions` stays sole-Maulidan;
  `well_workover_and_intervention` is co-owned by Maulidan + Anggitya.
