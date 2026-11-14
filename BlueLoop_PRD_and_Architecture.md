# BlueLoop — Product Requirements & Technical Architecture

**Pilot site:** Eleko Beach, Lagos, Nigeria
**Context:** Protego Blue Innovation Challenge Hackathon
**Status:** Pre-implementation review draft — not yet built

---

## 1. Product Requirements Summary

BlueLoop is a software-first coordination platform that connects three groups who currently operate without shared infrastructure: people who recover recyclable marine litter, collection points that verify and aggregate it, and recycling partners who receive it. BlueBank is the incentive/transaction layer inside BlueLoop, not a separate product.

**The question this MVP must answer:** can a digital platform incentivize, coordinate, and verifiably track community-based recovery of marine litter, end to end from collection to recycling handoff?

**Non-goals for MVP:** physical interception hardware, AI/CV waste classification, predictive hotspot modeling, payment-system integration, multi-region deployment. These are roadmap, not MVP.

---

## 2. MVP Scope

| In scope (build this) | Out of scope (roadmap) |
|---|---|
| Participant registration & profile | Native mobile apps (PWA only) |
| Collection point registration & discovery | Real-money payout / mobile money integration |
| Waste submission + categorization + weight recording | Computer-vision material classification |
| Operator-side verification workflow | Predictive/GIS hotspot modeling |
| BlueBank reward engine (server-side, configurable rates) | IoT-enabled weighing hardware |
| Reward balance + collection history | Physical drainage/waterway interception |
| Recycling partner records + transfer confirmation | Automated EPR reporting |
| Basic impact dashboard (org + participant level) | Corporate sustainability integrations |
| Eleko Beach location/hotspot data (as data, not hardcoded logic) | Multi-region admin hierarchies |
| Admin controls (users, collection points, reward rates, categories) | Sophisticated fraud-detection ML |

Every "in scope" item maps directly to the Recover → Verify → Reward → Record → Aggregate → Recycle → Measure loop. Nothing is in the MVP that doesn't serve that loop.

---

## 3. User Stories by Role

**Participant / Collector**
- As a participant, I can register with just a phone number so the barrier to joining is low.
- As a participant, I can see my BlueBank balance at a glance on login.
- As a participant, I can find the nearest active collection point.
- As a participant, I can view my collection history and what each submission earned.
- As a participant, I can see my status update from *pending* to *verified* without needing to ask the operator.

**Collection Point Operator**
- As an operator, I can log in and record a collection for a participant in under a minute.
- As an operator, I can select material type and enter verified weight without free-text errors.
- As an operator, I can see my point's accumulated, unshipped inventory by material.
- As an operator, I cannot alter reward amounts — the system calculates them.

**Recycling Partner**
- As a recycling partner, I can see what material is available for pickup from which points.
- As a recycling partner, I can confirm receipt of a transfer, which closes the loop for that material.
- As a recycling partner, I can specify which materials my organization accepts.

**Administrator**
- As an admin, I can approve or suspend collection points and recycling partners.
- As an admin, I can configure reward rates per material without a code deploy.
- As an admin, I can reverse a fraudulent transaction with a full audit trail.
- As an admin, I can see system-wide totals: kg recovered, active participants, rewards paid.

---

## 4. Core User Flows

**Flow A — Collection & Reward (the demo spine)**
Participant arrives at collection point → operator authenticates → operator identifies participant (phone lookup or QR) → operator selects material + enters weight → submission created as `pending` → operator confirms → status becomes `verified` → reward engine calculates amount server-side → `reward_transaction` created → participant balance updates → dashboard totals update.

**Flow B — Recycling Handoff**
Collection point accumulates verified material → operator initiates a transfer to a recycling partner → partner receives and confirms → transfer status becomes `confirmed` → this is the only point at which material counts as "reached recycling," never assumed automatically from collection.

**Flow C — Admin Reward Configuration**
Admin sets/updates a reward rate for a material (optionally scoped to a location or time window) → rate is versioned, not overwritten → future verifications use the active rate at verification time → historical transactions remain tied to the rate that was active when they occurred.

---

## 5. Technical Architecture

**Pattern:** Server-rendered/PWA web app with a thin API layer, single relational database, no microservices. A hackathon pilot does not need distributed architecture — it needs one deployable unit that's easy to reason about and hard to cheat.

```
[ Browser / PWA — participants, operators, admins, partners ]
              |
    [ Next.js app: pages + API routes ]
              |
   [ Server-side business logic layer ]
    - reward calculation (never client-trusted)
    - verification state machine
    - audit logging
              |
      [ PostgreSQL (single DB) ]
              |
   [ Object storage — evidence photos ]
```

Multi-location scalability comes from **locations, collection points, organizations, waste categories, and reward rates all being rows, not code.** Eleko Beach is a `locations` row with `region = "Lagos"`; adding a second pilot city is a data operation, not a deploy.

---

## 6. Database Schema / Entity Model

| Entity | Key fields | Notes |
|---|---|---|
| `users` | id, name, phone, email, password_hash, role, status, created_at | role ∈ {participant, operator, recycler, admin} |
| `locations` | id, name, region, country, lat, lng, status | Eleko Beach = one row |
| `collection_points` | id, location_id, name, lat, lng, address, status, operating_hours | accepted materials via join table |
| `collection_point_materials` | collection_point_id, waste_category_id | many-to-many |
| `collection_point_operators` | user_id, collection_point_id, status | operators can be linked to >1 point |
| `organizations` | id, name, type (recycling_partner/sponsor), contact_info, status | |
| `org_accepted_materials` | organization_id, waste_category_id | |
| `waste_categories` | id, name, code, is_recyclable, active | admin-editable, no code changes needed |
| `reward_rates` | id, waste_category_id, location_id (nullable), rate_per_kg_bbc, effective_from, effective_to, created_by | versioned, never overwritten; denominated in BBC |
| `bbc_exchange_rates` | id, ngn_per_bbc, effective_from, effective_to, created_by | versioned peg (pilot value: 0.45); same pattern as reward_rates |
| `bonus_campaigns` | id, name, waste_category_id (nullable), location_id (nullable), bonus_type, value, start_date, end_date, active | optional multipliers |
| `collections` | id, participant_id, collection_point_id, waste_category_id, submitted_weight, verified_weight, status, operator_id, evidence_url, lat, lng, created_at, verified_at | status ∈ {pending, verified, rejected, cancelled} |
| `reward_transactions` | id, collection_id, participant_id, amount_bbc, ngn_peg_at_creation, status, created_at, reversed_at, reversed_by, reversal_reason | append-only ledger — reversals are new rows, never deletes |
| `participant_balances` | participant_id, balance_bbc, updated_at | cached/derived from ledger; NGN equivalent computed at read time from current peg, not stored |
| `material_transfers` | id, collection_point_id, organization_id, waste_category_id, weight, status, transferred_at, confirmed_at, confirmed_by | tracks collection → recycling handoff |
| `audit_logs` | id, actor_id, action, entity_type, entity_id, before_state, after_state, timestamp, ip_address | every state-changing admin/operator action |

Reward ledger and `collections` are treated as high-integrity, append-only tables — updates happen via new rows with status transitions, not in-place mutation of history.

---

## 7. API / Domain Model (representative endpoints)

```
POST   /api/auth/register
POST   /api/auth/login
GET    /api/participants/me/balance
GET    /api/participants/me/history

GET    /api/collection-points?location_id=
POST   /api/collections                 (operator creates, status=pending)
POST   /api/collections/:id/verify      (operator confirms → triggers reward)
POST   /api/collections/:id/reject

POST   /api/transfers                   (collection point → recycling partner)
POST   /api/transfers/:id/confirm       (partner confirms receipt)

GET    /api/admin/reward-rates
POST   /api/admin/reward-rates
POST   /api/admin/transactions/:id/reverse

GET    /api/analytics/summary?location_id=&from=&to=
```

All mutation endpoints enforce role checks server-side. No endpoint accepts a client-supplied reward amount.

---

## 8. Authentication & Authorization Model

- **Auth:** phone-number-first registration (email optional), since phone is the more universal identifier in this user base. OTP or password-based, session via HTTP-only cookies or short-lived JWT.
- **Authorization:** role-based access control (RBAC) with four roles. Middleware on every API route checks role before touching business logic — not just hiding UI elements.
- **Operator-specific:** operators are additionally scoped to specific `collection_point_id`s via the join table, so an operator at Point A cannot verify submissions at Point B unless explicitly authorized.
- **Admin actions** (reward rate changes, reversals, approvals) require the `admin` role and are always written to `audit_logs`.

---

## 9. BlueBank Reward & Transaction Model

Reward = `verified_weight × active_rate_for(material, location, date)` + any active bonus campaign, **calculated server-side at verification time, never trusted from the client.**

**Currency unit:** rewards are denominated natively in **BBC (BlueBank Credit)**, not NGN. Material reward rates (Section 6) are stored in BBC per kg. This keeps the reward engine independent of currency fluctuation and keeps the door open to future non-NGN pilots.

**NGN conversion:** the pilot peg is **1 BBC = 0.45 NGN**. Like reward rates, this peg is stored as versioned configuration data (`effective_from`/`effective_to`), never hardcoded — a future peg change shouldn't require a deploy, and it shouldn't silently rewrite what a past transaction was worth. Every `reward_transaction` captures the peg that was active at creation time, so a participant's earning history reflects the rate they actually earned at, even if the peg moves later. The balance screen shows the BBC total plus a live NGN-equivalent computed from the *current* peg — those are two different numbers for a reason, and the UI should label them as such rather than implying the NGN figure is locked in.

**Redemption is explicitly out of MVP scope.** The MVP shows the balance and its NGN equivalent; it does not implement an actual cash-out/withdrawal mechanism (bank transfer, mobile money agent, etc.). Converting BBC into a real, withdrawable payout is a materially different feature with its own compliance surface (see Section 19) and belongs on the roadmap, not the pilot.

Every transaction has: unique ID, participant, collection point, material, verified weight, amount (BBC), NGN peg at creation, timestamp, operator, verification status, optional evidence reference, and audit trail. Rates are versioned (`effective_from`/`effective_to`) so historical transactions stay tied to the rate that produced them, even after admins change current rates.

Reversals are **compensating entries**, not deletions — a reversed transaction keeps its original row and gets a linked reversal row, preserving a complete, auditable history. Idempotency keys prevent a flaky connection from creating duplicate submissions on retry.

### Pilot Reward Rate Defaults (seeded, not hardcoded)

Grounded in current Lagos market figures where available; everything else is an explicit placeholder. These are **starting values in the `reward_rates` table** — an admin can change them without a deploy. Updated against fresher reporting than the original draft (previous PET figure was from a late-2023 source and understated the current market by roughly 5x — Lagos scrap prices have moved a lot with naira depreciation since then).

| Material | Pilot rate | Basis | Confidence |
|---|---|---|---|
| PET bottles | 267 BBC/kg (≈₦120) | Payout benchmarked to Ecobarter’s quoted ~₦120/kg for bottles (team notes, **unverified**). Recyclers pay ₦520–₦620/kg for clean PET (Nairametrics, Jul 2025), so this leaves a margin to fund operations | Benchmark unverified; recheck before launch |
| Aluminum (cans) | 800 BBC/kg (≈₦360) | Benchmarked to Ecobarter’s quoted ~₦360/kg for cans (team notes, **unverified**). Lagos scrap buyers quote aluminum at ₦1,800–₦3,000/kg (V-Martins Recycling, Apr 2026) | Benchmark unverified; recheck before launch |
| HDPE | 267 BBC/kg (≈₦120) | **Assumption:** set equal to PET (Ecobarter’s general plastic rate). Collectors report HDPE buy-in of ₦300–₦350/kg (Nairametrics, Jul 2025) | Assumption, no HDPE-specific competitor figure |
| Plastic bags/nylon, food packaging, fishing-related plastics, other recyclable | illustrative demo values only | Not researched | Dummy — for demo flow only |
| Non-recyclable | 0 BBC/kg | Logged for volume/hotspot tracking, no reward | — |

Rates were recalibrated from recycler buy-in prices (₦520/kg PET, ₦1,800/kg aluminum) down to competitor-benchmarked payouts, because paying collectors what recyclers pay leaves no margin for operations. The margin is a business decision, not something the research settles: change any rate live via `POST /api/admin/reward-rates` without a deploy. Metal scrap (wire/mesh) and polystyrene (Styrofoam) exist as **inactive** categories with no rate until a buyer is confirmed.

---

## 10. Verification & Anti-Fraud Model

States: `pending → verified | rejected`, plus `cancelled` for operator/admin-initiated reversal.

MVP-appropriate controls (deliberately simple, not AI-driven):
- Operator must be authenticated and scoped to the collection point.
- Reward is calculated only on `verified` status, never on `pending`.
- Rate limiting: flag if the same participant submits an unusually high weight or frequency in a short window (simple threshold, admin-reviewed — not an ML model).
- Optional photo evidence, stored but not required to block the flow (connectivity realism).
- All verification and reversal actions are logged with actor, timestamp, and before/after state.
- Duplicate prevention via idempotency key on submission.

Operator–participant collusion is a real residual risk this doesn't eliminate — it's mitigated by audit visibility and admin spot-review, not solved outright. That's an honest limitation to state to judges, not paper over.

---

## 11. Analytics & Impact Model

Metrics are computed from the ledger and `collections`/`transfers` tables directly — not hand-calculated in the frontend — so numbers stay trustworthy under scrutiny:

- kg recovered (total, by category, by location, over time)
- kg transferred to recycling partners vs. kg merely collected (kept explicitly distinct — never conflated)
- active participants (unique participants with ≥1 verified collection in period)
- collection points active, and volume per point
- total rewards paid, reward cost per kg
- recurring collection hotspots (aggregated by collection point / coordinates, not per-individual tracking)

For MVP: simple aggregation queries or a Postgres materialized view refreshed periodically. No real-time analytics engine needed at pilot scale.

---

## 12. Technology Stack & Justification

| Layer | Recommendation | Why |
|---|---|---|
| Frontend + API | Next.js (TypeScript), PWA-enabled | One deployable unit, fast to build, mobile-first, offline-capable via service worker |
| Styling | Tailwind CSS | Fast, consistent, no design-system overhead for a hackathon timeline |
| Database | PostgreSQL | Relational integrity matters for a financial-ish ledger; strong constraint/transaction support |
| ORM | Prisma | Type-safe queries, fast schema iteration, parameterized queries by default (SQL-injection safe) |
| Hosted Postgres + Auth + Storage | Supabase | Managed Postgres, built-in phone/email auth, object storage for evidence photos — cuts weeks of infra work |
| Deployment | Vercel (app) + Supabase (data/infra) | Low cost, minimal ops, fast redeploys during hackathon iteration |

**Trade-off worth naming:** leaning on Supabase for auth/storage speeds delivery but can read as "the BaaS did the work." The mitigation is to keep all reward calculation, verification state transitions, and fraud checks as explicit, hand-written server-side logic in the Next.js API layer — Supabase provides infrastructure, your code provides the product logic judges are evaluating.

If your team already has committed experience in a different stack (e.g., Express + separate React app), that's a valid substitute — don't switch frameworks purely for this recommendation if something else is already working.

---

## 13. Deployment Architecture

- **App:** Vercel, auto-deploy from main branch, environment secrets in Vercel project settings (never in code).
- **Database:** Supabase-managed Postgres, daily backups enabled.
- **Storage:** Supabase Storage bucket for evidence photos, access-controlled.
- **Environments:** at minimum `staging` and `production` — verify reward-calculation changes in staging before they touch the live pilot ledger.

---

## 14. Security Considerations

- Passwords hashed (bcrypt/argon2) or delegated entirely to Supabase Auth.
- All mutation endpoints re-check role and scope server-side, regardless of what the UI shows.
- Input validation (e.g., zod schemas) on every API route.
- Reward amounts, verification status, and transaction state are **never** accepted as client input — always derived server-side.
- Audit logging on all admin and verification actions.
- HTTPS enforced everywhere; secrets only in environment variables.
- Rate limiting on auth and submission endpoints.

---

## 15. Field-Testing Strategy — Eleko Beach

- Pilot with a small, known group first (e.g., 1–2 collection points, a handful of participants) before wider rollout.
- Test on actual phones under real network conditions at the beach — don't assume office wifi represents the field.
- Build a minimal offline-tolerant flow: if a submission can't reach the server, queue it locally and retry with a visible "pending sync" state, rather than losing it or blocking the operator.
- Run a short in-person training session with operators — the workflow only earns "under a minute" if operators know it cold.
- Track transaction failure rate and verification time during the pilot as leading indicators, not just kg recovered.

---

## 16. MVP Development Phases

1. **Phase 0 — Setup:** repo, Next.js + Prisma + Supabase wiring, auth scaffold.
2. **Phase 1 — Core entities:** users, locations, collection points, waste categories, roles.
3. **Phase 2 — Collection flow:** submission creation, operator verification UI, status states.
4. **Phase 3 — BlueBank engine:** reward rates, server-side calculation, ledger, balance display.
5. **Phase 4 — Dashboards:** participant history/balance view, admin summary dashboard.
6. **Phase 5 — Recycling handoff:** transfer creation and partner confirmation.
7. **Phase 6 — Admin controls + audit logging + hardening.**
8. **Phase 7 — Field test at Eleko Beach + demo rehearsal.**

---

## 17. Hackathon Demo Plan (5–7 min)

1. Participant logs in, shows current BlueBank balance.
2. Operator logs in at a collection point, looks up the participant.
3. Operator records material type + weight, submits.
4. Verification confirmed live — reward calculates automatically.
5. Cut back to participant view: balance updated in real time.
6. Show collection point's accumulated inventory.
7. Show a transfer to a recycling partner being confirmed.
8. Close on the admin dashboard: total kg recovered, active participants, rewards paid — the full loop, told as one story: *person → waste → verification → reward → recycling → measurable impact.*

---

## 18. Post-MVP Scalability Roadmap

**BBC-to-NGN redemption/cash-out flow** (withdrawal via bank transfer or mobile money agent) → GIS hotspot analysis and predictive accumulation modeling → computer-vision-assisted material classification → automated collection-point recommendations → broader mobile-money/payment integration → IoT-enabled weighing and collection infrastructure → physical drainage/waterway interception (informed by BlueLoop's own data) → EPR reporting → corporate sustainability dashboards → municipal/recycler API integrations. None of these belong in the MVP; the schema and architecture above are built so they can be added without a rewrite.

---

## 19. Risks, Assumptions & Open Questions

**Confirmed:**
- BlueBank rewards are non-cash **BBC credits**, pegged at **1 BBC = 0.45 NGN**, with the peg stored as versioned config rather than hardcoded, and eventual (not MVP) conversion to real money on the roadmap.
- Recycling partner is a **labeled placeholder** for now ("DEMO — Placeholder Recycling Partner"), not a real organization. This must stay visibly labeled as such everywhere it appears in the UI and demo — swapping in a real partner later is a data change, not a rebuild.
- Reward rates for PET and aluminum use real, sourced Lagos market figures (see Section 9); HDPE uses an unverified placeholder pending a real quote. All other materials use dummy demo values.

**Standing risks:**
- Because BBC is described as *eventually* convertible to real NGN, BlueBank may functionally resemble a stored-value/e-money system once redemption ships — that likely warrants a legal/regulatory review (e.g. CBN payment-service rules) before a real cash-out feature launches. Not a concern for the pilot itself, since MVP has no withdrawal path, but worth flagging early since it shapes how "eventual conversion" should be worded to participants now (a balance that *will* be convertible later carries different expectations than a points system that never will be).
- Connectivity at Eleko Beach is assumed to be intermittent, not validated on-site yet — affects how much offline-queueing effort is worth investing before the demo.
- Operator–participant collusion is a real residual fraud vector not fully solved by this MVP's controls, only partially mitigated.
- Literacy/technical-comfort levels of actual field operators are assumed, not confirmed — worth a quick reality check before finalizing the "under a minute" UX target.
