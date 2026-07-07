# Glossary Question Bank Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the PetroBowl question bank from the SLB glossary CSVs, remap topics to the four delegates, and introduce multi-owner questions/topics with a weighted buzzer scoring rule, while preserving past session records.

**Architecture:** Approach B — terms multi-home as one `questions` row per topic CSV, linked by a normalized `term_key`. Topics may have multiple active owners. At buzzer generation, duplicate rows are regrouped by `term_key` into one `session_question` whose `owners uuid[]` = the union of owners across the term's topics ∩ participants. Scoring reads owner sets and reduces exactly to today's formula when a question has one owner. Old content is retired (not deleted) so past sessions still resolve.

**Tech Stack:** Next.js 15 (App Router, Node runtime), TypeScript, Supabase (Postgres), Vitest, tsx scripts.

## Global Constraints

- Test runner: `npm run test` (vitest). Typecheck: `npm run typecheck`. Lint: `npm run lint` (`--max-warnings=0`). Build: `npm run build`.
- Path alias: `@/` → `src/`.
- Node runtime for API routes (`export const runtime = "nodejs";`).
- The `session_scores` view MUST keep these output columns unchanged (coach/analytics depend on them): `session_id, player_id, correct_answers, on_topic, out_of_topic, missed_topic, defense_score, offense_bonus, total_score, wrong_buzzes`.
- Scoring MUST reduce to the current formula when every question has exactly one effective owner (regression: existing `scoring.test.ts` cases keep passing).
- Effective owners fallback everywhere ownership is read: `owners` if non-empty, else `[assigned_to]` (or `[]` when `assigned_to` is null).
- Topic display names and slugs are the canonical set in `GLOSSARY_TOPICS` (Task 2). Co-owned topic: **Well Workover and Intervention** (Maulidan + Anggitya).
- Destructive DB steps (migration apply, seed run) require the user's Supabase env and explicit confirmation — see Task 3 and Task 6 notes.

---

### Task 1: Glossary CSV parser

**Files:**
- Create: `src/lib/import/glossary-csv.ts`
- Test: `src/lib/import/glossary-csv.test.ts`

**Interfaces:**
- Produces:
  - `normalizeTermKey(term: string): string`
  - `parseGlossaryCsv(slug: string, name: string, content: string): ParsedGlossaryTopic`
  - `type ParsedGlossaryQuestion = { question: string; answer: string; termKey: string; displayOrder: number; metadata: { disciplines?: string; url?: string } }`
  - `type ParsedGlossaryTopic = { slug: string; name: string; questions: ParsedGlossaryQuestion[] }`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/import/glossary-csv.test.ts
import { describe, expect, it } from "vitest";
import { normalizeTermKey, parseGlossaryCsv } from "@/lib/import/glossary-csv";

describe("normalizeTermKey", () => {
  it("lowercases, trims, and collapses whitespace", () => {
    expect(normalizeTermKey("  Abnormal   Pressure ")).toBe("abnormal pressure");
    expect(normalizeTermKey("6FF40")).toBe("6ff40");
  });
});

describe("parseGlossaryCsv", () => {
  const csv =
    'term,definition,disciplines,url\n' +
    'abnormal pressure,"1. (n.) [Geology] A, with comma | 2. (n.) [Drilling] More ""quoted"" text.",Drilling; Geology,https://glossary.slb.com/en/terms/a/abnormal_pressure\n' +
    'adjustable choke,"A valve.",Drilling,https://glossary.slb.com/en/terms/a/adjustable_choke\n';

  it("parses rows into definition->term questions with metadata and term_key", () => {
    const topic = parseGlossaryCsv("drilling", "Drilling", csv);
    expect(topic).toMatchObject({ slug: "drilling", name: "Drilling" });
    expect(topic.questions).toHaveLength(2);
    expect(topic.questions[0]).toEqual({
      question:
        '1. (n.) [Geology] A, with comma | 2. (n.) [Drilling] More "quoted" text.',
      answer: "abnormal pressure",
      termKey: "abnormal pressure",
      displayOrder: 1,
      metadata: { disciplines: "Drilling; Geology", url: "https://glossary.slb.com/en/terms/a/abnormal_pressure" }
    });
  });

  it("skips rows with a blank term or definition", () => {
    const topic = parseGlossaryCsv("x", "X", 'term,definition,disciplines,url\n,"only def",,\nreal,"def",,\n');
    expect(topic.questions.map((q) => q.answer)).toEqual(["real"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/import/glossary-csv.test.ts`
Expected: FAIL with "Cannot find module '@/lib/import/glossary-csv'".

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/import/glossary-csv.ts
export type ParsedGlossaryQuestion = {
  question: string;
  answer: string;
  termKey: string;
  displayOrder: number;
  metadata: { disciplines?: string; url?: string };
};

export type ParsedGlossaryTopic = {
  slug: string;
  name: string;
  questions: ParsedGlossaryQuestion[];
};

export function normalizeTermKey(term: string): string {
  return term.replace(/\s+/g, " ").trim().toLowerCase();
}

// Minimal RFC4180 CSV parser: handles quoted fields, escaped quotes (""),
// commas and newlines inside quotes. Returns rows of string cells.
function parseCsvRows(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const text = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  while (i < text.length) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += 1;
      continue;
    }
    field += char;
    i += 1;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

export function parseGlossaryCsv(slug: string, name: string, content: string): ParsedGlossaryTopic {
  const rows = parseCsvRows(content);
  const questions: ParsedGlossaryQuestion[] = [];

  // Row 0 is the header (term,definition,disciplines,url).
  for (let index = 1; index < rows.length; index += 1) {
    const [term = "", definition = "", disciplines = "", url = ""] = rows[index];
    const answer = term.trim();
    const question = definition.trim();
    if (!answer || !question) {
      continue;
    }
    const metadata: ParsedGlossaryQuestion["metadata"] = {};
    if (disciplines.trim()) {
      metadata.disciplines = disciplines.trim();
    }
    if (url.trim()) {
      metadata.url = url.trim();
    }
    questions.push({
      question,
      answer,
      termKey: normalizeTermKey(answer),
      displayOrder: questions.length + 1,
      metadata
    });
  }

  return { slug, name, questions };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/lib/import/glossary-csv.test.ts`
Expected: PASS (both suites).

- [ ] **Step 5: Commit**

```bash
git add src/lib/import/glossary-csv.ts src/lib/import/glossary-csv.test.ts
git commit -m "feat: add SLB glossary CSV parser with term_key normalization"
```

---

### Task 2: Canonical topics + multi-owner assignment map

**Files:**
- Modify: `src/lib/constants.ts`
- Modify: `src/lib/import/excel.ts:2` and `:205` (rename consumer)
- Test: `src/lib/constants.test.ts` (create)

**Interfaces:**
- Produces:
  - `GLOSSARY_TOPICS: { slug: string; name: string }[]` (21 entries, in `display_order` order)
  - `TOPIC_OWNERS: Record<string /* topic name */, string[] /* player names */>`
  - `SEED_PLAYERS: { name: string; role: PlayerRole; topics: string[] }[]` (topics now hold glossary display names; Well Workover and Intervention appears under both Maulidan and Anggitya)
- Consumes: `PlayerRole` from `@/types/database`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/constants.test.ts
import { describe, expect, it } from "vitest";
import { GLOSSARY_TOPICS, TOPIC_OWNERS } from "@/lib/constants";

describe("glossary topic constants", () => {
  it("defines all 21 glossary topics", () => {
    expect(GLOSSARY_TOPICS).toHaveLength(21);
    expect(GLOSSARY_TOPICS.map((t) => t.slug)).toContain("well_workover_and_intervention");
  });

  it("co-owns Well Workover and Intervention between Maulidan and Anggitya", () => {
    expect(TOPIC_OWNERS["Well Workover and Intervention"]).toEqual(
      expect.arrayContaining(["Maulidan", "Anggitya"])
    );
    expect(TOPIC_OWNERS["Well Workover and Intervention"]).toHaveLength(2);
  });

  it("assigns every glossary topic to at least one owner", () => {
    for (const topic of GLOSSARY_TOPICS) {
      expect(TOPIC_OWNERS[topic.name]?.length ?? 0).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/constants.test.ts`
Expected: FAIL with "GLOSSARY_TOPICS is not exported" / undefined.

- [ ] **Step 3: Rewrite `src/lib/constants.ts`**

```ts
import type { PlayerRole } from "@/types/database";

export const TEAM_NAME = "SPE ITB 2026";
export const DAILY_NEW_CARD_LIMIT = 100;

export const GLOSSARY_TOPICS: { slug: string; name: string }[] = [
  { slug: "digital", name: "Digital" },
  { slug: "drilling", name: "Drilling" },
  { slug: "drilling_fluids", name: "Drilling Fluids" },
  { slug: "enhanced_oil_recovery", name: "Enhanced Oil Recovery" },
  { slug: "formation_evaluation", name: "Formation Evaluation" },
  { slug: "general_terms", name: "General Terms" },
  { slug: "geochemistry", name: "Geochemistry" },
  { slug: "geology", name: "Geology" },
  { slug: "geophysics", name: "Geophysics" },
  { slug: "heavy_oil", name: "Heavy Oil" },
  { slug: "oil_and_gas_business", name: "Oil and Gas Business" },
  { slug: "perforating", name: "Perforating" },
  { slug: "production", name: "Production" },
  { slug: "production_facilities", name: "Production Facilities" },
  { slug: "production_logging", name: "Production Logging" },
  { slug: "production_testing", name: "Production Testing" },
  { slug: "reservoir_characterization", name: "Reservoir Characterization" },
  { slug: "shale_gas", name: "Shale Gas" },
  { slug: "well_completions", name: "Well Completions" },
  { slug: "well_testing", name: "Well Testing" },
  { slug: "well_workover_and_intervention", name: "Well Workover and Intervention" }
];

export type SeedPlayer = {
  name: string;
  role: PlayerRole;
  topics: string[];
};

export const SEED_PLAYERS: SeedPlayer[] = [
  {
    name: "Maulidan",
    role: "admin",
    topics: [
      "Shale Gas",
      "Reservoir Characterization",
      "Digital",
      "Geochemistry",
      "General Terms",
      "Well Completions",
      "Well Workover and Intervention"
    ]
  },
  {
    name: "Anggitya",
    role: "player",
    topics: [
      "Production Facilities",
      "Production Logging",
      "Heavy Oil",
      "Production",
      "Perforating",
      "Production Testing",
      "Well Workover and Intervention"
    ]
  },
  {
    name: "Steven",
    role: "player",
    topics: ["Well Testing", "Formation Evaluation", "Drilling Fluids", "Enhanced Oil Recovery"]
  },
  {
    name: "Jak",
    role: "player",
    topics: ["Geology", "Geophysics", "Drilling", "Oil and Gas Business"]
  }
];

// Topic name -> list of owner player names (multi-owner aware).
export const TOPIC_OWNERS = SEED_PLAYERS.reduce<Record<string, string[]>>((owners, player) => {
  for (const topic of player.topics) {
    owners[topic] = [...(owners[topic] ?? []), player.name];
  }
  return owners;
}, {});
```

- [ ] **Step 4: Update the legacy Excel importer consumer**

In `src/lib/import/excel.ts`, change the import on line 2 and the usage on line ~205:

```ts
// line 2
import { TOPIC_OWNERS } from "@/lib/constants";
```

```ts
// in parseQuestionBank, replace: assignedTo: TOPIC_ASSIGNMENTS[sheetName] ?? null
assignedTo: TOPIC_OWNERS[sheetName]?.[0] ?? null,
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npm run test -- src/lib/constants.test.ts && npm run typecheck`
Expected: constants test PASS; typecheck PASS (no other references to `TOPIC_ASSIGNMENTS`; verify with `git grep TOPIC_ASSIGNMENTS` returns nothing).

- [ ] **Step 6: Commit**

```bash
git add src/lib/constants.ts src/lib/constants.test.ts src/lib/import/excel.ts
git commit -m "feat: canonical glossary topics + multi-owner assignment map"
```

---

### Task 3: Migration — schema + rewritten scoring view

**Files:**
- Create: `supabase/migrations/0005_glossary_overhaul.sql`

**Interfaces:**
- Produces DB columns: `topics.retired_at`, `questions.term_key`, `session_questions.owners uuid[]`; partial unique indexes; rewritten `session_scores` view.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0005_glossary_overhaul.sql

-- 1. Topics can be retired; name uniqueness applies only among active topics.
alter table public.topics add column if not exists retired_at timestamptz;
alter table public.topics drop constraint if exists topics_team_id_name_key;
create unique index if not exists topics_team_active_name
  on public.topics(team_id, name)
  where retired_at is null;

-- 2. Topics can have multiple active owners.
drop index if exists public.topic_assignments_one_active;
create unique index if not exists topic_assignments_active_owner
  on public.topic_assignments(topic_id, player_id)
  where unassigned_at is null;

-- 3. Multi-home link key for regrouping duplicate terms at buzzer time.
alter table public.questions add column if not exists term_key text;
create index if not exists questions_topic_term_key on public.questions(topic_id, term_key);
create index if not exists questions_term_key on public.questions(term_key);

-- 4. Session questions carry a set of owners.
alter table public.session_questions
  add column if not exists owners uuid[] not null default '{}'::uuid[];

-- 5. Scoring view: owner arrays + weighted penalty + back-compat fallback.
create or replace view public.session_scores as
with player_sessions as (
  select sp.session_id, sp.player_id
  from public.session_participants sp
),
effective as (
  select
    sq.session_id,
    sq.buzzed_by,
    sq.correct,
    sq.missed_by,
    case
      when array_length(sq.owners, 1) is not null and array_length(sq.owners, 1) > 0 then sq.owners
      when sq.assigned_to is not null then array[sq.assigned_to]
      else '{}'::uuid[]
    end as owners
  from public.session_questions sq
),
question_scores as (
  select
    ps.session_id,
    ps.player_id,
    count(e.*) filter (where ps.player_id = any(e.owners)) as own_qs,
    count(e.*) filter (where not (ps.player_id = any(e.owners))) as others_qs,
    count(e.*) filter (where e.buzzed_by = ps.player_id and e.correct) as correct_answers,
    count(e.*) filter (
      where ps.player_id = any(e.owners) and e.buzzed_by = ps.player_id and e.correct
    ) as on_topic,
    count(e.*) filter (
      where not (ps.player_id = any(e.owners)) and e.buzzed_by = ps.player_id and e.correct
    ) as out_of_topic,
    -- Weighted missed-topic penalty per the design rule.
    coalesce(sum(
      case
        when ps.player_id = any(e.owners) and not (e.buzzed_by = ps.player_id and e.correct) then
          case
            when e.buzzed_by = ps.player_id and not e.correct then 1.0                       -- buzzed own, wrong
            when e.correct and e.buzzed_by = any(e.owners) then 1.0                           -- co-owner took it
            else 1.0 / greatest(array_length(e.owners, 1), 1)                                 -- stolen or no-answer
          end
        else 0.0
      end
    ), 0.0) as missed_weight,
    -- Integer missed_topic kept for display/back-compat (any non-win on an owned q).
    count(e.*) filter (
      where ps.player_id = any(e.owners) and not (e.buzzed_by = ps.player_id and e.correct)
    ) as missed_topic,
    count(e.*) filter (
      where e.missed_by[1] = ps.player_id and not (ps.player_id = any(e.owners))
    ) as wrong_buzzes
  from player_sessions ps
  left join effective e on e.session_id = ps.session_id
  group by ps.session_id, ps.player_id
)
select
  session_id,
  player_id,
  correct_answers,
  on_topic,
  out_of_topic,
  missed_topic,
  case when own_qs = 0 then 0 else ((on_topic - 0.5 * missed_weight)::double precision / own_qs) * 100 end as defense_score,
  case when others_qs = 0 then 0 else ((2 * out_of_topic - wrong_buzzes)::double precision / others_qs) * 100 end as offense_bonus,
  0.7 * (case when own_qs = 0 then 0 else ((on_topic - 0.5 * missed_weight)::double precision / own_qs) * 100 end)
    + 0.3 * (case when others_qs = 0 then 0 else ((2 * out_of_topic - wrong_buzzes)::double precision / others_qs) * 100 end) as total_score,
  wrong_buzzes
from question_scores;
```

- [ ] **Step 2: Apply the migration (destructive DB step — confirm with user first)**

Apply via the Supabase MCP `apply_migration`/SQL runner or the Supabase SQL editor against the project database. (This project has a Supabase MCP configured; if using the CLI, `supabase db push`.)

- [ ] **Step 3: Verify schema**

Run this query and confirm the columns/indexes exist:

```sql
select column_name from information_schema.columns
where table_name = 'session_questions' and column_name = 'owners';
select column_name from information_schema.columns
where table_name = 'questions' and column_name = 'term_key';
select column_name from information_schema.columns
where table_name = 'topics' and column_name = 'retired_at';
select 1 from pg_views where viewname = 'session_scores';
```

Expected: each returns a row. Also sanity-check the view still returns rows for an existing completed session with unchanged numbers (owners empty ⇒ fallback to assigned_to).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0005_glossary_overhaul.sql
git commit -m "feat: migration for glossary overhaul schema and multi-owner scoring view"
```

---

### Task 4: Commit the 21 glossary CSVs

**Files:**
- Create: `data/slb_glossary/*.csv` (21 files)
- Create: `data/slb_glossary/README.md`

- [ ] **Step 1: Copy the 21 topic CSVs into the repo**

```bash
mkdir -p data/slb_glossary
for slug in digital drilling drilling_fluids enhanced_oil_recovery formation_evaluation general_terms geochemistry geology geophysics heavy_oil oil_and_gas_business perforating production production_facilities production_logging production_testing reservoir_characterization shale_gas well_completions well_testing well_workover_and_intervention; do
  cp "/c/Users/mauli/Downloads/slb_glossary_by_topic/$slug.csv" "data/slb_glossary/$slug.csv"
done
ls data/slb_glossary | wc -l   # expect 21 (README added next)
```

- [ ] **Step 2: Add a README noting provenance**

```markdown
<!-- data/slb_glossary/README.md -->
# SLB Glossary source data

21 per-discipline CSVs exported from the SLB glossary (`term,definition,disciplines,url`).
Used by `scripts/seed-glossary.ts` to rebuild the question bank. The master file
`_all_terms_master.csv` is intentionally excluded.
```

- [ ] **Step 3: Verify count**

Run: `ls data/slb_glossary/*.csv | wc -l`
Expected: `21`.

- [ ] **Step 4: Commit**

```bash
git add data/slb_glossary
git commit -m "chore: add SLB glossary topic CSVs as seed data"
```

---

### Task 5: Glossary seed pipeline (retire → clear → seed)

**Files:**
- Create: `src/lib/import/glossary-import.ts`
- Create: `scripts/seed-glossary.ts`
- Modify: `package.json` (add `seed:glossary` script)
- Test: `src/lib/import/glossary-import.test.ts`

**Interfaces:**
- Consumes: `GLOSSARY_TOPICS`, `SEED_PLAYERS`, `TOPIC_OWNERS`, `TEAM_NAME` from `@/lib/constants`; `parseGlossaryCsv` from Task 1.
- Produces:
  - `loadGlossaryTopics(dir: string): Promise<ParsedGlossaryTopic[]>`
  - `buildAssignmentPlan(topicIdByName: Map<string,string>, playerIdByName: Map<string,string>): { topicId: string; playerId: string }[]`
  - `seedGlossary(supabase: SupabaseClient, options?: { teamName?: string; dir?: string }): Promise<{ topicCount: number; questionCount: number; assignmentCount: number }>`

- [ ] **Step 1: Write the failing test (pure planning helper)**

```ts
// src/lib/import/glossary-import.test.ts
import { describe, expect, it } from "vitest";
import { buildAssignmentPlan } from "@/lib/import/glossary-import";

describe("buildAssignmentPlan", () => {
  it("emits one row per (topic, owner), including co-owned topics", () => {
    const topicIdByName = new Map([
      ["Well Workover and Intervention", "t-wwi"],
      ["Geology", "t-geo"]
    ]);
    const playerIdByName = new Map([
      ["Maulidan", "p-m"],
      ["Anggitya", "p-a"],
      ["Jak", "p-j"]
    ]);

    const plan = buildAssignmentPlan(topicIdByName, playerIdByName);

    expect(plan).toEqual(
      expect.arrayContaining([
        { topicId: "t-wwi", playerId: "p-m" },
        { topicId: "t-wwi", playerId: "p-a" },
        { topicId: "t-geo", playerId: "p-j" }
      ])
    );
    // Well Workover and Intervention is co-owned -> two rows.
    expect(plan.filter((row) => row.topicId === "t-wwi")).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/import/glossary-import.test.ts`
Expected: FAIL with "Cannot find module '@/lib/import/glossary-import'".

- [ ] **Step 3: Implement the pipeline**

```ts
// src/lib/import/glossary-import.ts
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { GLOSSARY_TOPICS, SEED_PLAYERS, TEAM_NAME, TOPIC_OWNERS } from "@/lib/constants";
import { createServiceSupabaseClient } from "@/lib/supabase";
import { parseGlossaryCsv, type ParsedGlossaryTopic } from "@/lib/import/glossary-csv";

export async function loadGlossaryTopics(dir: string): Promise<ParsedGlossaryTopic[]> {
  const topics: ParsedGlossaryTopic[] = [];
  for (const { slug, name } of GLOSSARY_TOPICS) {
    const content = await readFile(path.join(dir, `${slug}.csv`), "utf8");
    topics.push(parseGlossaryCsv(slug, name, content));
  }
  return topics;
}

export function buildAssignmentPlan(
  topicIdByName: Map<string, string>,
  playerIdByName: Map<string, string>
): { topicId: string; playerId: string }[] {
  const plan: { topicId: string; playerId: string }[] = [];
  for (const [topicName, ownerNames] of Object.entries(TOPIC_OWNERS)) {
    const topicId = topicIdByName.get(topicName);
    if (!topicId) {
      continue;
    }
    for (const ownerName of ownerNames) {
      const playerId = playerIdByName.get(ownerName);
      if (playerId) {
        plan.push({ topicId, playerId });
      }
    }
  }
  return plan;
}

async function must<T>(query: PromiseLike<{ data: T | null; error: { message: string } | null }>, label: string) {
  const { data, error } = await query;
  if (error || !data) {
    throw new Error(`${label}: ${error?.message ?? "missing row"}`);
  }
  return data;
}

export async function seedGlossary(
  supabase: SupabaseClient = createServiceSupabaseClient(),
  options: { teamName?: string; dir?: string } = {}
): Promise<{ topicCount: number; questionCount: number; assignmentCount: number }> {
  const teamName = options.teamName ?? process.env.PETROBOWL_TEAM_NAME ?? TEAM_NAME;
  const dir = options.dir ?? path.join(process.cwd(), "data", "slb_glossary");

  const team = await must<{ id: string }>(
    supabase.from("teams").upsert({ name: teamName }, { onConflict: "name" }).select("id").single(),
    "Upsert team"
  );

  // Players (name, role) — upsert so ids are stable.
  const playerIdByName = new Map<string, string>();
  for (const player of SEED_PLAYERS) {
    const row = await must<{ id: string }>(
      supabase
        .from("players")
        .upsert({ team_id: team.id, name: player.name, role: player.role }, { onConflict: "team_id,name" })
        .select("id")
        .single(),
      `Upsert player ${player.name}`
    );
    playerIdByName.set(player.name, row.id);
  }

  const now = new Date().toISOString();

  // --- RETIRE existing content, KEEP sessions ---
  {
    const { error } = await supabase
      .from("topics")
      .update({ retired_at: now })
      .eq("team_id", team.id)
      .is("retired_at", null);
    if (error) throw new Error(`Retire topics: ${error.message}`);
  }
  {
    const { error } = await supabase
      .from("topic_assignments")
      .update({ unassigned_at: now })
      .is("unassigned_at", null);
    if (error) throw new Error(`Unassign topics: ${error.message}`);
  }

  // --- CLEAR SRS progress and drill history ---
  const playerIds = [...playerIdByName.values()];
  for (const table of ["card_progress", "drill_responses"] as const) {
    const { error } = await supabase.from(table).delete().in("player_id", playerIds);
    if (error) throw new Error(`Clear ${table}: ${error.message}`);
  }

  // --- SEED 21 glossary topics + questions ---
  const parsedTopics = await loadGlossaryTopics(dir);
  const topicIdByName = new Map<string, string>();
  let questionCount = 0;

  for (const [topicIndex, topic] of parsedTopics.entries()) {
    const topicRow = await must<{ id: string }>(
      supabase
        .from("topics")
        .insert({
          team_id: team.id,
          name: topic.name,
          source: "SLB Glossary",
          display_order: topicIndex + 1
        })
        .select("id")
        .single(),
      `Insert topic ${topic.name}`
    );
    topicIdByName.set(topic.name, topicRow.id);

    const payload = topic.questions.map((question) => ({
      topic_id: topicRow.id,
      question: question.question,
      answer: question.answer,
      term_key: question.termKey,
      metadata: question.metadata,
      display_order: question.displayOrder
    }));

    for (let i = 0; i < payload.length; i += 500) {
      const chunk = payload.slice(i, i + 500);
      const { error } = await supabase.from("questions").insert(chunk);
      if (error) throw new Error(`Insert questions for ${topic.name}: ${error.message}`);
    }
    questionCount += payload.length;
  }

  // --- ASSIGN topics to owners (multi-owner aware) ---
  const plan = buildAssignmentPlan(topicIdByName, playerIdByName);
  if (plan.length) {
    const { error } = await supabase
      .from("topic_assignments")
      .insert(plan.map((row) => ({ topic_id: row.topicId, player_id: row.playerId })));
    if (error) throw new Error(`Insert assignments: ${error.message}`);
  }

  return { topicCount: parsedTopics.length, questionCount, assignmentCount: plan.length };
}
```

- [ ] **Step 4: Add the seed script + npm script**

```ts
// scripts/seed-glossary.ts
import { seedGlossary } from "@/lib/import/glossary-import";

async function main() {
  const result = await seedGlossary();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
```

In `package.json` scripts, add:

```json
"seed:glossary": "tsx --env-file=.env.local scripts/seed-glossary.ts"
```

- [ ] **Step 5: Run unit test + typecheck**

Run: `npm run test -- src/lib/import/glossary-import.test.ts && npm run typecheck`
Expected: PASS.

> **Note (destructive):** actually running `npm run seed:glossary` mutates the database (retires content, clears everyone's SRS, inserts ~5,800 questions). Do NOT run it as part of this task — it runs once after all code tasks land and after the Task 3 migration is applied, with the user's confirmation (see Final Rollout).

- [ ] **Step 6: Commit**

```bash
git add src/lib/import/glossary-import.ts src/lib/import/glossary-import.test.ts scripts/seed-glossary.ts package.json
git commit -m "feat: glossary seed pipeline (retire, clear SRS, reseed, assign)"
```

---

### Task 6: Multi-owner session pool + term_key grouping

**Files:**
- Modify: `src/lib/session-pool.ts`
- Modify: `src/lib/session-pool.test.ts`

**Interfaces:**
- Consumes: `SessionPoolTopic { id }`, `SessionPoolAssignment { topicId, playerId }` (now several per topic).
- Produces (changed):
  - `type SessionPoolQuestion = { id: string; topicId: string; termKey: string }`
  - `type EligibleSessionQuestion = { id: string; topicId: string; termKey: string; assignedTo: string | null; owners: string[]; balanceGroup: string }`
  - `buildSessionQuestionPool(...)` returns one `EligibleSessionQuestion` per unique `termKey` in the eligible set.

- [ ] **Step 1: Update the tests (add termKey; assert grouping + owners)**

Replace the `questions` fixture and add grouping assertions in `src/lib/session-pool.test.ts`. New fixture and two new cases:

```ts
const questions = [
  { id: "q1", topicId: "t1", termKey: "alpha" },
  { id: "q2", topicId: "t1", termKey: "beta" },
  { id: "q3", topicId: "t2", termKey: "gamma" },
  { id: "q4", topicId: "t3", termKey: "delta" },
  { id: "q5", topicId: "t4", termKey: "epsilon" }
];
```

Update existing expectations to include `termKey`, `owners`, e.g. the topic-only manual case:

```ts
expect(pool.questions).toEqual([
  { id: "q3", topicId: "t2", termKey: "gamma", assignedTo: "p2", owners: ["p2"], balanceGroup: "p2" }
]);
```

Add:

```ts
it("collapses duplicate terms across topics into one owner-set question", () => {
  const pool = buildSessionQuestionPool({
    topicMode: "playerAssigned",
    participantIds: ["p1", "p2"],
    selectedTopicIds: [],
    topics,
    assignments,
    questions: [
      { id: "q1", topicId: "t1", termKey: "shared" }, // owner p1
      { id: "q3", topicId: "t2", termKey: "shared" }  // owner p2
    ]
  });

  expect(pool.questions).toHaveLength(1);
  const [question] = pool.questions;
  expect(question.owners.sort()).toEqual(["p1", "p2"]);
  expect(["q1", "q3"]).toContain(question.id);
});

it("derives owners for a co-owned topic (two assignments, one topic)", () => {
  const pool = buildSessionQuestionPool({
    topicMode: "playerAssigned",
    participantIds: ["p1", "p2"],
    selectedTopicIds: [],
    topics: [{ id: "t1" }],
    assignments: [
      { topicId: "t1", playerId: "p1" },
      { topicId: "t1", playerId: "p2" }
    ],
    questions: [{ id: "q1", topicId: "t1", termKey: "co" }]
  });

  expect(pool.questions[0].owners.sort()).toEqual(["p1", "p2"]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/lib/session-pool.test.ts`
Expected: FAIL (owners undefined / type errors / not collapsed).

- [ ] **Step 3: Rewrite `buildSessionQuestionPool` and types**

Replace the type block and the questions-building block in `src/lib/session-pool.ts`:

```ts
export type SessionPoolQuestion = {
  id: string;
  topicId: string;
  termKey: string;
};

export type EligibleSessionQuestion = {
  id: string;
  topicId: string;
  termKey: string;
  assignedTo: string | null;
  owners: string[];
  balanceGroup: string;
};
```

Replace the `ownerByTopicId` construction with a multi-owner map:

```ts
  const ownersByTopicId = new Map<string, string[]>();
  for (const assignment of input.assignments) {
    if (knownTopicIds.has(assignment.topicId)) {
      const current = ownersByTopicId.get(assignment.topicId) ?? [];
      if (!current.includes(assignment.playerId)) {
        current.push(assignment.playerId);
      }
      ownersByTopicId.set(assignment.topicId, current);
    }
  }
```

In the `else` branch that marks assigned topics, treat a topic as assigned if ANY owner participates:

```ts
    for (const topic of input.topics) {
      const owners = ownersByTopicId.get(topic.id) ?? [];
      if (owners.some((ownerId) => participantSet.has(ownerId))) {
        topicSources.set(topic.id, "assigned");
      }
    }
```

Replace the final `questions` mapping with term_key grouping:

```ts
  const eligible = input.questions.filter((question) => topicSources.has(question.topicId));

  const groups = new Map<string, { representativeId: string; owners: Set<string> }>();
  for (const question of eligible) {
    const group = groups.get(question.termKey) ?? {
      representativeId: question.id,
      owners: new Set<string>()
    };
    for (const ownerId of ownersByTopicId.get(question.topicId) ?? []) {
      if (participantSet.has(ownerId)) {
        group.owners.add(ownerId);
      }
    }
    groups.set(question.termKey, group);
  }

  const questions = [...groups.entries()].map<EligibleSessionQuestion>(([termKey, group]) => {
    const owners = [...group.owners];
    const primaryOwner = owners[0] ?? null;
    return {
      id: group.representativeId,
      topicId: eligible.find((question) => question.id === group.representativeId)!.topicId,
      termKey,
      assignedTo: primaryOwner,
      owners,
      balanceGroup: primaryOwner ?? "extra"
    };
  });
```

(The `if (!questions.length) throw ...` and `return { topicSources, questions }` lines stay.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/lib/session-pool.test.ts`
Expected: PASS (all cases, including the two new ones).

- [ ] **Step 5: Commit**

```bash
git add src/lib/session-pool.ts src/lib/session-pool.test.ts
git commit -m "feat: term_key grouping and multi-owner derivation in session pool"
```

---

### Task 7: Owner-set weighted scoring

**Files:**
- Modify: `src/lib/scoring.ts`
- Modify: `src/lib/scoring.test.ts`

**Interfaces:**
- Produces (changed): `ScoredSessionQuestion = { id: string; owners: string[]; buzzedBy: string | null; correct: boolean; missedBy: string[] }` (replaces `assignedTo: string | null`).
- Consumes: `SessionPlayer { id, name }`.

- [ ] **Step 1: Update existing tests to the owners shape + add multi-owner cases**

In `src/lib/scoring.test.ts`, replace every `assignedTo: X` with `owners: X === null ? [] : [X]`. For example the first case's questions become:

```ts
{ id: "q1", owners: ["p1"], buzzedBy: "p1", correct: true, missedBy: [] },
{ id: "q2", owners: ["p1"], buzzedBy: null, correct: false, missedBy: [] },
{ id: "q3", owners: ["p2"], buzzedBy: "p1", correct: true, missedBy: [] },
{ id: "q4", owners: [], buzzedBy: "p2", correct: true, missedBy: [] }
```

And the "absent owners" case uses `owners: ["p3"]`. Then append multi-owner cases:

```ts
it("penalizes the non-answering co-owner normally when an owner answers", () => {
  const scores = calculateSessionScores(
    [
      { id: "p1", name: "A" },
      { id: "p2", name: "B" }
    ],
    // q owned by p1 & p2; p1 answers correctly.
    [{ id: "q1", owners: ["p1", "p2"], buzzedBy: "p1", correct: true, missedBy: [] }]
  );
  const p1 = scores.find((s) => s.playerId === "p1");
  const p2 = scores.find((s) => s.playerId === "p2");
  expect(p1).toMatchObject({ onTopic: 1, missedTopic: 0 });
  // Co-owner p2 takes the full (weight 1) defense penalty: (0 - 0.5*1)/1*100 = -50.
  expect(p2).toMatchObject({ onTopic: 0, missedTopic: 1 });
  expect(p2?.defenseScore).toBe(-50);
});

it("splits the steal penalty across co-owners by 1/k", () => {
  const scores = calculateSessionScores(
    [
      { id: "p1", name: "A" },
      { id: "p2", name: "B" },
      { id: "p3", name: "C" }
    ],
    // q owned by p1 & p2; outsider p3 steals it correctly.
    [{ id: "q1", owners: ["p1", "p2"], buzzedBy: "p3", correct: true, missedBy: [] }]
  );
  const p1 = scores.find((s) => s.playerId === "p1");
  // weight 1/2 -> defense (0 - 0.5*0.5)/1*100 = -25.
  expect(p1?.defenseScore).toBe(-25);
  const p3 = scores.find((s) => s.playerId === "p3");
  expect(p3).toMatchObject({ outOfTopic: 1 });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/lib/scoring.test.ts`
Expected: FAIL (type error on `owners`, and new assertions unmet).

- [ ] **Step 3: Rewrite `calculateSessionScores`**

```ts
export type SessionPlayer = {
  id: string;
  name: string;
};

export type ScoredSessionQuestion = {
  id: string;
  owners: string[];
  buzzedBy: string | null;
  correct: boolean;
  missedBy: string[];
};

export type PlayerScore = {
  playerId: string;
  name: string;
  correctAnswers: number;
  onTopic: number;
  outOfTopic: number;
  missedTopic: number;
  wrongBuzzes: number;
  ownQuestions: number;
  otherQuestions: number;
  defenseScore: number;
  offenseBonus: number;
  totalScore: number;
};

function roundScore(value: number) {
  return Math.round(value * 10) / 10;
}

export function calculateSessionScores(
  players: SessionPlayer[],
  questions: ScoredSessionQuestion[]
): PlayerScore[] {
  return players.map((player) => {
    const owns = (question: ScoredSessionQuestion) => question.owners.includes(player.id);
    const wonBy = (question: ScoredSessionQuestion) => question.buzzedBy === player.id && question.correct;

    const ownQuestions = questions.filter(owns).length;
    const otherQuestions = questions.length - ownQuestions;

    const correctAnswers = questions.filter(
      (question) => question.buzzedBy === player.id && question.correct
    ).length;

    const onTopic = questions.filter((question) => owns(question) && wonBy(question)).length;
    const outOfTopic = questions.filter(
      (question) => !owns(question) && question.buzzedBy === player.id && question.correct
    ).length;

    // Non-win on an owned question (integer, for display parity).
    const missedTopic = questions.filter((question) => owns(question) && !wonBy(question)).length;

    // Weighted defense penalty: co-owner win or own wrong-buzz = 1; steal or
    // no-correct-answer = 1/k across co-owners.
    const missedWeight = questions.reduce((sum, question) => {
      if (!owns(question) || wonBy(question)) {
        return sum;
      }
      const k = Math.max(question.owners.length, 1);
      const ownWrongBuzz = question.buzzedBy === player.id && !question.correct;
      const coOwnerWon = question.correct && question.buzzedBy !== null && question.owners.includes(question.buzzedBy);
      const weight = ownWrongBuzz || coOwnerWon ? 1 : 1 / k;
      return sum + weight;
    }, 0);

    // First non-owner misser on a question takes a failed-steal penalty.
    const wrongBuzzes = questions.filter(
      (question) => question.missedBy[0] === player.id && !owns(question)
    ).length;

    const defenseScore =
      ownQuestions === 0 ? 0 : ((onTopic - 0.5 * missedWeight) / ownQuestions) * 100;
    const offenseBonus =
      otherQuestions === 0 ? 0 : ((2 * outOfTopic - wrongBuzzes) / otherQuestions) * 100;
    const totalScore = 0.7 * defenseScore + 0.3 * offenseBonus;

    return {
      playerId: player.id,
      name: player.name,
      correctAnswers,
      onTopic,
      outOfTopic,
      missedTopic,
      wrongBuzzes,
      ownQuestions,
      otherQuestions,
      defenseScore: roundScore(defenseScore),
      offenseBonus: roundScore(offenseBonus),
      totalScore: roundScore(totalScore)
    };
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/lib/scoring.test.ts`
Expected: PASS (regression cases + new multi-owner cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/scoring.ts src/lib/scoring.test.ts
git commit -m "feat: owner-set weighted buzzer scoring"
```

---

### Task 8: Session server + types carry owners; retired-topic filter

**Files:**
- Modify: `src/lib/session-server.ts` (`RawSessionQuestion`, question select, mapping, `calculateSessionScores` call, `RawAssignment`/owner maps, `loadSessionSetupData` topics query + owner list)
- Modify: `src/types/session.ts` (`QuizSessionQuestion`, `SessionSetupTopic`)

**Interfaces:**
- Consumes: `ScoredSessionQuestion.owners` (Task 7); `EligibleSessionQuestion` (Task 6).
- Produces (changed types):
  - `QuizSessionQuestion` gains `owners: string[]`, `ownerNames: string[]` (keeps `assignedTo`/`assignedToName` for the primary owner).
  - `SessionSetupTopic.ownerId/ownerName` → `ownerIds: string[]`, `ownerNames: string[]`.

- [ ] **Step 1: Update `src/types/session.ts`**

```ts
export type QuizSessionQuestion = {
  id: string;
  questionId: string;
  order: number;
  topicId: string | null;
  topicName: string | null;
  question: string;
  answer: string;
  assignedTo: string | null;
  assignedToName: string | null;
  owners: string[];
  ownerNames: string[];
  buzzedBy: string | null;
  buzzedByName: string | null;
  correct: boolean;
  missedBy: string[];
  missedByNames: string[];
};
```

```ts
export type SessionSetupTopic = {
  id: string;
  name: string;
  displayOrder: number;
  ownerIds: string[];
  ownerNames: string[];
  questionCount: number;
};
```

- [ ] **Step 2: Update `loadSessionData` in `src/lib/session-server.ts`**

Add `owners` to `RawSessionQuestion` and the select, compute effective owners with fallback, and pass owner sets to scoring:

```ts
// RawSessionQuestion: add
  owners: string[] | null;
```

```ts
// question select (line ~207): add owners
.select("id, question_id, question_order, assigned_to, owners, buzzed_by, correct, missed_by, questions(question, answer, topic_id, topics(name))")
```

```ts
// inside the questions map (replace the return object)
    const owners = row.owners && row.owners.length > 0
      ? row.owners
      : row.assigned_to
        ? [row.assigned_to]
        : [];

    return {
      id: row.id,
      questionId: row.question_id,
      order: row.question_order,
      topicId: question?.topic_id ?? null,
      topicName: topic?.name ?? null,
      question: question?.question ?? "",
      answer: question?.answer ?? "",
      assignedTo: owners[0] ?? null,
      assignedToName: owners[0] ? playerNameById.get(owners[0]) ?? null : null,
      owners,
      ownerNames: owners.map((id) => playerNameById.get(id) ?? "Unknown"),
      buzzedBy: row.buzzed_by,
      buzzedByName: row.buzzed_by ? playerNameById.get(row.buzzed_by) ?? null : null,
      correct: row.correct,
      missedBy,
      missedByNames: missedBy.map((id) => playerNameById.get(id) ?? "Unknown")
    };
```

```ts
// scores call (replace assignedTo mapping)
    scores: calculateSessionScores(
      sessionPlayers,
      answeredQuestions.map((question) => ({
        id: question.id,
        owners: question.owners,
        buzzedBy: question.buzzedBy,
        correct: question.correct,
        missedBy: question.missedBy
      }))
    ),
```

- [ ] **Step 3: Update `loadSessionSetupData` (retired filter + multi-owner topics)**

```ts
// topics query: only active topics
    supabase
      .from("topics")
      .select("id, name, display_order")
      .eq("team_id", teamId)
      .is("retired_at", null)
      .order("display_order"),
```

Replace the single-owner map with a list, and the topic mapping:

```ts
  const ownersByTopicId = new Map<string, string[]>();
  for (const assignment of assignmentRows) {
    const current = ownersByTopicId.get(assignment.topic_id) ?? [];
    current.push(assignment.player_id);
    ownersByTopicId.set(assignment.topic_id, current);
  }
```

```ts
    topics: topicRows.map((topic) => {
      const ownerIds = ownersByTopicId.get(topic.id) ?? [];
      return {
        id: topic.id,
        name: topic.name,
        displayOrder: topic.display_order,
        ownerIds,
        ownerNames: ownerIds.map((id) => playerNameById.get(id) ?? "Unknown"),
        questionCount: questionCountByTopicId.get(topic.id) ?? 0
      };
    }),
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS. Fix any consumer references (Task 9 covers UI consumers of `ownerId`/`assignedToName`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/session-server.ts src/types/session.ts
git commit -m "feat: carry owner sets through session server and filter retired topics"
```

---

### Task 9: Session start route persists owners

**Files:**
- Modify: `src/app/api/session/start/route.ts`

**Interfaces:**
- Consumes: `EligibleSessionQuestion { id, owners, assignedTo, ... }` from Task 6; `SessionPoolQuestion { id, topicId, termKey }`.

- [ ] **Step 1: Load `term_key` in the questions query**

```ts
type StartQuestionRow = {
  id: string;
  topic_id: string;
  term_key: string | null;
};
```

```ts
    const questions = await fetchAllPages<StartQuestionRow>(
      (from, to) =>
        supabase
          .from("questions")
          .select("id, topic_id, term_key")
          .in("topic_id", topicIds.length ? topicIds : ["00000000-0000-0000-0000-000000000000"])
          .range(from, to),
      "Could not load questions"
    );
```

```ts
      questions: questions.map((question) => ({
        id: question.id,
        topicId: question.topic_id,
        termKey: question.term_key ?? question.id // fallback: ungrouped if null
      })),
```

- [ ] **Step 2: Persist `owners` (and primary `assigned_to`) on session questions**

```ts
    const questionRows = selectedQuestions.map((question, index) => ({
      session_id: sessionId,
      question_id: question.id,
      question_order: index + 1,
      assigned_to: question.assignedTo,
      owners: question.owners
    }));
```

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS (build compiles the route).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/session/start/route.ts
git commit -m "feat: persist owner sets when generating buzzer sessions"
```

---

### Task 10: UI shows multiple owners

**Files:**
- Modify: `src/components/session-console.tsx` and/or `src/components/session-runner.tsx` (wherever `assignedToName` is rendered)
- Modify: any component reading `SessionSetupTopic.ownerName`/`ownerId` (find with grep)

**Interfaces:**
- Consumes: `QuizSessionQuestion.ownerNames`, `SessionSetupTopic.ownerNames`.

- [ ] **Step 1: Find the consumers**

Run: `git grep -n "assignedToName\|ownerName\|\.ownerId"` across `src/components` and `src/app`.

- [ ] **Step 2: Render owner lists**

For each hit, render the joined owner names, e.g. replace a single-owner label:

```tsx
{question.ownerNames.length ? question.ownerNames.join(" & ") : "Unowned"}
```

and for setup topics:

```tsx
{topic.ownerNames.length ? topic.ownerNames.join(" & ") : "Unassigned"}
```

Keep existing styling; only the value source changes.

- [ ] **Step 3: Typecheck + build + lint**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: PASS with no warnings.

- [ ] **Step 4: Commit**

```bash
git add src/components src/app
git commit -m "feat: display multiple topic/question owners in session UI"
```

---

### Final Rollout (destructive — run once, with user confirmation)

Not a code task. After all tasks land and the branch is green (`npm run test && npm run typecheck && npm run lint && npm run build`):

- [ ] Apply migration `0005_glossary_overhaul.sql` to the Supabase project (Task 3 Step 2) if not already applied.
- [ ] Confirm with the user, then run `npm run seed:glossary`. This retires old topics/assignments, clears all `card_progress` + `drill_responses`, inserts the 21 topics + ~5,800 questions, and writes the multi-owner assignments.
- [ ] Verify: `select count(*) from questions q join topics t on t.id = q.topic_id where t.retired_at is null;` (~5,800) and `select name, count(*) from topic_assignments ta join topics t on t.id = ta.topic_id where ta.unassigned_at is null group by name;` shows Well Workover and Intervention with 2 owners.
- [ ] Spot-check drill (each delegate sees only their new topics) and a fresh buzzer session (a Well Workover term shows two owners; scoring applies the 1/k rule on a steal).

---

## Self-Review

**Spec coverage:**
- 21-topic taxonomy + retire GPT topics → Tasks 2, 5. ✓
- definition→term questions + metadata + term_key → Task 1, 5. ✓
- Multi-home duplicate rows → Task 5 (insert per topic CSV). ✓
- Topic co-ownership → Tasks 2 (map), 3 (index), 5 (assignments), 6/7 (derivation/scoring). ✓
- session_questions.owners[] + term_key grouping → Tasks 3, 6, 9. ✓
- Weighted scoring (both view + TS) → Tasks 3, 7. ✓
- Back-compat fallback (owners empty → assigned_to) → Tasks 3, 8. ✓
- Retire-not-delete reset, clear SRS, keep sessions → Tasks 3, 5. ✓
- Active-topic filtering → Task 8 (setup); drill already scopes by active assignment. ✓
- UI owners → Task 10. ✓
- Tests: glossary-csv, constants, glossary-import, session-pool, scoring → Tasks 1,2,5,6,7. ✓

**Placeholder scan:** No TBD/TODO; each code step shows real code. The one runtime fallback `termKey ?? question.id` (Task 9) is intentional (ungrouped when null) and documented.

**Type consistency:** `owners: string[]` is consistent across `ScoredSessionQuestion` (Task 7), `EligibleSessionQuestion` (Task 6), `session_questions.owners` (Task 3), `QuizSessionQuestion.owners` (Task 8), and the start-route insert (Task 9). `TOPIC_OWNERS` (Record<string,string[]>) is used consistently in Tasks 2, 5, and the excel.ts patch. `SessionPoolQuestion.termKey` flows from Task 6 into the Task 9 query.
