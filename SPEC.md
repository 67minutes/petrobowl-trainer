# PetroBowl Training System — Webapp Specification

## Overview

A webapp that replaces the SPE ITB Student Chapter's current Excel-based PetroBowl training workflow. The current system has two problems: (1) a fragile manual pipeline where a question bank spreadsheet is copy-pasted into a scoring spreadsheet each week, and (2) a training philosophy that skips straight to match-day buzzer rounds without structured individual drilling, leaving newer delegates unable to keep up with experienced ones.

This webapp solves both by implementing two distinct training modes: async solo drills with spaced repetition (where actual learning happens) and synchronous team buzzer sessions with scoring (where recall speed is tested under pressure). The buzzer sessions draw only from material players have already studied, so no one drowns in unfamiliar terms.

The two reference Excel files are in `examples/`:

- `ALL_COMPILED.xlsx` — The question bank (~7,000 terms across 21 topics)
- `WEEK_1_TOSS-UP_1_.xlsx` — A scored buzzer session from 31 May 2025

---

## Deployment & Infrastructure

### Stack

- **Frontend:** Next.js 15 (App Router) with TypeScript and Tailwind CSS
- **Backend:** Next.js API routes (serverless functions on Vercel)
- **Database:** Supabase (hosted PostgreSQL + Row Level Security + Auth)
- **Deployment:** Vercel (free tier)

### Why This Stack

Vercel free tier handles the frontend and API routes. Supabase free tier provides PostgreSQL with 500MB storage, built-in auth, and real-time subscriptions — more than enough for 4 users and ~7K question rows. Both are free for this scale.

### Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

---

## Users & Access

### Scope

v1 is built for the SPE ITB PetroBowl delegation: **Maulidan, Anggitya, Steven, Jak**. The data model uses a `team` abstraction so extending to other teams later is trivial, but v1 UI is single-team.

### Roles

| Role | Who | Can do |
|------|-----|--------|
| **Admin** | Maulidan (Co-Manager CE) | Assign/reassign topics, create buzzer sessions, import questions, view all progress |
| **Player** | All four delegates | Solo drill on assigned topics, participate in buzzer sessions, view own + team progress |

### Authentication

Supabase Auth with email/password or magic link. Each user record is tied to a `player` row in the database.

---

## Data Model

### `teams`

| Field | Type | Description |
|-------|------|-------------|
| `id` | uuid | Primary key |
| `name` | text | e.g. "SPE ITB 2026" |
| `created_at` | timestamp | |

### `players`

| Field | Type | Description |
|-------|------|-------------|
| `id` | uuid | Primary key |
| `team_id` | uuid | FK → teams |
| `user_id` | uuid | FK → Supabase auth.users |
| `name` | text | Display name |
| `role` | enum | `admin` or `player` |

### `topics`

| Field | Type | Description |
|-------|------|-------------|
| `id` | uuid | Primary key |
| `team_id` | uuid | FK → teams |
| `name` | text | e.g. "Drilling Fluid" |
| `source` | text | Optional — e.g. "SLB Glossary", "GPT-generated" |

### `questions`

| Field | Type | Description |
|-------|------|-------------|
| `id` | uuid | Primary key |
| `topic_id` | uuid | FK → topics |
| `question` | text | The definition/description/prompt |
| `answer` | text | The term/concept being described |

### `topic_assignments`

Links topics to the player responsible for them. A topic can only have one active assignment at a time, but reassignment history is tracked.

| Field | Type | Description |
|-------|------|-------------|
| `id` | uuid | Primary key |
| `topic_id` | uuid | FK → topics |
| `player_id` | uuid | FK → players |
| `assigned_at` | timestamp | When this assignment started |
| `unassigned_at` | timestamp | Null if current; set on reassignment |

To get current assignments: `WHERE unassigned_at IS NULL`.

### `card_progress`

Tracks spaced repetition state for each player × question pair.

| Field | Type | Description |
|-------|------|-------------|
| `id` | uuid | Primary key |
| `player_id` | uuid | FK → players |
| `question_id` | uuid | FK → questions |
| `ease_factor` | float | SM-2 ease factor (default 2.5) |
| `interval_days` | int | Current review interval in days |
| `repetitions` | int | Consecutive correct count |
| `next_review` | date | When this card is next due |
| `last_reviewed` | timestamp | Last time the player saw this card |

### `drill_responses`

Individual card-level responses during solo drills.

| Field | Type | Description |
|-------|------|-------------|
| `id` | uuid | Primary key |
| `player_id` | uuid | FK → players |
| `question_id` | uuid | FK → questions |
| `correct` | bool | Did the player get it right |
| `response_time_ms` | int | How long the player took to respond |
| `reviewed_at` | timestamp | |

### `sessions`

A buzzer session (team drill).

| Field | Type | Description |
|-------|------|-------------|
| `id` | uuid | Primary key |
| `team_id` | uuid | FK → teams |
| `name` | text | e.g. "Week 2 Toss-Up" |
| `created_by` | uuid | FK → players (admin who created it) |
| `num_questions` | int | Number of questions in this session |
| `status` | enum | `draft`, `active`, `completed` |
| `created_at` | timestamp | |
| `completed_at` | timestamp | |

### `session_questions`

The ordered list of questions in a buzzer session.

| Field | Type | Description |
|-------|------|-------------|
| `id` | uuid | Primary key |
| `session_id` | uuid | FK → sessions |
| `question_id` | uuid | FK → questions |
| `question_order` | int | Position in session (1–N) |
| `assigned_to` | uuid | FK → players — snapshot of topic owner at session creation time |
| `buzzed_by` | uuid | FK → players, nullable — who buzzed in |
| `correct` | bool | Whether the buzzer answered correctly (default true for v1) |

### `session_scores` (database view)

Per-player scoring for a session, computed from `session_questions`.

| Field | Type | Description |
|-------|------|-------------|
| `session_id` | uuid | |
| `player_id` | uuid | |
| `correct_answers` | int | Total buzzes by this player |
| `on_topic` | int | Buzzed own topic correctly |
| `out_of_topic` | int | Buzzed other's topic correctly |
| `missed_topic` | int | Own topic buzzed by someone else |
| `defense_score` | float | (on_topic - 0.5 × missed) / own_qs × 100 |
| `offense_bonus` | float | (2 × out_of_topic) / others_qs × 100 |
| `total_score` | float | 0.7 × defense + 0.3 × offense |

---

## Feature 1: Question Bank Management

### Import

- Bulk import from Excel files matching the format of `ALL_COMPILED.xlsx`.
- Each sheet becomes a topic. First row is a header; subsequent rows are question/answer pairs.
- The importer must detect column roles from headers, not assume a fixed layout — column order varies across sheets (see Import Notes section).
- On import, each topic is auto-assigned to a player based on a provided mapping, or left unassigned for the admin to handle.

### Browse & Edit

- View all questions filterable by topic and assigned player.
- Add, edit, delete individual questions.
- Add new topics.

### Stats

- Question count per topic, per player, total.
- Coverage: percentage of each player's assigned terms studied at least once.

---

## Feature 2: Solo Drill Mode (Spaced Repetition)

This is the core training feature and the highest-priority build item. Each player drills their assigned terms individually on their own schedule.

### Algorithm: SM-2 (SuperMemo 2)

On each review:

1. Player sees the question (definition), tries to recall the answer.
2. Player reveals the answer, self-grades: **Again** (wrong), **Hard**, **Good**, **Easy**.
3. SM-2 updates the card state:
   - **Again:** interval resets to 1 day, repetitions reset to 0
   - **Hard:** interval × 1.2, ease factor decreased by 0.15
   - **Good:** interval × ease factor
   - **Easy:** interval × ease factor × 1.3, ease factor increased by 0.15
   - Ease factor minimum: 1.3
4. Card is scheduled for `next_review = today + interval`.

### Daily Session Flow

1. Player opens the app → sees their dashboard.
2. Dashboard shows: cards due today, new cards available, mastery stats.
3. Player starts a drill session.
4. Cards are served in priority order:
   - **Due reviews** (cards whose `next_review ≤ today`) — most important, retention depends on timely review
   - **New cards** — unseen terms from assigned topics, capped at **30 new cards per day** (configurable by admin)
5. For each card:
   - Screen shows the question/definition.
   - Player mentally recalls the answer, then taps "Show Answer."
   - Answer is revealed. Player taps **Again / Hard / Good / Easy**.
   - Card is rescheduled per SM-2.
6. Session ends when all due cards and daily new cards are done.

### Constraints

- Players can ONLY drill on their currently assigned topics.
- New cards are introduced in topic order (not random) — admin controls pacing by ordering terms in the bank.
- Players can optionally drill beyond their daily cap via a "More Cards" button — but the default cap prevents overwhelm.
- Response time is logged per card for analytics but does not affect the spaced repetition algorithm.

### Player Dashboard

- **Today:** cards due, cards reviewed, accuracy rate
- **Overall:** total terms mastered (interval ≥ 21 days) / total assigned, broken down by topic
- **Heatmap:** daily review activity (GitHub-style contribution graph)
- **Weak spots:** terms with the lowest ease factor or most "Again" responses

### Admin Dashboard

- Per-player mastery bar (e.g. "Anggitya: 247 / 1,276 mastered")
- Per-topic breakdown across all players
- Players who haven't drilled in >2 days (nudge targets)
- Readiness gauge: team-wide mastery percentage

---

## Feature 3: Buzzer Session Mode

Replaces the manual RANDOMIZER → copy-paste → Excel scoring workflow. The quizmaster runs the session through the webapp while using buzzin.live as the external buzzer.

### Why Not Build a Buzzer

Building a reliable sub-100ms buzzer with tie-breaking over WebSocket is a standalone engineering project. buzzin.live solves it for free and the team is familiar with it. The webapp owns the brain (questions, scoring, analytics); buzzin.live owns the reflexes (real-time buzzer input). Clean separation.

### Session Creation (Admin)

1. Admin taps "New Buzzer Session."
2. Sets session name and question count (default 50).
3. Chooses question pool:
   - **Studied Only (recommended):** draw only from terms all players have seen at least once in solo drills. Prevents unfamiliar-term questions.
   - **Full Bank:** draw from entire bank (for early-season use before solo drills have ramped up).
4. Randomizer draws N questions with balanced distribution across players (roughly equal share per player + unowned pool).
5. Admin previews distribution, can swap individual questions, then locks the session.

### Live Session Flow

1. Admin opens the session on their device (quizmaster screen).
2. Admin opens buzzin.live separately, shares room code with players.
3. Per question:
   - Webapp shows: question number, full question text, answer, topic, topic owner. **Players do NOT see this screen.**
   - Admin reads the question aloud.
   - Players buzz on buzzin.live.
   - Admin taps the buzzer's name on the webapp (player buttons), or taps "No Buzz."
   - Live scoreboard updates.
   - "Next" advances to the next question.
4. Session auto-completes after the last question.

### Scoring System

Per player per session:

```
defense_score = (on_topic - 0.5 * missed_topic) / total_own_qs * 100
offense_bonus = (2 * out_of_topic) / total_others_qs * 100
total_score   = 0.7 * defense_score + 0.3 * offense_bonus
```

**Edge cases:**
- Unowned topic questions: no defense impact, offense only.
- "No Buzz": counts as missed topic for the owner.
- Zero assigned questions in session: defense score = 0.
- `assigned_to` is snapshot at session creation, not live. Mid-week reassignments don't affect in-progress sessions.

---

## Feature 4: Analytics

### Per-Session Report

- Scoreboard with full breakdown per player
- Question-by-question log: who buzzed, on-topic or not, answer
- Topic heatmap: strong/weak topics
- Missed questions list

### Historical Trends

- Score trends: line chart per player across weeks
- Topic accuracy: per-topic hit rate over time
- Head-to-head: who is sniping whose topics
- Drill correlation: daily drill volume vs. buzzer session score

### Feedback Loop: Buzzer → Solo Drills

After each buzzer session, any question that was "missed" (no buzz or wrong buzz) for a player gets its `next_review` reset to tomorrow in that player's solo drill queue, regardless of its current interval. Weak spots are forced back into active rotation automatically.

---

## Feature 5: Topic Reassignment

Admin can reassign topics between players at any time.

### What Happens on Reassignment

1. Old `topic_assignment` row gets `unassigned_at = now()`.
2. New `topic_assignment` row is created for the new player.
3. Old player's `card_progress` for that topic is **preserved** (knowledge persists for buzzer rounds) but cards stop appearing in their solo drill queue.
4. New player gets fresh `card_progress` rows starting from zero mastery.
5. Future buzzer sessions use the new assignment for scoring.
6. Historical session scores are NOT retroactively changed.

---

## Non-Goals (Out of Scope for v1)

- **Built-in buzzer.** Team uses buzzin.live.
- **LLM-based question rephrasing.** Planned for v2 to address train/test phrasing overlap. v1 uses questions as-is.
- **Multi-team UI.** Data model supports it; UI does not.
- **AI-generated questions.** Import only.
- **Native mobile app.** Responsive web app works on mobile browsers.
- **Player-facing question display during buzzer sessions.** Questions are read aloud.

---

## Current Team & Assignments

| Player | Topics | Questions |
|--------|--------|-----------|
| **Maulidan** | Machine Learning (GPT), Shale Gas, Reservoir Characterization, The Prize, Renewables (GPT) | ~1,497 |
| **Anggitya** | Production Facilities, Production Logging, Heavy Oil, Well Intervention, Production, Perforating, Production Test, Well Completion | ~1,276 |
| **Steven** | Well Test, Form Evaluation, Drilling Fluid, EOR | ~1,572 |
| **Jak** | Geology, Geophysics, Drilling, OnG Business | ~1,687 |
| *Unowned* | Renewables (IEA + EIA) | ~962 |

---

## Excel Import Notes

When parsing `ALL_COMPILED.xlsx`, handle these quirks:

1. **Column order varies by sheet.** Some have (Shuffle, Question, Answer), others (No, Question, Answer), others (Term, Definition). Detect column roles from headers.
2. **Answer-first sheets:** `Renewables (IEA + EIA)`, `Machine Learning (GPT)`, and `Renewables (GPT)` have answer/term in column A and question/definition in column B.
3. **Shuffle columns** contain `=RAND()` formulas — ignore during import.
4. **Skip these sheets:** `Topics` and `RANDOMIZER` are metadata, not question banks.
5. **Whitespace:** Strip leading/trailing whitespace and non-breaking spaces (`\xa0`).
6. **`The Prize` sheet** has extra columns (Chapter, Page) — preserve as metadata if possible.
7. **Numbered terms:** `Renewables (GPT)` has answers prefixed with numbers ("1. Renewable Energy"). Strip the prefix on import.

---

## File Structure

```
/
├── SPEC.md                          ← This file
├── examples/
│   ├── ALL_COMPILED.xlsx            ← Question bank reference
│   └── WEEK_1_TOSS-UP_1_.xlsx       ← Scored session reference
└── src/
    ├── app/                         ← Next.js App Router pages
    │   ├── page.tsx                 ← Landing / login
    │   ├── dashboard/               ← Player dashboard
    │   ├── drill/                   ← Solo drill mode
    │   ├── session/                 ← Buzzer session (admin)
    │   ├── analytics/               ← Historical analytics
    │   └── admin/                   ← Topic management, import, assignments
    ├── components/                  ← Shared UI components
    ├── lib/
    │   ├── supabase.ts              ← Supabase client
    │   ├── sm2.ts                   ← SM-2 spaced repetition algorithm
    │   ├── scoring.ts               ← PetroBowl scoring formulas
    │   └── randomizer.ts            ← Balanced question draw logic
    └── types/                       ← TypeScript type definitions
```

---

## Implementation Priority

Build in this order:

1. **Database schema + auth + import pipeline** — get the question bank into Supabase, get 4 players authenticated.
2. **Solo drill mode** — highest-value feature. No alternative currently exists; players can start training immediately.
3. **Admin dashboard** — topic assignments, progress monitoring, nudges.
4. **Buzzer session mode** — replaces Excel workflow. The `generate_session.py` script serves as a stopgap until this is built.
5. **Analytics** — historical trends, buzzer → drill feedback loop.
