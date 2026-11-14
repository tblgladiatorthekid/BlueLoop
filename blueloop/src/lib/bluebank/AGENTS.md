# bluebank/ — reward engine

This directory is the single source of truth for anything involving BBC rewards. If you're editing a route and find yourself wanting to compute or adjust a reward amount there, stop — that logic belongs here, behind `verifyCollectionAndReward` or `reverseRewardTransaction`, not duplicated at the call site.

Before changing this file:

- Both entry points must stay atomic — one `prisma.$transaction` per operation. A reward and its ledger row must never be able to exist in a half-written state, even if the process crashes mid-request.
- `RewardEngineError` codes are relied on by `apiErrorResponse()` in `src/lib/auth/rbac.ts` to choose HTTP status codes. If you add a new error code, update that mapping in the same change — a new code with no mapping falls through to a bare 500.
- Any new failure mode should throw `RewardEngineError`, not a plain `Error` or `ApiError`. API routes only catch `RewardEngineError` from this module specifically so its errors get the 400/403/404/409 treatment instead of looking like a server crash.
- Don't relax the operator-scoping check or the PENDING-only guard "temporarily" to make a test pass — those are the two controls standing between this function and being callable by an unscoped operator or on an already-settled collection.
- `rewardEngine.test.ts` mocks `@prisma/client`'s `CollectionStatus`/`TransactionStatus` enums by hand so this suite runs without a generated client or a database. If you add a new status value in `schema.prisma`, update the mock in the test file's `vi.mock("@prisma/client", ...)` block in the same change — otherwise the tests silently stop reflecting reality. Run `npm test` after any change here.
