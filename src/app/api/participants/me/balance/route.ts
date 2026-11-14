import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, apiErrorResponse } from "@/lib/auth/rbac";
import { bbcToNgn } from "@/lib/bluebank/rewardEngine";

export async function GET(req: NextRequest) {
  try {
    const session = await requireRole(req, ["PARTICIPANT"]);

    const [balance, currentPeg] = await Promise.all([
      prisma.participantBalance.findUnique({ where: { participantId: session.sub } }),
      prisma.bbcConversionRate.findFirst({
        where: { effectiveFrom: { lte: new Date() }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }] },
        orderBy: { effectiveFrom: "desc" },
      }),
    ]);

    const balanceBbc = balance ? Number(balance.balanceBbc) : 0;
    const ngnPerBbc = currentPeg ? Number(currentPeg.ngnPerBbc) : null;

    return NextResponse.json({
      balanceBbc,
      // Estimate only — for display purposes. The actual redemption/cash-out
      // flow (not built in MVP) will use the peg active at redemption time,
      // which may differ from this snapshot.
      estimatedNgn: ngnPerBbc !== null ? bbcToNgn(balanceBbc, ngnPerBbc) : null,
      updatedAt: balance?.updatedAt ?? null,
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
