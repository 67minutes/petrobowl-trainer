# PetroBowl Trainer

Web training system for the SPE ITB PetroBowl delegation. It replaces the weekly Excel randomizer/scoring workflow with:

- solo spaced-repetition drills for assigned topics,
- admin-controlled question import and topic ownership,
- quizmaster-led buzzer sessions using buzzin.live for the actual buzzers,
- scoring and analytics that connect missed buzzer questions back into solo drills.

The build follows [SPEC.md](./SPEC.md).

## Stack

- Next.js 15 App Router
- TypeScript
- Tailwind CSS
- Supabase PostgreSQL, Auth, RLS, and serverless API routes

## Project Layout

```text
src/app/            Next.js routes and API handlers
src/components/     Reusable app UI
src/lib/            SM-2, scoring, randomizer, Supabase, import logic
src/types/          Shared TypeScript types
supabase/           Database migration
scripts/            CLI helpers for workbook import
examples/           Reference Excel files
```

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Fill `.env.local` with Supabase credentials:

```text
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Run `supabase/migrations/0001_initial_schema.sql` in Supabase SQL editor, then import the question bank.

## Importing Questions

Dry-run the parser against the reference workbook:

```bash
npm run import:dry-run
```

Import to Supabase after configuring `.env.local`:

```bash
npm run import:questions
```

The importer detects column roles from headers, handles answer-first sheets, skips metadata sheets, strips numbered term prefixes, and preserves extra columns such as `The Prize` chapter/page metadata.

## Verification

```bash
npm run typecheck
npm run test
npm run build
```
