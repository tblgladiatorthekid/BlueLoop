import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, apiErrorResponse } from "@/lib/auth/rbac";

const PAGE_SIZE = 20;

export async function GET(req: NextRequest) {
  try {
    const session = await requireRole(req, ["PARTICIPANT"]);
    const cursor = req.nextUrl.searchParams.get("cursor") ?? undefined;

    const collections = await prisma.collection.findMany({
      where: { participantId: session.sub },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      include: {
        wasteCategory: { select: { name: true, code: true } },
        collectionPoint: { select: { name: true } },
        rewardTransaction: { select: { amountBbc: true, status: true } },
      },
    });

    const nextCursor = collections.length === PAGE_SIZE ? collections[collections.length - 1].id : null;

    return NextResponse.json({
      collections: collections.map((c) => ({
        id: c.id,
        status: c.status,
        wasteCategory: c.wasteCategory.name,
        collectionPoint: c.collectionPoint.name,
        submittedWeightKg: Number(c.submittedWeightKg),
        verifiedWeightKg: c.verifiedWeightKg ? Number(c.verifiedWeightKg) : null,
        rewardBbc: c.rewardTransaction && c.rewardTransaction.status === "COMPLETED" ? Number(c.rewardTransaction.amountBbc) : 0,
        createdAt: c.createdAt,
        verifiedAt: c.verifiedAt,
      })),
      nextCursor,
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
