import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, apiErrorResponse } from "@/lib/auth/rbac";
import { reverseRewardTransaction } from "@/lib/bluebank/rewardEngine";

const bodySchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireRole(req, ["ADMIN"]);
    const body = bodySchema.parse(await req.json());

    const reversed = await reverseRewardTransaction(prisma, {
      transactionId: params.id,
      adminId: session.sub,
      reason: body.reason,
    });

    return NextResponse.json({ transaction: reversed });
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
