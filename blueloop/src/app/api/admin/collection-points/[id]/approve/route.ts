import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, ApiError, apiErrorResponse } from "@/lib/auth/rbac";

const bodySchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED"]),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireRole(req, ["ADMIN"]);
    const body = bodySchema.parse(await req.json());

    const point = await prisma.collectionPoint.findUnique({ where: { id: params.id } });
    if (!point) throw new ApiError(404, "NOT_FOUND", "Collection point not found.");

    const updated = await prisma.collectionPoint.update({
      where: { id: params.id },
      data: { status: body.status },
    });

    await prisma.auditLog.create({
      data: {
        actorId: session.sub,
        action: "COLLECTION_POINT_STATUS_CHANGED",
        entityType: "CollectionPoint",
        entityId: params.id,
        beforeState: { status: point.status },
        afterState: { status: body.status },
      },
    });

    return NextResponse.json({ collectionPoint: updated });
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
