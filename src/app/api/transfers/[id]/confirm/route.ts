import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, ApiError, apiErrorResponse } from "@/lib/auth/rbac";

/**
 * Confirms receipt of a transfer. This is the only action that moves
 * material from "collected/verified" to "reached recycling" in BlueLoop's
 * data model — collection alone never implies recycling outcome (PRD §12).
 *
 * Scoped via OrganizationMember so a recycler user can only confirm
 * transfers addressed to their own organization, not any partner's.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireRole(req, ["RECYCLER", "ADMIN"]);

    const result = await prisma.$transaction(async (tx) => {
      const transfer = await tx.materialTransfer.findUnique({ where: { id: params.id } });
      if (!transfer) throw new ApiError(404, "NOT_FOUND", "Transfer not found.");

      if (transfer.status !== "PENDING") {
        throw new ApiError(
          409,
          "ALREADY_PROCESSED",
          `Transfer is already ${transfer.status.toLowerCase()}; it cannot be confirmed again.`
        );
      }

      if (session.role === "RECYCLER") {
        const isMember = await tx.organizationMember.findFirst({
          where: { userId: session.sub, organizationId: transfer.organizationId, status: "ACTIVE" },
        });
        if (!isMember) {
          throw new ApiError(403, "NOT_ORGANIZATION_MEMBER", "You are not authorized to confirm transfers for this organization.");
        }
      }

      const updated = await tx.materialTransfer.update({
        where: { id: params.id },
        data: { status: "CONFIRMED", confirmedAt: new Date(), confirmedBy: session.sub },
      });

      await tx.auditLog.create({
        data: {
          actorId: session.sub,
          action: "TRANSFER_CONFIRMED",
          entityType: "MaterialTransfer",
          entityId: params.id,
          beforeState: { status: "PENDING" },
          afterState: { status: "CONFIRMED" },
        },
      });

      return updated;
    });

    return NextResponse.json({ transfer: result });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
