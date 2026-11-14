# prisma/ — schema & data

- Never hand-edit a migration file that's already been applied — generate a new one instead: `npx prisma migrate dev --name <description>`.
- `RewardRate` and `BbcConversionRate` rows are inserted, never mutated in place, once any real transaction may reference them. Changing a value means closing the current row's `effectiveTo` and creating a new row — see how `/api/admin/reward-rates` does it if you're adding a similar endpoint elsewhere.
- Adding a new waste category, location, collection point, or organization should never require an application code change — if it does, a lookup table is missing somewhere and that's the actual bug to fix.
- Run `npx prisma generate` after any `schema.prisma` change, then `npm run typecheck`, before considering the change done. This project's dev sandbox couldn't reach `binaries.prisma.sh` to do this itself — don't assume it was done for you.
- `seed.ts` documents which values are real (sourced, dated) versus dummy/placeholder in comments next to each one. Keep that distinction explicit when adding new seed data — an undocumented placeholder is how a demo number ends up quoted as a real one later.
