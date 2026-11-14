import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, apiErrorResponse } from "@/lib/auth/rbac";

/**
 * Every number here comes straight from the ledger/collections tables via
 * aggregate queries — nothing is hand-calculated in a frontend or cached in
 * a way that could drift from the underlying transactions (PRD §21).
 */
export async function GET(req: NextRequest) {
  try {
    await requireRole(req, ["ADMIN"]);

    const locationId = req.nextUrl.searchParams.get("location_id") ?? undefined;
    const from = req.nextUrl.searchParams.get("from");
    const to = req.nextUrl.searchParams.get("to");
    const dateFilter = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    };
    const collectionWhere = {
      status: "VERIFIED" as const,
      ...(Object.keys(dateFilter).length ? { verifiedAt: dateFilter } : {}),
      ...(locationId ? { collectionPoint: { locationId } } : {}),
    };

    const [
      totalsByCategory,
      totalWeightAgg,
      activeParticipants,
      activeCollectionPoints,
      rewardsAgg,
      transfersAgg,
      hotspots,
    ] = await Promise.all([
      prisma.collection.groupBy({
        by: ["wasteCategoryId"],
        where: collectionWhere,
        _sum: { verifiedWeightKg: true },
        _count: true,
      }),
      prisma.collection.aggregate({ where: collectionWhere, _sum: { verifiedWeightKg: true } }),
      prisma.collection.findMany({
        where: collectionWhere,
        distinct: ["participantId"],
        select: { participantId: true },
      }),
      prisma.collectionPoint.count({
        where: { status: "ACTIVE", ...(locationId ? { locationId } : {}) },
      }),
      prisma.rewardTransaction.aggregate({
        where: { status: "COMPLETED", ...(Object.keys(dateFilter).length ? { createdAt: dateFilter } : {}) },
        _sum: { amountBbc: true },
      }),
      prisma.materialTransfer.aggregate({
        where: { status: "CONFIRMED" },
        _sum: { weightKg: true },
      }),
      prisma.collection.groupBy({
        by: ["collectionPointId"],
        where: collectionWhere,
        _sum: { verifiedWeightKg: true },
        _count: true,
        orderBy: { _sum: { verifiedWeightKg: "desc" } },
        take: 10,
      }),
    ]);

    const categoryIds = totalsByCategory.map((t) => t.wasteCategoryId);
    const pointIds = hotspots.map((h) => h.collectionPointId);
    const [categories, points] = await Promise.all([
      prisma.wasteCategory.findMany({ where: { id: { in: categoryIds } }, select: { id: true, name: true, code: true } }),
      prisma.collectionPoint.findMany({ where: { id: { in: pointIds } }, select: { id: true, name: true } }),
    ]);
    const categoryById = Object.fromEntries(categories.map((c) => [c.id, c]));
    const pointById = Object.fromEntries(points.map((p) => [p.id, p]));

    const totalWeightKg = Number(totalWeightAgg._sum.verifiedWeightKg ?? 0);
    const totalRewardsBbc = Number(rewardsAgg._sum.amountBbc ?? 0);

    return NextResponse.json({
      totalWeightRecoveredKg: totalWeightKg,
      byCategory: totalsByCategory.map((t) => ({
        wasteCategory: categoryById[t.wasteCategoryId] ?? null,
        weightKg: Number(t._sum.verifiedWeightKg ?? 0),
        transactionCount: t._count,
      })),
      activeParticipants: activeParticipants.length,
      activeCollectionPoints,
      totalRewardsPaidBbc: totalRewardsBbc,
      rewardCostPerKgBbc: totalWeightKg > 0 ? totalRewardsBbc / totalWeightKg : null,
      weightTransferredToRecyclingKg: Number(transfersAgg._sum.weightKg ?? 0),
      hotspots: hotspots.map((h) => ({
        collectionPoint: pointById[h.collectionPointId] ?? null,
        weightKg: Number(h._sum.verifiedWeightKg ?? 0),
        transactionCount: h._count,
      })),
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
