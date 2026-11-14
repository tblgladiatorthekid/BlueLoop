import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, ApiError, apiErrorResponse } from "@/lib/auth/rbac";

const bodySchema = z.object({
  collectionPointId: z.string().min(1),
  organizationId: z.string().min(1),
  wasteCategoryId: z.string().min(1),
  weightKg: z.number().positive().max(10000),
});

/** Verified-but-not-yet-transferred inventory for one material at one point:
 * sum of verified collection weight minus sum of weight already committed
 * to a non-cancelled transfer. This is what makes "view accumulated
 * materials awaiting transfer" (PRD §4B) a real number instead of a guess,
 * and stops an operator from shipping out material that was never verified. */
async function getAvailableInventoryKg(
  collectionPointId: string,
  wasteCategoryId: string
): Promise<number> {
  const [verifiedAgg, transferredAgg] = await Promise.all([
    prisma.collection.aggregate({
      where: { collectionPointId, wasteCategoryId, status: "VERIFIED" },
      _sum: { verifiedWeightKg: true },
    }),
    prisma.materialTransfer.aggregate({
      where: { collectionPointId, wasteCategoryId, status: { not: "CANCELLED" } },
      _sum: { weightKg: true },
    }),
  ]);

  const verified = Number(verifiedAgg._sum.verifiedWeightKg ?? 0);
  const transferred = Number(transferredAgg._sum.weightKg ?? 0);
  return Math.max(0, verified - transferred);
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole(req, ["OPERATOR", "ADMIN"]);
    const body = bodySchema.parse(await req.json());

    if (session.role === "OPERATOR") {
      const isScoped = await prisma.collectionPointOperator.findFirst({
        where: { userId: session.sub, collectionPointId: body.collectionPointId, status: "ACTIVE" },
      });
      if (!isScoped) {
        throw new ApiError(403, "OPERATOR_NOT_SCOPED", "You are not authorized at this collection point.");
      }
    }

    const org = await prisma.organization.findUnique({
      where: { id: body.organizationId },
      include: { acceptedMaterials: true },
    });
    if (!org || org.status !== "ACTIVE") {
      throw new ApiError(400, "ORGANIZATION_UNAVAILABLE", "This recycling partner is not currently active.");
    }
    const accepts = org.acceptedMaterials.some((m) => m.wasteCategoryId === body.wasteCategoryId);
    if (!accepts) {
      throw new ApiError(400, "MATERIAL_NOT_ACCEPTED", "This partner does not accept this material type.");
    }

    const available = await getAvailableInventoryKg(body.collectionPointId, body.wasteCategoryId);
    if (body.weightKg > available) {
      throw new ApiError(
        400,
        "INSUFFICIENT_INVENTORY",
        `Only ${available.toFixed(2)}kg of this material is verified and available at this point.`
      );
    }

    const transfer = await prisma.materialTransfer.create({
      data: {
        collectionPointId: body.collectionPointId,
        organizationId: body.organizationId,
        wasteCategoryId: body.wasteCategoryId,
        weightKg: body.weightKg,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: session.sub,
        action: "TRANSFER_CREATED",
        entityType: "MaterialTransfer",
        entityId: transfer.id,
        afterState: { weightKg: body.weightKg, status: "PENDING" },
      },
    });

    return NextResponse.json({ transfer }, { status: 201 });
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

/** Lets an operator see accumulated, unshipped inventory by material for
 * their point(s) — directly answers PRD §4B ("view accumulated materials
 * awaiting transfer") rather than leaving it as an unimplemented promise. */
export async function GET(req: NextRequest) {
  try {
    const session = await requireRole(req, ["OPERATOR", "ADMIN"]);
    const collectionPointId = req.nextUrl.searchParams.get("collection_point_id");
    if (!collectionPointId) {
      throw new ApiError(400, "MISSING_PARAM", "collection_point_id is required.");
    }

    if (session.role === "OPERATOR") {
      const isScoped = await prisma.collectionPointOperator.findFirst({
        where: { userId: session.sub, collectionPointId, status: "ACTIVE" },
      });
      if (!isScoped) {
        throw new ApiError(403, "OPERATOR_NOT_SCOPED", "You are not authorized at this collection point.");
      }
    }

    const materials = await prisma.collectionPointMaterial.findMany({
      where: { collectionPointId },
      include: { wasteCategory: { select: { id: true, name: true, code: true } } },
    });

    const inventory = await Promise.all(
      materials.map(async (m) => ({
        wasteCategory: m.wasteCategory,
        availableKg: await getAvailableInventoryKg(collectionPointId, m.wasteCategoryId),
      }))
    );

    return NextResponse.json({ inventory: inventory.filter((i) => i.availableKg > 0) });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
