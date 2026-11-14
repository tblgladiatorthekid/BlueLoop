import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";

/**
 * rewardEngine.ts imports CollectionStatus/TransactionStatus from
 * "@prisma/client" as real runtime values, not just types. That module is
 * normally produced by `prisma generate`, which needs network access this
 * project's dev sandbox didn't have (see AGENTS.md). Mocking it here means
 * this suite — covering the highest-consequence logic in the codebase —
 * runs anywhere, immediately, with no database and no generate step. Keep
 * these values in sync with the real enums in schema.prisma; a mismatch
 * here would make a test lie about what the real engine does.
 */
vi.mock("@prisma/client", () => ({
  PrismaClient: class {},
  CollectionStatus: {
    PENDING: "PENDING",
    VERIFIED: "VERIFIED",
    REJECTED: "REJECTED",
    CANCELLED: "CANCELLED",
  },
  TransactionStatus: {
    PENDING: "PENDING",
    COMPLETED: "COMPLETED",
    REVERSED: "REVERSED",
  },
}));

const { verifyCollectionAndReward, reverseRewardTransaction, bbcToNgn, RewardEngineError } = await import(
  "./rewardEngine"
);

// Minimal stand-in for Prisma.TransactionClient — only the methods
// rewardEngine.ts actually calls. Each is a vi.fn() so individual tests can
// set return values without a real database.
function createFakeTx() {
  return {
    collection: { findUnique: vi.fn(), update: vi.fn() },
    collectionPointOperator: { findFirst: vi.fn() },
    rewardRate: { findMany: vi.fn() },
    bbcConversionRate: { findFirst: vi.fn() },
    bonusCampaign: { findMany: vi.fn() },
    rewardTransaction: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    participantBalance: { upsert: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
  };
}
type FakeTx = ReturnType<typeof createFakeTx>;

/** $transaction just runs the callback against our fake tx — no real
 * transaction semantics, which is correct for unit-testing the business
 * logic in isolation. Integration tests against a real Postgres instance
 * are a separate, complementary thing to add later, not a replacement. */
function fakePrisma(tx: FakeTx): PrismaClient {
  return { $transaction: (cb: (tx: FakeTx) => unknown) => cb(tx) } as unknown as PrismaClient;
}

const baseCollection = {
  id: "col_1",
  status: "PENDING",
  collectionPointId: "cp_1",
  wasteCategoryId: "wc_pet",
  participantId: "user_participant",
  collectionPoint: { locationId: "loc_eleko" },
};

const activeRate = { id: "rate_1", ratePerKgBbc: 1150, locationId: null, effectiveTo: null };
const activePeg = { id: "peg_1", ngnPerBbc: 0.45 };

describe("verifyCollectionAndReward", () => {
  let tx: FakeTx;

  beforeEach(() => {
    tx = createFakeTx();
    tx.collection.findUnique.mockResolvedValue(baseCollection);
    tx.collectionPointOperator.findFirst.mockResolvedValue({ id: "cpo_1", status: "ACTIVE" });
    tx.rewardRate.findMany.mockResolvedValue([activeRate]);
    tx.bbcConversionRate.findFirst.mockResolvedValue(activePeg);
    tx.bonusCampaign.findMany.mockResolvedValue([]); // no active campaigns by default
    tx.collection.update.mockImplementation(({ data }: any) => ({ ...baseCollection, ...data }));
    tx.rewardTransaction.create.mockImplementation(({ data }: any) => ({ id: "rt_1", ...data }));
  });

  it("calculates the reward as verified weight × active rate with no bonuses", async () => {
    const result = await verifyCollectionAndReward(fakePrisma(tx), {
      collectionId: "col_1",
      operatorId: "op_1",
      verifiedWeightKg: 2,
    });

    expect(result.rewardTransaction.amountBbc).toBe(2 * 1150);
    expect(tx.collection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "col_1" },
        data: expect.objectContaining({ status: "VERIFIED", verifiedWeightKg: 2, operatorId: "op_1" }),
      })
    );
    expect(tx.participantBalance.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { participantId: "user_participant" },
        create: expect.objectContaining({ balanceBbc: 2300 }),
        update: { balanceBbc: { increment: 2300 } },
      })
    );
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it("applies a MULTIPLIER bonus campaign on top of the base rate", async () => {
    tx.bonusCampaign.findMany.mockResolvedValue([{ bonusType: "MULTIPLIER", value: 2 }]);

    const result = await verifyCollectionAndReward(fakePrisma(tx), {
      collectionId: "col_1",
      operatorId: "op_1",
      verifiedWeightKg: 2,
    });

    expect(result.rewardTransaction.amountBbc).toBe(2 * 1150 * 2);
  });

  it("adds a FLAT_BBC bonus after the multiplier", async () => {
    tx.bonusCampaign.findMany.mockResolvedValue([
      { bonusType: "MULTIPLIER", value: 2 },
      { bonusType: "FLAT_BBC", value: 50 },
    ]);

    const result = await verifyCollectionAndReward(fakePrisma(tx), {
      collectionId: "col_1",
      operatorId: "op_1",
      verifiedWeightKg: 2,
    });

    expect(result.rewardTransaction.amountBbc).toBe(2 * 1150 * 2 + 50);
  });

  it("rejects a zero or negative weight before touching the database", async () => {
    await expect(
      verifyCollectionAndReward(fakePrisma(tx), { collectionId: "col_1", operatorId: "op_1", verifiedWeightKg: 0 })
    ).rejects.toMatchObject({ code: "INVALID_WEIGHT" });
    expect(tx.collection.findUnique).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND when the collection doesn't exist", async () => {
    tx.collection.findUnique.mockResolvedValue(null);
    await expect(
      verifyCollectionAndReward(fakePrisma(tx), { collectionId: "missing", operatorId: "op_1", verifiedWeightKg: 2 })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuses to re-verify a collection that isn't PENDING", async () => {
    tx.collection.findUnique.mockResolvedValue({ ...baseCollection, status: "VERIFIED" });
    await expect(
      verifyCollectionAndReward(fakePrisma(tx), { collectionId: "col_1", operatorId: "op_1", verifiedWeightKg: 2 })
    ).rejects.toMatchObject({ code: "ALREADY_PROCESSED" });
    expect(tx.rewardTransaction.create).not.toHaveBeenCalled();
  });

  it("refuses an operator who isn't scoped to this collection point", async () => {
    tx.collectionPointOperator.findFirst.mockResolvedValue(null);
    await expect(
      verifyCollectionAndReward(fakePrisma(tx), { collectionId: "col_1", operatorId: "unscoped_op", verifiedWeightKg: 2 })
    ).rejects.toMatchObject({ code: "OPERATOR_NOT_SCOPED" });
    expect(tx.rewardTransaction.create).not.toHaveBeenCalled();
  });

  it("refuses to verify when no reward rate is configured for the material", async () => {
    tx.rewardRate.findMany.mockResolvedValue([]);
    await expect(
      verifyCollectionAndReward(fakePrisma(tx), { collectionId: "col_1", operatorId: "op_1", verifiedWeightKg: 2 })
    ).rejects.toMatchObject({ code: "NO_ACTIVE_REWARD_RATE" });
  });

  it("refuses to verify when no BBC→NGN conversion rate is configured", async () => {
    tx.bbcConversionRate.findFirst.mockResolvedValue(null);
    await expect(
      verifyCollectionAndReward(fakePrisma(tx), { collectionId: "col_1", operatorId: "op_1", verifiedWeightKg: 2 })
    ).rejects.toMatchObject({ code: "NO_ACTIVE_CONVERSION_RATE" });
  });

  it("every thrown error is a RewardEngineError, so apiErrorResponse can map it correctly", async () => {
    tx.collection.findUnique.mockResolvedValue(null);
    try {
      await verifyCollectionAndReward(fakePrisma(tx), { collectionId: "x", operatorId: "op_1", verifiedWeightKg: 1 });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(RewardEngineError);
    }
  });
});

describe("reverseRewardTransaction", () => {
  let tx: FakeTx;
  const completedTransaction = {
    id: "rt_1",
    status: "COMPLETED",
    amountBbc: 2300,
    collectionId: "col_1",
    participantId: "user_participant",
  };

  beforeEach(() => {
    tx = createFakeTx();
    tx.rewardTransaction.findUnique.mockResolvedValue(completedTransaction);
    tx.rewardTransaction.update.mockImplementation(({ data }: any) => ({ ...completedTransaction, ...data }));
  });

  it("reverses a completed transaction, decrements the balance, and cancels the collection", async () => {
    const result = await reverseRewardTransaction(fakePrisma(tx), {
      transactionId: "rt_1",
      adminId: "admin_1",
      reason: "duplicate submission",
    });

    expect(result.status).toBe("REVERSED");
    expect(tx.participantBalance.update).toHaveBeenCalledWith({
      where: { participantId: "user_participant" },
      data: { balanceBbc: { decrement: 2300 } },
    });
    expect(tx.collection.update).toHaveBeenCalledWith({
      where: { id: "col_1" },
      data: { status: "CANCELLED" },
    });
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it("throws NOT_FOUND for an unknown transaction", async () => {
    tx.rewardTransaction.findUnique.mockResolvedValue(null);
    await expect(
      reverseRewardTransaction(fakePrisma(tx), { transactionId: "missing", adminId: "admin_1", reason: "x" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuses to reverse a transaction that was already reversed", async () => {
    tx.rewardTransaction.findUnique.mockResolvedValue({ ...completedTransaction, status: "REVERSED" });
    await expect(
      reverseRewardTransaction(fakePrisma(tx), { transactionId: "rt_1", adminId: "admin_1", reason: "x" })
    ).rejects.toMatchObject({ code: "ALREADY_REVERSED" });
    expect(tx.participantBalance.update).not.toHaveBeenCalled();
  });
});

describe("bbcToNgn", () => {
  it("multiplies the BBC amount by the given peg", () => {
    expect(bbcToNgn(1000, 0.45)).toBe(450);
  });

  it("is a pure display calculation — it never gets called with a stored peg other than what's passed in", () => {
    // Regression guard: the ledger stores ngnPegAtCreate per-transaction
    // specifically so display conversions can't silently use today's peg
    // for a historical transaction. This test just pins the function's
    // contract: it trusts its caller for which peg to use.
    expect(bbcToNgn(100, 1)).toBe(100);
  });
});
