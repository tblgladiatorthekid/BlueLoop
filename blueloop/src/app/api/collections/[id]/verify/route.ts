import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, apiErrorResponse } from "@/lib/auth/rbac";
import { verifyCollectionAndReward } from "@/lib/bluebank/rewardEngine";

const bodySchema = z.object({
  verifiedWeightKg: z.number().positive().max(1000),
});

/**
 * This route intentionally does almost nothing itself — auth, input
 * validation, then a single call into verifyCollectionAndReward(). All the
 * actual state-machine and scoping logic lives in the reward engine so
 * there is exactly one code path that can create a reward transaction.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireRole(req, ["OPERATOR"]);
    const body = bodySchema.parse(await req.json());

    const result = await verifyCollectionAndReward(prisma, {
      collectionId: params.id,
      operatorId: session.sub,
      verifiedWeightKg: body.verifiedWeightKg,
    });

    return NextResponse.json({
      collection: result.collection,
      rewardTransaction: result.rewardTransaction,
    });
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
