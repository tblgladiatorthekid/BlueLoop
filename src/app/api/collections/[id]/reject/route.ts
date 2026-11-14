import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, ApiError, apiErrorResponse } from "@/lib/auth/rbac";

const bodySchema = z.object({
  reason: z.string().trim().min(1).max(300),
});

/**
 * Mirrors the scoping and status-guard logic in verifyCollectionAndReward()
 * on purpose — an operator who can't verify at a point shouldn't be able to
 * reject there either, and a non-PENDING collection shouldn't be touchable
 * by either action.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireRole(req, ["OPERATOR"]);
    const body = bodySchema.parse(await req.json());

    const result = await prisma.$transaction(async (tx) => {
      const collection = await tx.collection.findUnique({ where: { id: params.id } });
      if (!collection) throw new ApiError(404, "NOT_FOUND", "Collection not found.");

      if (collection.status !== "PENDING") {
        throw new ApiError(
          409,
          "ALREADY_PROCESSED",
          `Collection is already ${collection.status.toLowerCase()}; it cannot be rejected.`
        );
      }

      const isScoped = await tx.collectionPointOperator.findFirst({
        where: { userId: session.sub, collectionPointId: collection.collectionPointId, status: "ACTIVE" },
      });
      if (!isScoped) {
        throw new ApiError(403, "OPERATOR_NOT_SCOPED", "You are not authorized at this collection point.");
      }

      const updated = await tx.collection.update({
        where: { id: params.id },
        data: { status: "REJECTED", operatorId: session.sub, verifiedAt: new Date() },
      });

      await tx.auditLog.create({
        data: {
          actorId: session.sub,
          action: "COLLECTION_REJECTED",
          entityType: "Collection",
          entityId: params.id,
          beforeState: { status: "PENDING" },
          afterState: { status: "REJECTED", reason: body.reason },
        },
      });

      return updated;
    });

    return NextResponse.json({ collection: result });
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
