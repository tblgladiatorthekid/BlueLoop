/**
 * BlueBank reward engine.
 *
 * This is the one place reward amounts get calculated. Nothing here ever
 * trusts a client-supplied amount — every number in a RewardTransaction is
 * derived server-side from the active RewardRate and BbcConversionRate at
 * the moment of verification.
 *
 * Callers: an API route like POST /api/collections/:id/verify should do
 * essentially nothing but auth/scope checks + call verifyCollectionAndReward().
 */

import { PrismaClient, CollectionStatus, TransactionStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";

export class RewardEngineError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "RewardEngineError";
  }
}

/** Looks up the reward rate active at `atDate` for a material, preferring a
 * location-specific rate over a global one if both exist. */
async function getActiveRewardRate(
  tx: Prisma.TransactionClient,
  wasteCategoryId: string,
  locationId: string,
  atDate: Date
) {
  const rates = await tx.rewardRate.findMany({
    where: {
      wasteCategoryId,
      effectiveFrom: { lte: atDate },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: atDate } }],
      AND: [{ OR: [{ locationId }, { locationId: null }] }],
    },
    orderBy: [{ locationId: "desc" }, { effectiveFrom: "desc" }], // location-specific wins, then most recent
  });

  if (rates.length === 0) {
    throw new RewardEngineError(
      "NO_ACTIVE_REWARD_RATE",
      `No active reward rate configured for waste category ${wasteCategoryId}. An admin must configure one before this material can be verified.`
    );
  }
  return rates[0];
}

async function getActiveConversionRate(tx: Prisma.TransactionClient, atDate: Date) {
  const rate = await tx.bbcConversionRate.findFirst({
    where: {
      effectiveFrom: { lte: atDate },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: atDate } }],
    },
    orderBy: { effectiveFrom: "desc" },
  });

  if (!rate) {
    throw new RewardEngineError(
      "NO_ACTIVE_CONVERSION_RATE",
      "No active BBC→NGN conversion rate configured."
    );
  }
  return rate;
}

async function getActiveBonusMultiplier(
  tx: Prisma.TransactionClient,
  wasteCategoryId: string,
  locationId: string,
  atDate: Date
): Promise<{ multiplier: number; flatBonusBbc: number }> {
  const campaigns = await tx.bonusCampaign.findMany({
    where: {
      active: true,
      startDate: { lte: atDate },
      endDate: { gte: atDate },
      AND: [
        { OR: [{ wasteCategoryId }, { wasteCategoryId: null }] },
        { OR: [{ locationId }, { locationId: null }] },
      ],
    },
  });

  let multiplier = 1;
  let flatBonusBbc = 0;
  for (const c of campaigns) {
    if (c.bonusType === "MULTIPLIER") multiplier *= Number(c.value);
    if (c.bonusType === "FLAT_BBC") flatBonusBbc += Number(c.value);
  }
  return { multiplier, flatBonusBbc };
}

/**
 * Verifies a pending collection and, if valid, creates the reward transaction
 * and updates the participant's cached balance — all inside one DB
 * transaction so a crash mid-way never leaves a half-rewarded state.
 *
 * Idempotent in effect: re-calling on an already-verified collection throws
 * rather than double-rewarding, because the status check happens inside the
 * same transaction as the write.
 */
export async function verifyCollectionAndReward(
  prisma: PrismaClient,
  params: {
    collectionId: string;
    operatorId: string;
    verifiedWeightKg: number;
  }
) {
  const { collectionId, operatorId, verifiedWeightKg } = params;

  if (verifiedWeightKg <= 0) {
    throw new RewardEngineError("INVALID_WEIGHT", "Verified weight must be greater than zero.");
  }

  return prisma.$transaction(async (tx) => {
    const collection = await tx.collection.findUnique({
      where: { id: collectionId },
      include: { collectionPoint: true },
    });
    if (!collection) throw new RewardEngineError("NOT_FOUND", "Collection not found.");

    if (collection.status !== CollectionStatus.PENDING) {
      // Prevents double-verification / double-reward on retry or race.
      throw new RewardEngineError(
        "ALREADY_PROCESSED",
        `Collection is already ${collection.status.toLowerCase()}; it cannot be verified again.`
      );
    }

    // Operator must be authorized at this specific collection point.
    const isScoped = await tx.collectionPointOperator.findFirst({
      where: { userId: operatorId, collectionPointId: collection.collectionPointId, status: "ACTIVE" },
    });
    if (!isScoped) {
      throw new RewardEngineError(
        "OPERATOR_NOT_SCOPED",
        "This operator is not authorized to verify collections at this collection point."
      );
    }

    const now = new Date();
    const rate = await getActiveRewardRate(
      tx,
      collection.wasteCategoryId,
      collection.collectionPoint.locationId,
      now
    );
    const conversion = await getActiveConversionRate(tx, now);
    const { multiplier, flatBonusBbc } = await getActiveBonusMultiplier(
      tx,
      collection.wasteCategoryId,
      collection.collectionPoint.locationId,
      now
    );

    const baseBbc = verifiedWeightKg * Number(rate.ratePerKgBbc);
    const amountBbc = baseBbc * multiplier + flatBonusBbc;

    const updatedCollection = await tx.collection.update({
      where: { id: collectionId },
      data: {
        verifiedWeightKg,
        status: CollectionStatus.VERIFIED,
        operatorId,
        verifiedAt: now,
      },
    });

    const rewardTransaction = await tx.rewardTransaction.create({
      data: {
        collectionId,
        participantId: collection.participantId,
        amountBbc,
        ngnPegAtCreate: conversion.ngnPerBbc,
        status: TransactionStatus.COMPLETED,
      },
    });

    await tx.participantBalance.upsert({
      where: { participantId: collection.participantId },
      create: { participantId: collection.participantId, balanceBbc: amountBbc },
      update: { balanceBbc: { increment: amountBbc } },
    });

    await tx.auditLog.create({
      data: {
        actorId: operatorId,
        action: "COLLECTION_VERIFIED",
        entityType: "Collection",
        entityId: collectionId,
        beforeState: { status: "PENDING" },
        afterState: {
          status: "VERIFIED",
          verifiedWeightKg,
          rewardAmountBbc: amountBbc,
          rewardRateId: rate.id,
        },
      },
    });

    return { collection: updatedCollection, rewardTransaction };
  });
}

/**
 * Reverses a completed reward transaction. This never deletes or mutates the
 * original transaction row — it marks it REVERSED, decrements the cached
 * balance, and writes an audit entry. History stays intact and inspectable.
 */
export async function reverseRewardTransaction(
  prisma: PrismaClient,
  params: { transactionId: string; adminId: string; reason: string }
) {
  const { transactionId, adminId, reason } = params;

  return prisma.$transaction(async (tx) => {
    const transaction = await tx.rewardTransaction.findUnique({ where: { id: transactionId } });
    if (!transaction) throw new RewardEngineError("NOT_FOUND", "Reward transaction not found.");
    if (transaction.status === TransactionStatus.REVERSED) {
      throw new RewardEngineError("ALREADY_REVERSED", "This transaction was already reversed.");
    }

    const now = new Date();
    const updated = await tx.rewardTransaction.update({
      where: { id: transactionId },
      data: {
        status: TransactionStatus.REVERSED,
        reversedAt: now,
        reversedBy: adminId,
        reversalReason: reason,
      },
    });

    await tx.participantBalance.update({
      where: { participantId: transaction.participantId },
      data: { balanceBbc: { decrement: transaction.amountBbc } },
    });

    await tx.collection.update({
      where: { id: transaction.collectionId },
      data: { status: CollectionStatus.CANCELLED },
    });

    await tx.auditLog.create({
      data: {
        actorId: adminId,
        action: "REWARD_TRANSACTION_REVERSED",
        entityType: "RewardTransaction",
        entityId: transactionId,
        beforeState: { status: "COMPLETED", amountBbc: transaction.amountBbc.toString() },
        afterState: { status: "REVERSED", reason },
      },
    });

    return updated;
  });
}

/** Pure display helper — converts a BBC amount to its current NGN equivalent.
 * Never used for anything that writes to the ledger; the ledger always
 * stores the peg that was active at creation time (ngnPegAtCreate). */
export function bbcToNgn(amountBbc: number, ngnPerBbc: number): number {
  return amountBbc * ngnPerBbc;
}
