# BlueLoop — Backend Setup

Full product/architecture context lives in `BlueLoop_PRD_and_Architecture.md`. This is just "how to get the API running." If you're working with Kilo Code (or another AGENTS.md-compatible agent), it reads `AGENTS.md` automatically — that's the codebase-organization reference; this README is the human-facing setup steps.

## 1. Install dependencies

```bash
npm install
```

## 2. Configure environment

```bash
cp .env.example .env
```

Fill in:
- `DATABASE_URL` — a Postgres connection string (Supabase, Neon, Railway, or local Postgres all work)
- `SESSION_SECRET` — generate a real one: `openssl rand -base64 32`

## 3. Generate the Prisma client and create the database schema

```bash
npx prisma generate
npx prisma migrate dev --name init
```

> **Note on where this was built:** the sandbox this project was scaffolded in blocks outbound requests to `binaries.prisma.sh`, which `prisma generate` needs to download its query engine. That means `prisma generate` and a full `tsc` typecheck couldn't be run to completion in that environment — every route was written and manually cross-checked against `schema.prisma` (model names, field names, enum values, relation names), but hasn't had a compiler confirm it yet. Run `npx prisma generate` followed by `npm run typecheck` as your first step on a machine with normal internet access (your laptop, Vercel, GitHub Actions — this is purely a restriction of that one sandboxed container, not a real-world constraint) and fix anything that surfaces before you trust this as "done."

## 4. Seed demo data

```bash
npm run db:seed
```

Creates: Eleko Beach location, 8 waste categories, the BBC→NGN peg (0.45), reward rates (real figures for PET/HDPE/aluminum, dummy for the rest — see `prisma/seed.ts` header), one demo collection point, and four demo accounts (operator, admin, participant, recycler) all sharing the password printed at the end of the seed script.

## 5. Run it

```bash
npm run dev
```

API is served from `/api/*` — see `BlueLoop_PRD_and_Architecture.md` §7 for the route list, or browse `src/app/api/` directly; the routes are organized to mirror that list one-to-one.

## What's implemented

Auth (register/login/logout, RBAC), the collection submission → verify/reject → reward flow, the BlueBank reward engine (with a full unit test suite — see below), admin reward-rate versioning, transaction reversal, collection-point and recycling-partner directories with admin approval, material transfers with an inventory-availability check, and the analytics summary endpoint.

## Anomaly flags and review queue

`POST /api/collections` flags unusual submissions (over 100 kg, 6th+ in 24h, same point/material/weight within an hour) via `src/lib/fraud/anomaly.ts`. Flagged items are still accepted. Operators and admins see them in `GET /api/collections?collection_point_id=…&flagged=true` (participant phone numbers masked to the last four digits). Thresholds are starting points to tune with pilot data.

## Running tests

```bash
npm test
```

`anomaly.test.ts` covers the flag rules. `rewardEngine.test.ts` covers reward calculation, bonus stacking, every failure path (invalid weight, not found, already processed, unscoped operator, no active rate/peg), and full transaction reversal. It mocks `@prisma/client`'s enums directly, so — unlike the rest of this project in this particular sandbox — it runs with no database and no `prisma generate` step needed. Nothing else has automated coverage yet; next in line per `AGENTS.md` is the idempotency-key path on collection submission and the verify/reject routes themselves.

## What's not implemented yet

- No frontend in this repo — wire it up to whatever UI you've built separately.
- No hard rate limiting on submissions. Anomaly *flagging* exists (see below) but only informs review.
- Run `npx prisma migrate dev` after pulling: the `Collection.flagged` / `flagReason` columns are new.
- No BBC→NGN redemption/cash-out endpoint (deliberately deferred — see PRD §9a and §19 on the regulatory question).
- No automated coverage yet on the route handlers themselves (auth, collections, transfers, admin) — only the reward engine has tests so far, since it's the highest-consequence and most isolated piece.
