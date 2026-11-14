import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, apiErrorResponse } from "@/lib/auth/rbac";

export async function GET(req: NextRequest) {
  try {
    await requireRole(req, ["ADMIN"]);
    const now = new Date();

    const rates = await prisma.rewardRate.findMany({
      where: { effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
      include: { wasteCategory: { select: { name: true, code: true } }, location: { select: { name: true } } },
      orderBy: { wasteCategoryId: "asc" },
    });

    return NextResponse.json({ rates });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

const createSchema = z.object({
  wasteCategoryId: z.string().min(1),
  locationId: z.string().min(1).optional(), // omit for a global (all-locations) rate
  ratePerKgBbc: z.number().min(0).max(1_000_000),
  sourceNote: z.string().trim().max(500).optional(),
});

/**
 * Sets a new rate for a material. This never overwrites the old row — it
 * closes the currently-active rate's window (effectiveTo = now) and opens a
 * new one, so every historical reward transaction stays tied to whichever
 * rate was actually active when it was earned (PRD §5, §9).
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireRole(req, ["ADMIN"]);
    const body = createSchema.parse(await req.json());
    const now = new Date();

    const newRate = await prisma.$transaction(async (tx) => {
      await tx.rewardRate.updateMany({
        where: {
          wasteCategoryId: body.wasteCategoryId,
          locationId: body.locationId ?? null,
          effectiveTo: null,
        },
        data: { effectiveTo: now },
      });

      return tx.rewardRate.create({
        data: {
          wasteCategoryId: body.wasteCategoryId,
          locationId: body.locationId,
          ratePerKgBbc: body.ratePerKgBbc,
          createdBy: session.sub,
          sourceNote: body.sourceNote,
          effectiveFrom: now,
        },
      });
    });

    await prisma.auditLog.create({
      data: {
        actorId: session.sub,
        action: "REWARD_RATE_CHANGED",
        entityType: "RewardRate",
        entityId: newRate.id,
        afterState: { ratePerKgBbc: body.ratePerKgBbc.toString(), wasteCategoryId: body.wasteCategoryId },
      },
    });

    return NextResponse.json({ rate: newRate }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "Invalid input.", issues: err.issues },
        { status: 400 }
      );
    }
    return apiErrorResponse(err);
  }
}
