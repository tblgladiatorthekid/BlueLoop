# BlueLoop — Agent Instructions

This file is read automatically by Kilo Code at the start of every task. It covers **how this codebase is organized and what must never break** — not the product vision. For product/architecture reasoning (why BlueBank works the way it does, market-rate sourcing, roadmap, open regulatory questions), read `BlueLoop_PRD_and_Architecture.md` at the repo root first if you need that context.

## Project snapshot

BlueLoop coordinates marine-litter recovery (Eleko Beach, Lagos pilot). BlueBank (BBC) is its incentive/ledger layer — not a separate app. This repo is the **backend only**: Next.js API routes + Prisma. The UI is built and maintained elsewhere; don't add pages, components, or a frontend framework here.

## Stack

- Next.js 14 (App Router), TypeScript strict mode, API routes only.
- PostgreSQL via Prisma — `prisma/schema.prisma` is the single source of truth for the data model. If code and schema disagree, the schema is right and the code has a bug.
- zod for request validation, `jose` for session JWTs, `bcryptjs` for password hashing.
- No test framework is wired up yet — see "Testing priorities" before adding one ad hoc.

## Directory layout

```
prisma/
  schema.prisma        # data model — read before touching any route
  seed.ts              # demo data; comments document what's real vs. placeholder
src/
  lib/
    prisma.ts          # the ONE PrismaClient instance — always import from here, never `new PrismaClient()` elsewhere
    auth/
      password.ts      # hashing only
      session.ts       # JWT + cookie plumbing
      rbac.ts          # requireSession / requireRole / ApiError / apiErrorResponse — the RBAC gate for the whole API
    bluebank/
      rewardEngine.ts  # the reward/verification state machine — see its own AGENTS.md
  app/api/             # one route.ts per endpoint, kept thin — see "Route pattern"
```

## Non-negotiable invariants

These close specific fraud/integrity holes that were deliberately designed out. If a change would violate one of these, stop and flag it rather than working around it.

1. **Reward amounts are never client input.** They're computed exactly once, inside `rewardEngine.ts`, from the `RewardRate` active at verification time. No route should read an `amount`/`reward` field off a request body and trust it.
2. **The ledger is append-only.** `RewardTransaction` rows are never edited or deleted to "fix" something — a correction is a new linked reversal row (`reverseRewardTransaction`). Same principle for collection status changes: they go through `AuditLog`, not silent overwrites.
3. **Reward rates are versioned, not overwritten.** Changing a rate closes the old row's `effectiveTo` and inserts a new row with a new `effectiveFrom`. Never update `ratePerKgBbc` on an existing rate row in place.
4. **Every operator/recycler action is scoped, and scoping is checked server-side.** Operators via `CollectionPointOperator`, recyclers via `OrganizationMember`. Holding the `OPERATOR` or `RECYCLER` role is necessary but not sufficient — always also check the scoping join table.
5. **State transitions only move forward.** `Collection`: `PENDING → VERIFIED | REJECTED`, or `→ CANCELLED`. `MaterialTransfer`: `PENDING → CONFIRMED | CANCELLED`. Every route touching these checks current status before acting — copy that check, don't skip it.
6. **State-changing admin/operator actions write an `AuditLog` row in the same transaction as the change**, not as a follow-up call that could fail independently.

## Route pattern

Every `route.ts` follows this shape. Copy an existing one (e.g. `src/app/api/collections/[id]/reject/route.ts`) rather than inventing a new one:

```ts
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireRole(req, ["OPERATOR"]); // 1. who is this
    const body = someZodSchema.parse(await req.json());   // 2. validate input
    const result = await prisma.$transaction(async (tx) => { /* 3. do the thing, atomically */ });
    return NextResponse.json({ ... });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "VALIDATION_ERROR", message: "Invalid input.", issues: err.issues }, { status: 400 });
    }
    return apiErrorResponse(err); // 4. the one place that maps errors to status codes
  }
}
```

Anything more involved than a single write belongs in `src/lib/`, not inline in the route — `rewardEngine.ts` is the reference example of that split. A route file should be readable in one screen; if it isn't, the logic hasn't been extracted yet.

## Domain model cheat sheet

- `User.role` ∈ `PARTICIPANT / OPERATOR / RECYCLER / ADMIN`. Public `/api/auth/register` only ever creates `PARTICIPANT`; every other role is provisioned via `/api/admin/users`. Don't add a way to self-register as anything else.
- `Collection.verifiedWeightKg` is `null` until an operator verifies it — don't read it as though it's always populated.
- `RewardTransaction` is 1:1 with a `Collection` and is created only inside `verifyCollectionAndReward`.
- `BbcConversionRate` holds the BBC→NGN peg (currently 0.45), versioned like reward rates. There is **no redemption/cash-out endpoint** — that's deliberate pending a regulatory read (PRD §9a/§19). Don't add one without checking with the person first.
- `MaterialTransfer` available inventory is derived (verified collections minus already-transferred weight), computed in `getAvailableInventoryKg` in `src/app/api/transfers/route.ts`. If you need it elsewhere, import that logic rather than recomputing it inline — a second implementation is how these drift apart.

## What's real vs. placeholder right now

- Seeded PET, HDPE and aluminum payouts are benchmarked to competitor rates quoted in the team's notes (Ecobarter, ~₦120/kg bottles and ~₦360/kg cans, **unverified**), deliberately well below recycler buy-in prices to leave an operating margin. HDPE is an assumption. See `seed.ts` / `RewardRate.sourceNote`. Recheck before any real payout; admins change rates live via the API.
- `METAL_MESH` and `EPS` (Styrofoam) categories are seeded **inactive** with no reward rate until a buyer is confirmed. Don't activate or price them without that confirmation.
- Submissions are anomaly-flagged by `src/lib/fraud/anomaly.ts` (high weight, high frequency, possible duplicate). Flags inform review only; never use one to block a submission or a reward automatically.
- The seeded recycling partner has `isPlaceholder: true`. Never surface it in user-facing text as a real, onboarded partner.
- `prisma generate` has not yet been run against full internet access on this project (the environment it was scaffolded in couldn't reach `binaries.prisma.sh`). Don't assume the existing code compiles clean — run `npx prisma generate && npm run typecheck` before trusting any diff, including diffs you didn't write.

## Testing priorities

`rewardEngine.ts` has a full unit suite (`rewardEngine.test.ts`) covering reward calculation, bonus stacking, every failure path, and reversal — run it with `npm test`. It mocks `@prisma/client`'s enums directly, so it needs no database and no `prisma generate`; keep that mock in sync if you add a new status value to the schema. `src/lib/fraud/anomaly.ts` also has a pure unit suite. Next in priority per PRD §20: duplicate-submission prevention (the idempotency-key path in `POST /api/collections`) and the verify/reject route handlers themselves — those still only have the manual review this project shipped with, not an automated suite.

## What not to do

- Don't add a UI framework, CSS approach, or state-management library — there's no frontend in this repo.
- Don't introduce a second code path that can produce a `RewardTransaction`.
- Don't hardcode a reward rate, waste category, or location anywhere in application code — they're all data by design (PRD §7, §8, §11).
- Don't widen an RBAC or scoping check just to unblock a task. A role or scope that can't do something is usually intentional — ask before loosening it.
